import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { categoryService } from '../categoryService';
import { productService } from '../productService';
import { stockMovementService } from '../stockMovementService';
import { localDb } from '../db/localDb';
import { createInitialCloudLoadService } from './initialCloudLoadService';
import { createInitialCloudLoadGateway } from './initialCloudLoadGateway';
import { initialCloudLoadRepository } from '../../repositories/initialCloudLoadRepository';
import { createManualPushService } from './manualPushService';
import type { SyncRemoteGateway } from './syncRemoteGateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-07-25T12:00:00.000Z';
const CONTEXT = { kind: 'business', userId: USER_ID, businessId: BUSINESS_ID } as const;

describe('baseline remota depois da carga inicial', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
    await localDb.categories.add({
      id: CATEGORY_ID,
      businessId: BUSINESS_ID,
      name: 'Bebidas',
      createdAt: NOW,
      updatedAt: NOW,
      syncStatus: 'synced',
    });
    await localDb.products.add({
      id: PRODUCT_ID,
      businessId: BUSINESS_ID,
      name: 'Cafe',
      code: 'CAFE-1',
      salePriceInCents: 1599,
      currentQuantity: 5,
      minimumStock: 2,
      createdAt: NOW,
      updatedAt: NOW,
      syncStatus: 'synced',
    });
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it.each([
    ['category.updated', () => categoryService.updateForScope(CATEGORY_ID, 'Bebidas premium', CONTEXT)],
    ['category.deleted', () => categoryService.softDeleteForScope(CATEGORY_ID, CONTEXT)],
    ['product.updated', () => productService.updateForScope(PRODUCT_ID, { name: 'Cafe premium' }, CONTEXT)],
    ['product.deleted', () => productService.softDeleteForScope(PRODUCT_ID, CONTEXT)],
  ] as const)('%s usa version 1 sem outbox synced anterior', async (operation, mutate) => {
    await completeInitialLoad();
    expect(await localDb.outbox.count()).toBe(0);
    expect((await localDb.categories.get(CATEGORY_ID))?.remoteVersion).toBe(1);
    expect((await localDb.products.get(PRODUCT_ID))?.remoteVersion).toBe(1);

    await mutate();
    expect(await localDb.outbox.where('operation').equals(operation).count()).toBe(1);

    const gateway = createPushGateway();
    const push = createManualPushService(gateway, createBusinessContext(), createSessionService());
    const result = await push.push({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      isOnline: true,
    });

    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(gateway.push).toHaveBeenCalledWith(
      expect.objectContaining({ operation }),
      1,
    );
  });

  it('demonstra que push normal primeiro torna o remoto inelegivel, enquanto a outbox inicial e reservavel', async () => {
    await localDb.categories.clear();
    await localDb.products.clear();
    const categoryId = await categoryService.createForScope('Bebidas', CONTEXT);
    await productService.createForScope(
      {
        name: 'Cafe',
        code: 'CAFE-1',
        categoryId,
        salePriceInCents: 1599,
        currentQuantity: 5,
        minimumStock: 2,
        createdAt: NOW,
        updatedAt: NOW,
        syncStatus: 'pending',
      },
      CONTEXT,
    );
    expect(await localDb.outbox.where('status').equals('pending').count()).toBe(2);

    const remoteState = {
      categories: 0,
      products: 0,
      movements: 0,
      syncOperations: 0,
      bootstrapCompleted: false,
    };
    const bootstrapGateway = {
      isConfigured: vi.fn(() => true),
      getRemoteState: vi.fn(async () => ({ ...remoteState })),
      initialize: vi.fn(),
    };
    const bootstrap = createInitialCloudLoadService(
      initialCloudLoadRepository,
      bootstrapGateway,
      createBusinessContext(),
      {
        isConfigured: vi.fn(() => true),
        getSession: createSessionService().getSession,
      },
    );
    const input = {
      userId: USER_ID,
      businessId: BUSINESS_ID,
      businessName: 'Loja Central',
      isOnline: true,
    };

    const beforePush = await bootstrap.preview(input);
    expect(beforePush).toMatchObject({
      status: 'ready',
      preview: {
        blockingOutbox: 0,
        reservableOutbox: 2,
        remoteState: 'empty',
      },
    });

    const normalGateway = createPushGateway();
    normalGateway.push.mockImplementation(async (entry) => {
      remoteState.syncOperations += 1;
      if (entry.entityType === 'category') remoteState.categories += 1;
      if (entry.entityType === 'product') remoteState.products += 1;
      return { remoteVersion: 1, wasDuplicate: false };
    });
    const push = createManualPushService(
      normalGateway,
      createBusinessContext(),
      createSessionService(),
    );
    await expect(
      push.push({
        userId: USER_ID,
        businessId: BUSINESS_ID,
        isOnline: true,
      }),
    ).resolves.toMatchObject({ succeeded: 2, failed: 0 });

    const afterPush = await bootstrap.preview(input);
    expect(afterPush).toMatchObject({
      status: 'blocked',
      preview: {
        remoteState: 'contains-data',
      },
    });
    expect(bootstrapGateway.initialize).not.toHaveBeenCalled();
  });

  it('reserva eventos do runtime, absorve historico e deixa evento pos-snapshot para push normal', async () => {
    await localDb.categories.clear();
    await localDb.products.clear();
    const categoryId = await categoryService.createForScope('Bebidas', CONTEXT);
    const productId = await productService.createForScope(
      {
        name: 'Cafe',
        code: 'CAFE-1',
        categoryId,
        salePriceInCents: 1599,
        currentQuantity: 5,
        minimumStock: 2,
        createdAt: NOW,
        updatedAt: NOW,
        syncStatus: 'pending',
      },
      CONTEXT,
    );
    await stockMovementService.registerForScope(
      {
        productId,
        type: 'entrada',
        quantity: 2,
        note: 'antes do snapshot',
        date: '2026-07-25T12:01:00.000Z',
        syncStatus: 'pending',
      },
      CONTEXT,
    );
    expect(await localDb.outbox.where('status').equals('pending').count()).toBe(3);

    let confirmRemote!: (value: {
      categories: number;
      products: number;
      wasDuplicate: boolean;
    }) => void;
    const initializeResult = new Promise<{
      categories: number;
      products: number;
      wasDuplicate: boolean;
    }>((resolve) => {
      confirmRemote = resolve;
    });
    const remoteGateway = {
      isConfigured: vi.fn(() => true),
      getRemoteState: vi.fn(async () => ({
        categories: 0,
        products: 0,
        movements: 0,
        syncOperations: 0,
        bootstrapCompleted: false,
      })),
      initialize: vi.fn(async () => initializeResult),
    };
    const bootstrap = createInitialCloudLoadService(
      initialCloudLoadRepository,
      remoteGateway,
      createBusinessContext(),
      {
        isConfigured: vi.fn(() => true),
        getSession: createSessionService().getSession,
      },
      () => '55555555-5555-4555-8555-555555555555',
    );
    const input = {
      userId: USER_ID,
      businessId: BUSINESS_ID,
      businessName: 'Loja Central',
      isOnline: true,
    };
    const preview = (await bootstrap.preview(input)).preview!;
    expect(preview).toMatchObject({
      eligible: true,
      reservableOutbox: 3,
      historicalMovements: 1,
    });

    const execution = bootstrap.execute({
      ...input,
      confirmed: true,
      preview,
    });
    await vi.waitFor(async () => {
      expect(await localDb.outbox.where('status').equals('reserved').count()).toBe(3);
    });

    await productService.updateForScope(
      productId,
      { name: 'Cafe premium' },
      CONTEXT,
    );
    await stockMovementService.registerForScope(
      {
        productId,
        type: 'entrada',
        quantity: 1,
        note: 'depois do snapshot',
        date: '2026-07-25T12:02:00.000Z',
        syncStatus: 'pending',
      },
      CONTEXT,
    );
    const pushGateway = createPushGateway();
    const push = createManualPushService(
      pushGateway,
      createBusinessContext(),
      createSessionService(),
    );
    await expect(
      push.push({
        userId: USER_ID,
        businessId: BUSINESS_ID,
        isOnline: true,
      }),
    ).resolves.toMatchObject({ claimed: 0 });
    expect(pushGateway.push).not.toHaveBeenCalled();

    confirmRemote({ categories: 1, products: 1, wasDuplicate: false });
    await expect(execution).resolves.toMatchObject({ status: 'completed' });
    expect(await localDb.outbox.where('status').equals('absorbed').count()).toBe(3);
    expect(await localDb.outbox.where('status').equals('pending').count()).toBe(2);
    expect(
      await localDb.outbox
        .where('operation')
        .equals('movement.created')
        .filter(({ status }) => status === 'absorbed')
        .count(),
    ).toBe(1);
    expect(await localDb.movements.count()).toBe(2);
    expect((await localDb.products.get(productId))?.currentQuantity).toBe(8);

    pushGateway.push.mockImplementation(async (entry) => {
      return entry.entityType === 'movement'
        ? {
            remoteVersion: 2,
            productVersion: 2,
            wasDuplicate: false,
          }
        : {
            remoteVersion: 3,
            wasDuplicate: false,
          };
    });
    await expect(
      push.push({
        userId: USER_ID,
        businessId: BUSINESS_ID,
        isOnline: true,
      }),
    ).resolves.toMatchObject({ succeeded: 2, failed: 0 });
    expect(pushGateway.push).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'movement.created',
        payload: expect.objectContaining({ note: 'depois do snapshot' }),
      }),
      undefined,
    );
    expect(pushGateway.push).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'product.updated' }),
      1,
    );
    expect(pushGateway.push).toHaveBeenCalledTimes(2);
  });

  it('retoma reserva apos reload com a mesma chave e repara por resposta duplicada', async () => {
    await localDb.categories.clear();
    await localDb.products.clear();
    await categoryService.createForScope('Bebidas', CONTEXT);
    const remoteCall = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '',
          message: 'TypeError: Failed to fetch',
        },
      })
      .mockResolvedValueOnce({
        data: [{
          category_count: 1,
          product_count: 0,
          was_duplicate: true,
        }],
        error: null,
      });
    const remoteGateway = createInitialCloudLoadGateway({ call: remoteCall });
    const gateway = {
      isConfigured: remoteGateway.isConfigured,
      getRemoteState: vi.fn(async () => ({
        categories: 0,
        products: 0,
        movements: 0,
        syncOperations: 0,
        bootstrapCompleted: false,
      })),
      initialize: remoteGateway.initialize,
    };
    const createBootstrap = () =>
      createInitialCloudLoadService(
        initialCloudLoadRepository,
        gateway,
        createBusinessContext(),
        {
          isConfigured: vi.fn(() => true),
          getSession: createSessionService().getSession,
        },
        () => '55555555-5555-4555-8555-555555555555',
      );
    const input = {
      userId: USER_ID,
      businessId: BUSINESS_ID,
      businessName: 'Loja Central',
      isOnline: true,
    };
    const firstService = createBootstrap();
    const preview = (await firstService.preview(input)).preview!;
    const first = await firstService.execute({
      ...input,
      confirmed: true,
      preview,
    });
    expect(first).toMatchObject({
      status: 'blocked',
      recoveryPreview: expect.objectContaining({
        reservationOperationId: preview.idempotencyKey,
      }),
    });
    expect(await localDb.outbox.where('status').equals('reserved').count()).toBe(1);
    expect(await localDb.initialCloudLoads.get(preview.idempotencyKey)).toMatchObject({
      status: 'reserved',
      payloadText: preview.payloadText,
      idempotencyKey: preview.idempotencyKey,
    });

    const reloadedService = createBootstrap();
    const recoveredPreview = (await reloadedService.preview(input)).preview!;
    expect(recoveredPreview).toMatchObject({
      reservationOperationId: preview.idempotencyKey,
      idempotencyKey: preview.idempotencyKey,
      payloadHash: preview.payloadHash,
    });
    await expect(
      reloadedService.execute({
        ...input,
        confirmed: true,
        preview: recoveredPreview,
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      result: { wasDuplicate: true },
    });

    expect(remoteCall).toHaveBeenCalledTimes(2);
    expect(remoteCall.mock.calls[1]).toEqual(remoteCall.mock.calls[0]);
    expect(await localDb.outbox.where('status').equals('absorbed').count()).toBe(1);
    expect((await localDb.categories.toCollection().first())?.remoteVersion).toBe(1);
  });
});

async function completeInitialLoad() {
  const remoteGateway = {
    isConfigured: vi.fn(() => true),
    getRemoteState: vi.fn(async () => ({
      categories: 0,
      products: 0,
      movements: 0,
      syncOperations: 0,
      bootstrapCompleted: false,
    })),
    initialize: vi.fn(async () => ({
      categories: 1,
      products: 1,
      wasDuplicate: false,
    })),
  };
  const service = createInitialCloudLoadService(
    initialCloudLoadRepository,
    remoteGateway,
    createBusinessContext(),
    {
      isConfigured: vi.fn(() => true),
      getSession: createSessionService().getSession,
    },
    () => '55555555-5555-4555-8555-555555555555',
  );
  const input = {
    userId: USER_ID,
    businessId: BUSINESS_ID,
    businessName: 'Loja Central',
    isOnline: true,
  };
  const preview = (await service.preview(input)).preview;
  expect(preview?.eligible).toBe(true);
  await expect(service.execute({ ...input, confirmed: true, preview })).resolves.toMatchObject({
    status: 'completed',
  });
}

function createPushGateway() {
  return {
    isConfigured: vi.fn<SyncRemoteGateway['isConfigured']>(() => true),
    push: vi.fn<SyncRemoteGateway['push']>(async () => ({
      remoteVersion: 2,
      wasDuplicate: false,
    })),
  };
}

function createBusinessContext() {
  return {
    isConfigured: vi.fn(() => true),
    listAvailable: vi.fn(async () => []),
    validateMembership: vi.fn(async () => true),
    select: vi.fn(async () => undefined),
    getSelected: vi.fn(),
    clearSelected: vi.fn(),
  };
}

function createSessionService() {
  return {
    getSession: vi.fn(async (): Promise<Session> => ({
      access_token: 'token-de-teste',
      refresh_token: 'refresh-de-teste',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'pessoa@stockflow.test',
        app_metadata: {},
        user_metadata: {},
        created_at: NOW,
      },
    })),
  };
}
