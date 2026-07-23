import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { Category } from '../../types/Category';
import type { Movement } from '../../types/Movement';
import type { Product } from '../../types/Product';
import type { OutboxEntry } from '../../types/Sync';
import type { BusinessContextService } from '../businessContextService';
import { localDb } from '../db/localDb';
import {
  createLegacyDataAssociationService,
  type LegacyDataAssociationService,
} from './legacyDataAssociationService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const BUSINESS_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BUSINESS_ID = '44444444-4444-4444-8444-444444444444';
const CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const MOVEMENT_ID = '77777777-7777-4777-8777-777777777777';
const NOW = '2026-07-23T10:00:00.000Z';

describe('associacao explicita integral de dados legados', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('preview conta entidades e eventos relacionados sem alterar nenhuma store', async () => {
    const fixtures = await seedLegacyDataset();
    const before = await snapshotDatabase();
    const { service } = createTestService();

    const result = await service.preview(validContext());

    expect(result.status).toBe('ready');
    expect(result.preview).toMatchObject({
      categories: 1,
      products: 1,
      movements: 1,
      relatedOutbox: 3,
      fullyUnscopedOutbox: 1,
      selectedBusinessOutbox: 2,
      blockers: [],
    });
    expect(await snapshotDatabase()).toEqual(before);
    expect(fixtures.outbox).toHaveLength(3);
  });

  it('preview vazio retorna mensagem adequada', async () => {
    const { service } = createTestService();
    const result = await service.preview(validContext());
    expect(result).toMatchObject({ status: 'empty', message: expect.stringMatching(/não há dados/i) });
  });

  it('preview detecta produto unscoped apontando para categoria scoped', async () => {
    await localDb.categories.add(category({ businessId: BUSINESS_ID }));
    await localDb.products.add(product());
    const { service } = createTestService();
    const result = await service.preview(validContext());
    expect(result.status).toBe('blocked');
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'product-category-scope' })]),
    );
  });

  it('preview detecta movimento orfao', async () => {
    await localDb.movements.add(movement({ productId: PRODUCT_ID }));
    const { service } = createTestService();
    const result = await service.preview(validContext());
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'movement-product-missing' })]),
    );
  });

  it('preview detecta movimento unscoped apontando para produto scoped', async () => {
    await localDb.products.add(product({ businessId: BUSINESS_ID, categoryId: undefined }));
    await localDb.movements.add(movement());
    const { service } = createTestService();
    const result = await service.preview(validContext());
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'movement-product-scope' })]),
    );
  });

  it('preview detecta evento relacionado de outro business', async () => {
    await localDb.categories.add(category());
    await localDb.outbox.add(outboxEntry({ businessId: OTHER_BUSINESS_ID }));
    const { service } = createTestService();
    const result = await service.preview(validContext());
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'outbox-business' })]),
    );
  });

  it('preview detecta evento relacionado de outro usuario', async () => {
    await localDb.categories.add(category());
    await localDb.outbox.add(outboxEntry({ userId: OTHER_USER_ID, businessId: BUSINESS_ID }));
    const { service } = createTestService();
    const result = await service.preview(validContext());
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'outbox-user' })]),
    );
  });

  it('preview detecta evento processing', async () => {
    await localDb.categories.add(category());
    await localDb.outbox.add(outboxEntry({ status: 'processing' }));
    const { service } = createTestService();
    const result = await service.preview(validContext());
    expect(result.preview?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'outbox-processing' })]),
    );
  });

  it.each([
    [{ userId: undefined }, /Entre na sua conta/],
    [{ businessId: undefined }, /Selecione e valide/],
    [{ isOnline: false }, /Conecte-se/],
  ])('bloqueia preview sem prerequisito: %o', async (override, message) => {
    const { service } = createTestService();
    const result = await service.preview({ ...validContext(), ...override });
    expect(result).toMatchObject({ status: 'blocked', message: expect.stringMatching(message) });
  });

  it('bloqueia sem Supabase configurado', async () => {
    const { service } = createTestService({ configured: false });
    const result = await service.preview(validContext());
    expect(result).toMatchObject({ status: 'blocked', message: expect.stringMatching(/Supabase/) });
  });

  it('bloqueia sessao divergente e membership invalida', async () => {
    const wrongSession = createTestService({ sessionUserId: OTHER_USER_ID });
    expect(await wrongSession.service.preview(validContext())).toMatchObject({ status: 'blocked' });
    expect(wrongSession.context.validateMembership).not.toHaveBeenCalled();

    const invalidMembership = createTestService({ validMembership: false });
    expect(await invalidMembership.service.preview(validContext())).toMatchObject({
      status: 'blocked',
      message: expect.stringMatching(/não pertence/),
    });
  });

  it('exige confirmacao e preview estavel', async () => {
    await seedLegacyDataset();
    const { service } = createTestService();
    const preview = await service.preview(validContext());

    expect(await service.associate({
      ...validContext(),
      confirmed: false,
      expectedSnapshotToken: preview.preview?.snapshotToken,
    })).toMatchObject({ status: 'blocked', message: expect.stringMatching(/Confirme/) });
    expect(await service.associate({
      ...validContext(),
      confirmed: true,
    })).toMatchObject({ status: 'blocked', message: expect.stringMatching(/prévia/) });
  });

  it('associa integralmente e preserva ids, relacoes, estoque, valores, snapshots e soft delete', async () => {
    await seedLegacyDataset();
    const before = await snapshotDatabase();
    const { service } = createTestService();
    const preview = await service.preview(validContext());

    const result = await associateFromPreview(service, preview.preview!.snapshotToken);
    const after = await snapshotDatabase();

    expect(result).toMatchObject({
      status: 'completed',
      associated: { categories: 1, products: 1, movements: 1, outboxUpdated: 2 },
    });
    expect(after.categories[0]).toEqual({ ...before.categories[0], businessId: BUSINESS_ID });
    expect(after.products[0]).toEqual({ ...before.products[0], businessId: BUSINESS_ID });
    expect(after.movements[0]).toEqual({ ...before.movements[0], businessId: BUSINESS_ID });
    expect(after.products[0]).toMatchObject({
      id: PRODUCT_ID,
      categoryId: CATEGORY_ID,
      currentQuantity: 7,
      minimumStock: 2,
      salePriceInCents: 1599,
      deletedAt: NOW,
    });
    expect(after.movements[0]).toMatchObject({
      id: MOVEMENT_ID,
      productId: PRODUCT_ID,
      previousQuantity: 5,
      resultingQuantity: 7,
    });
  });

  it('adapta somente contexto elegivel da outbox e preserva todos os demais campos', async () => {
    const { outbox } = await seedLegacyDataset();
    const { service } = createTestService();
    const preview = await service.preview(validContext());
    await associateFromPreview(service, preview.preview!.snapshotToken);
    const persisted = await localDb.outbox.orderBy('id').toArray();
    const originalById = new Map(outbox.map((entry) => [entry.id, entry]));

    for (const entry of persisted) {
      const original = originalById.get(entry.id)!;
      expect(entry).toEqual({
        ...original,
        userId: original.userId ?? USER_ID,
        businessId: original.businessId ?? BUSINESS_ID,
      });
    }
    expect(persisted).toHaveLength(outbox.length);
  });

  it.each([
    { outboxOverride: { businessId: OTHER_BUSINESS_ID }, label: 'outro business' },
    {
      outboxOverride: { userId: OTHER_USER_ID, businessId: BUSINESS_ID },
      label: 'outro user',
    },
    { outboxOverride: { status: 'processing' as const }, label: 'processing' },
  ])('bloqueador $label aborta todas as stores', async ({ outboxOverride }) => {
    await localDb.categories.add(category());
    await localDb.outbox.add(outboxEntry(outboxOverride));
    const before = await snapshotDatabase();
    const { service } = createTestService();
    const preview = await service.preview(validContext());
    const result = await associateFromPreview(service, preview.preview!.snapshotToken);
    expect(result.status).toBe('blocked');
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('aborta quando o estado muda depois da preview', async () => {
    await seedLegacyDataset();
    const { service } = createTestService();
    const preview = await service.preview(validContext());
    await localDb.categories.add(category({
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Nova após preview',
    }));
    const result = await associateFromPreview(service, preview.preview!.snapshotToken);
    expect(result).toMatchObject({ status: 'blocked', message: expect.stringMatching(/mudaram/) });
    expect((await localDb.categories.toArray()).every(({ businessId }) => !businessId)).toBe(true);
  });

  it('falha na outbox reverte categories, products e movements', async () => {
    await seedLegacyDataset();
    const before = await snapshotDatabase();
    const { service } = createTestService();
    const preview = await service.preview(validContext());
    const failure = vi.spyOn(localDb.outbox, 'bulkPut').mockRejectedValueOnce(new Error('falha simulada'));

    await expect(associateFromPreview(service, preview.preview!.snapshotToken)).rejects.toThrow();
    failure.mockRestore();
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('execucao repetida com nova preview e idempotente e nao cria outbox', async () => {
    await seedLegacyDataset();
    const { service } = createTestService();
    const firstPreview = await service.preview(validContext());
    await associateFromPreview(service, firstPreview.preview!.snapshotToken);
    const afterFirst = await snapshotDatabase();
    const secondPreview = await service.preview(validContext());
    const second = await associateFromPreview(service, secondPreview.preview!.snapshotToken);

    expect(second).toMatchObject({
      status: 'completed',
      associated: { categories: 0, products: 0, movements: 0, outboxUpdated: 0 },
    });
    expect(await snapshotDatabase()).toEqual(afterFirst);
    expect(localDb.verno).toBe(11);
  });

  it('entidades ja scoped permanecem integralmente intactas', async () => {
    await seedLegacyDataset();
    const scopedCategory = category({
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Scoped',
      businessId: OTHER_BUSINESS_ID,
    });
    const scopedProduct = product({
      id: '99999999-9999-4999-8999-999999999999',
      categoryId: scopedCategory.id,
      businessId: OTHER_BUSINESS_ID,
    });
    const scopedMovement = movement({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      productId: scopedProduct.id,
      businessId: OTHER_BUSINESS_ID,
    });
    await localDb.categories.add(scopedCategory);
    await localDb.products.add(scopedProduct);
    await localDb.movements.add(scopedMovement);
    const { service } = createTestService();
    const preview = await service.preview(validContext());
    await associateFromPreview(service, preview.preview!.snapshotToken);

    expect(await localDb.categories.get(scopedCategory.id)).toEqual(scopedCategory);
    expect(await localDb.products.get(scopedProduct.id)).toEqual(scopedProduct);
    expect(await localDb.movements.get(scopedMovement.id)).toEqual(scopedMovement);
  });
});

async function seedLegacyDataset() {
  const categories = [category({ deletedAt: NOW })];
  const products = [product({ deletedAt: NOW })];
  const movements = [movement()];
  const outbox = [
    outboxEntry({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    outboxEntry({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      entityType: 'product',
      entityId: PRODUCT_ID,
      operation: 'product.updated',
      payload: products[0],
      businessId: BUSINESS_ID,
      status: 'error',
      attemptCount: 3,
      lastError: 'erro preservado',
      nextAttemptAt: '2026-07-24T10:00:00.000Z',
    }),
    outboxEntry({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      entityType: 'movement',
      entityId: MOVEMENT_ID,
      operation: 'movement.created',
      payload: movements[0],
      userId: USER_ID,
      businessId: BUSINESS_ID,
    }),
  ];
  await localDb.categories.bulkAdd(categories);
  await localDb.products.bulkAdd(products);
  await localDb.movements.bulkAdd(movements);
  await localDb.outbox.bulkAdd(outbox);
  return { categories, products, movements, outbox };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: CATEGORY_ID,
    name: 'Legada',
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'pending',
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Produto legado',
    code: 'LEG-1',
    categoryId: CATEGORY_ID,
    salePriceInCents: 1599,
    currentQuantity: 7,
    minimumStock: 2,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'pending',
    ...overrides,
  };
}

function movement(overrides: Partial<Movement> = {}): Movement {
  return {
    id: MOVEMENT_ID,
    productId: PRODUCT_ID,
    type: 'entrada',
    quantity: 2,
    note: 'Histórico',
    date: NOW,
    previousQuantity: 5,
    resultingQuantity: 7,
    isLegacy: false,
    syncStatus: 'pending',
    ...overrides,
  } as Movement;
}

function outboxEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    entityType: 'category',
    entityId: CATEGORY_ID,
    operation: 'category.created',
    payload: category(),
    status: 'pending',
    attemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    idempotencyKey: `legacy:${overrides.id ?? 'category'}`,
    ...overrides,
  };
}

function createTestService(options: {
  configured?: boolean;
  sessionUserId?: string;
  validMembership?: boolean;
} = {}) {
  const configured = options.configured ?? true;
  const context = {
    isConfigured: vi.fn<BusinessContextService['isConfigured']>().mockReturnValue(configured),
    listAvailable: vi.fn<BusinessContextService['listAvailable']>().mockResolvedValue([]),
    validateMembership: vi
      .fn<BusinessContextService['validateMembership']>()
      .mockResolvedValue(options.validMembership ?? true),
    select: vi.fn<BusinessContextService['select']>(),
    getSelected: vi.fn<BusinessContextService['getSelected']>(),
    clearSelected: vi.fn<BusinessContextService['clearSelected']>(),
  };
  const sessionService = {
    isConfigured: vi.fn().mockReturnValue(configured),
    getSession: vi.fn().mockResolvedValue(createSession(options.sessionUserId ?? USER_ID)),
  };
  return {
    service: createLegacyDataAssociationService(undefined, context, sessionService),
    context,
    sessionService,
  };
}

function createSession(userId: string): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'teste@stockflow.test',
      app_metadata: {},
      user_metadata: {},
      created_at: NOW,
    },
  };
}

function validContext() {
  return { userId: USER_ID, businessId: BUSINESS_ID, isOnline: true };
}

async function associateFromPreview(
  service: LegacyDataAssociationService,
  expectedSnapshotToken: string,
) {
  return service.associate({
    ...validContext(),
    confirmed: true,
    expectedSnapshotToken,
  });
}

async function snapshotDatabase() {
  const [categories, products, movements, outbox] = await Promise.all([
    localDb.categories.orderBy('id').toArray(),
    localDb.products.orderBy('id').toArray(),
    localDb.movements.orderBy('id').toArray(),
    localDb.outbox.orderBy('id').toArray(),
  ]);
  return { categories, products, movements, outbox };
}
