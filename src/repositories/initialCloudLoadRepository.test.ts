import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { initialCloudLoadRepository } from './initialCloudLoadRepository';
import { outboxRepository } from './outboxRepository';
import { localDb } from '../services/db/localDb';
import type { OutboxEntry } from '../types/Sync';
import type { InitialCloudLoadOperation } from '../types/InitialCloudLoad';
import { buildInitialCloudLoadStateText } from '../domain/initialCloudLoadState';

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const EXCLUDED_CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const EXCLUDED_PRODUCT_ID = '88888888-8888-4888-8888-888888888888';
const MOVEMENT_ID = '99999999-9999-4999-8999-999999999999';
const NOW = '2026-07-25T12:00:00.000Z';

describe('repository da baseline remota da carga inicial', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('registra version 1 atomicamente e preserva dominio, outbox e movimentos', async () => {
    const category = makeCategory(CATEGORY_ID, BUSINESS_ID);
    const excludedCategory = makeCategory(EXCLUDED_CATEGORY_ID, BUSINESS_ID);
    const otherCategory = makeCategory(OTHER_CATEGORY_ID, OTHER_BUSINESS_ID);
    const product = makeProduct(PRODUCT_ID, BUSINESS_ID, CATEGORY_ID);
    const excludedProduct = makeProduct(EXCLUDED_PRODUCT_ID, BUSINESS_ID);
    const otherProduct = makeProduct(OTHER_PRODUCT_ID, OTHER_BUSINESS_ID, OTHER_CATEGORY_ID);
    const movement = {
      id: MOVEMENT_ID,
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      type: 'entrada' as const,
      quantity: 5,
      note: 'historico local',
      date: NOW,
      previousQuantity: 0,
      resultingQuantity: 5,
      syncStatus: 'synced' as const,
    };
    const outbox = makeOutbox(product);
    await localDb.categories.bulkAdd([category, excludedCategory, otherCategory]);
    await localDb.products.bulkAdd([product, excludedProduct, otherProduct]);
    await localDb.movements.add(movement);
    await localDb.outbox.add(outbox);

    await initialCloudLoadRepository.applyRemoteBaseline({
      businessId: BUSINESS_ID,
      categoryIds: [CATEGORY_ID],
      productIds: [PRODUCT_ID],
      remoteVersion: 1,
    });

    expect(await localDb.categories.get(CATEGORY_ID)).toEqual({
      ...category,
      remoteVersion: 1,
    });
    expect(await localDb.products.get(PRODUCT_ID)).toEqual({
      ...product,
      remoteVersion: 1,
    });
    expect(await localDb.categories.get(EXCLUDED_CATEGORY_ID)).toEqual(excludedCategory);
    expect(await localDb.products.get(EXCLUDED_PRODUCT_ID)).toEqual(excludedProduct);
    expect(await localDb.categories.get(OTHER_CATEGORY_ID)).toEqual(otherCategory);
    expect(await localDb.products.get(OTHER_PRODUCT_ID)).toEqual(otherProduct);
    expect(await localDb.movements.get(MOVEMENT_ID)).toEqual(movement);
    expect(await localDb.outbox.toArray()).toEqual([outbox]);
  });

  it('preserva pendencia e syncStatus quando surgiu durante a RPC', async () => {
    const category = makeCategory(CATEGORY_ID, BUSINESS_ID, 'pending');
    const product = makeProduct(PRODUCT_ID, BUSINESS_ID, undefined, 'error');
    const outbox = makeOutbox(product);
    await localDb.categories.add(category);
    await localDb.products.add(product);
    await localDb.outbox.add(outbox);

    await initialCloudLoadRepository.applyRemoteBaseline({
      businessId: BUSINESS_ID,
      categoryIds: [CATEGORY_ID],
      productIds: [PRODUCT_ID],
      remoteVersion: 1,
    });

    expect(await localDb.categories.get(CATEGORY_ID)).toMatchObject({
      syncStatus: 'pending',
      remoteVersion: 1,
    });
    expect(await localDb.products.get(PRODUCT_ID)).toMatchObject({
      syncStatus: 'error',
      remoteVersion: 1,
    });
    expect(await localDb.outbox.toArray()).toEqual([outbox]);
  });

  it('reverte toda a baseline quando um ID falta ou pertence a outro business', async () => {
    const category = makeCategory(CATEGORY_ID, BUSINESS_ID);
    const otherProduct = makeProduct(OTHER_PRODUCT_ID, OTHER_BUSINESS_ID);
    await localDb.categories.add(category);
    await localDb.products.add(otherProduct);

    await expect(initialCloudLoadRepository.applyRemoteBaseline({
      businessId: BUSINESS_ID,
      categoryIds: [CATEGORY_ID],
      productIds: [OTHER_PRODUCT_ID],
      remoteVersion: 1,
    })).rejects.toThrow(/estabelecimento correto/);

    expect((await localDb.categories.get(CATEGORY_ID))?.remoteVersion).toBeUndefined();
    expect((await localDb.products.get(OTHER_PRODUCT_ID))?.remoteVersion).toBeUndefined();
  });

  it('rejeita versao remota ausente, zero ou fracionaria', async () => {
    await expect(initialCloudLoadRepository.applyRemoteBaseline({
      businessId: BUSINESS_ID,
      categoryIds: [],
      productIds: [],
      remoteVersion: 0,
    })).rejects.toThrow(/inteiro positivo/);
    await expect(initialCloudLoadRepository.applyRemoteBaseline({
      businessId: BUSINESS_ID,
      categoryIds: [],
      productIds: [],
      remoteVersion: 1.5,
    })).rejects.toThrow(/inteiro positivo/);
  });

  it('baseline e monotonica para categoria e produto', async () => {
    const category = { ...makeCategory(CATEGORY_ID, BUSINESS_ID), remoteVersion: 2 };
    const product = { ...makeProduct(PRODUCT_ID, BUSINESS_ID), remoteVersion: 1 };
    await localDb.categories.add(category);
    await localDb.products.add(product);

    await initialCloudLoadRepository.applyRemoteBaseline({
      businessId: BUSINESS_ID,
      categoryIds: [CATEGORY_ID],
      productIds: [PRODUCT_ID],
      remoteVersion: 1,
    });

    expect(await localDb.categories.get(CATEGORY_ID)).toEqual(category);
    expect(await localDb.products.get(PRODUCT_ID)).toEqual(product);
  });

  it('remoteVersion local invalida reverte toda a baseline atomica', async () => {
    const category = makeCategory(CATEGORY_ID, BUSINESS_ID);
    const product = {
      ...makeProduct(PRODUCT_ID, BUSINESS_ID),
      remoteVersion: 0,
    };
    await localDb.categories.add(category);
    await localDb.products.add(product);

    await expect(
      initialCloudLoadRepository.applyRemoteBaseline({
        businessId: BUSINESS_ID,
        categoryIds: [CATEGORY_ID],
        productIds: [PRODUCT_ID],
        remoteVersion: 1,
      }),
    ).rejects.toThrow(/inteiro positivo/);

    expect(await localDb.categories.get(CATEGORY_ID)).toEqual(category);
    expect(await localDb.products.get(PRODUCT_ID)).toEqual(product);
  });

  it('reserva, absorve somente eventos do snapshot e preserva eventos posteriores', async () => {
    const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const category = { ...makeCategory(CATEGORY_ID, BUSINESS_ID), remoteVersion: 2 };
    const product = makeProduct(PRODUCT_ID, BUSINESS_ID, CATEGORY_ID);
    const movement = {
      id: MOVEMENT_ID,
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      type: 'entrada' as const,
      quantity: 5,
      note: 'historico',
      date: NOW,
      previousQuantity: 0,
      resultingQuantity: 5,
      syncStatus: 'pending' as const,
    };
    const productEvent = makeOutbox(product);
    const movementEvent: OutboxEntry = {
      ...makeOutbox(product),
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      entityType: 'movement',
      entityId: MOVEMENT_ID,
      operation: 'movement.created',
      payload: movement,
      status: 'error',
      attemptCount: 3,
      lastError: 'preservado',
      nextAttemptAt: '2026-07-25T13:00:00.000Z',
      idempotencyKey: 'movement-original-key',
    };
    await localDb.categories.add(category);
    await localDb.products.add(product);
    await localDb.movements.add(movement);
    await localDb.outbox.bulkAdd([productEvent, movementEvent]);
    const snapshot = await initialCloudLoadRepository.readSnapshot(BUSINESS_ID);
    const operation = makeOperation({
      userId,
      categoryIds: [CATEGORY_ID],
      productIds: [PRODUCT_ID],
      movementIds: [MOVEMENT_ID],
      reservedEventIds: [productEvent.id, movementEvent.id],
    });

    await initialCloudLoadRepository.reserveSnapshot({
      operation,
      expectedStateText: buildInitialCloudLoadStateText(snapshot, BUSINESS_ID),
    });
    expect(await localDb.outbox.get(productEvent.id)).toMatchObject({
      status: 'reserved',
      payload: productEvent.payload,
      idempotencyKey: productEvent.idempotencyKey,
      attemptCount: productEvent.attemptCount,
      createdAt: productEvent.createdAt,
      updatedAt: productEvent.updatedAt,
    });
    expect(await localDb.outbox.get(movementEvent.id)).toMatchObject({
      status: 'reserved',
      lastError: 'preservado',
      nextAttemptAt: movementEvent.nextAttemptAt,
    });

    const postSnapshotEvent: OutboxEntry = {
      ...productEvent,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
      operation: 'product.updated',
      idempotencyKey: 'post-snapshot',
      createdAt: '2026-07-25T12:01:00.000Z',
      updatedAt: '2026-07-25T12:01:00.000Z',
    };
    await localDb.outbox.add(postSnapshotEvent);
    await initialCloudLoadRepository.markRemoteConfirmed(operation.id, {
      categories: 1,
      products: 1,
      wasDuplicate: false,
    });
    await initialCloudLoadRepository.finalizeReservedSnapshot({
      operationId: operation.id,
      absorbedAt: '2026-07-25T12:02:00.000Z',
      remoteVersion: 1,
    });

    expect(await localDb.outbox.get(productEvent.id)).toMatchObject({
      status: 'absorbed',
      bootstrapAbsorption: {
        operationId: operation.id,
        reason: 'initial-cloud-load-snapshot',
      },
    });
    expect(await localDb.outbox.get(movementEvent.id)).toMatchObject({
      status: 'absorbed',
      operation: 'movement.created',
      idempotencyKey: 'movement-original-key',
      attemptCount: 3,
    });
    expect(await localDb.outbox.get(postSnapshotEvent.id)).toEqual(postSnapshotEvent);
    expect((await localDb.categories.get(CATEGORY_ID))?.remoteVersion).toBe(2);
    expect((await localDb.products.get(PRODUCT_ID))?.remoteVersion).toBe(1);
    expect(await localDb.movements.get(MOVEMENT_ID)).toEqual(movement);
    expect(await localDb.initialCloudLoads.get(operation.id)).toMatchObject({
      status: 'completed',
    });
  });

  it('falha antes do commit libera reserva e restaura status anterior', async () => {
    const product = makeProduct(PRODUCT_ID, BUSINESS_ID);
    const event = { ...makeOutbox(product), status: 'error' as const };
    await localDb.products.add(product);
    await localDb.outbox.add(event);
    const snapshot = await initialCloudLoadRepository.readSnapshot(BUSINESS_ID);
    const operation = makeOperation({
      categoryIds: [],
      productIds: [PRODUCT_ID],
      movementIds: [],
      reservedEventIds: [event.id],
    });
    await initialCloudLoadRepository.reserveSnapshot({
      operation,
      expectedStateText: buildInitialCloudLoadStateText(snapshot, BUSINESS_ID),
    });

    await initialCloudLoadRepository.releaseReservation(operation.id);

    expect(await localDb.outbox.get(event.id)).toEqual(event);
    expect(await localDb.initialCloudLoads.get(operation.id)).toBeUndefined();
  });

  it('releaseReservation libera evento posterior mesmo quando a reserva nao possui eventos', async () => {
    const snapshot = await initialCloudLoadRepository.readSnapshot(BUSINESS_ID);
    const operation = makeOperation();
    await initialCloudLoadRepository.reserveSnapshot({
      operation,
      expectedStateText: buildInitialCloudLoadStateText(snapshot, BUSINESS_ID),
    });
    const pending = makeOutbox(makeProduct(PRODUCT_ID, BUSINESS_ID));
    await localDb.outbox.add(pending);

    expect(
      await outboxRepository.claimEligible({
        now: NOW,
        batchSize: 10,
      }),
    ).toEqual([]);

    await initialCloudLoadRepository.releaseReservation(operation.id);

    expect(
      await outboxRepository.claimEligible({
        now: NOW,
        batchSize: 10,
      }),
    ).toEqual([expect.objectContaining({ id: pending.id, status: 'processing' })]);
  });

  it('finalizacao completed libera evento posterior sem depender de outbox reserved', async () => {
    const snapshot = await initialCloudLoadRepository.readSnapshot(BUSINESS_ID);
    const operation = makeOperation();
    await initialCloudLoadRepository.reserveSnapshot({
      operation,
      expectedStateText: buildInitialCloudLoadStateText(snapshot, BUSINESS_ID),
    });
    const pending = makeOutbox(makeProduct(PRODUCT_ID, BUSINESS_ID));
    await localDb.outbox.add(pending);
    await initialCloudLoadRepository.markRemoteConfirmed(operation.id, {
      categories: 0,
      products: 0,
      wasDuplicate: false,
    });
    await initialCloudLoadRepository.finalizeReservedSnapshot({
      operationId: operation.id,
      absorbedAt: NOW,
      remoteVersion: 1,
    });

    expect(await localDb.initialCloudLoads.get(operation.id)).toMatchObject({
      status: 'completed',
    });
    expect(
      await outboxRepository.claimEligible({
        now: NOW,
        batchSize: 10,
      }),
    ).toEqual([expect.objectContaining({ id: pending.id, status: 'processing' })]);
  });

  it('claim concorrente espera a reserva atomica e nao reivindica o evento', async () => {
    const product = makeProduct(PRODUCT_ID, BUSINESS_ID);
    const event = makeOutbox(product);
    await localDb.products.add(product);
    await localDb.outbox.add(event);
    const snapshot = await initialCloudLoadRepository.readSnapshot(BUSINESS_ID);
    const operation = makeOperation({
      productIds: [PRODUCT_ID],
      reservedEventIds: [event.id],
    });

    const reservation = initialCloudLoadRepository.reserveSnapshot({
      operation,
      expectedStateText: buildInitialCloudLoadStateText(snapshot, BUSINESS_ID),
    });
    const claim = outboxRepository.claimEligible({
      now: NOW,
      batchSize: 10,
    });
    const [, claimed] = await Promise.all([reservation, claim]);

    expect(claimed).toEqual([]);
    expect(await localDb.outbox.get(event.id)).toMatchObject({
      status: 'reserved',
      bootstrapReservation: { operationId: operation.id },
    });
  });

  it('rejeita reutilizacao de operacao completed com a mesma chave e payload', async () => {
    const snapshot = await initialCloudLoadRepository.readSnapshot(BUSINESS_ID);
    const operation = makeOperation();
    await initialCloudLoadRepository.reserveSnapshot({
      operation,
      expectedStateText: buildInitialCloudLoadStateText(snapshot, BUSINESS_ID),
    });
    await initialCloudLoadRepository.markRemoteConfirmed(operation.id, {
      categories: 0,
      products: 0,
      wasDuplicate: false,
    });
    await initialCloudLoadRepository.finalizeReservedSnapshot({
      operationId: operation.id,
      absorbedAt: NOW,
      remoteVersion: 1,
    });

    await expect(
      initialCloudLoadRepository.reserveSnapshot({
        operation,
        expectedStateText: buildInitialCloudLoadStateText(snapshot, BUSINESS_ID),
      }),
    ).rejects.toThrow(/concluida nao pode ser reutilizada/i);
  });
});

function makeCategory(
  id: string,
  businessId: string,
  syncStatus: 'pending' | 'synced' | 'error' = 'synced',
) {
  return {
    id,
    businessId,
    name: `Categoria ${id.slice(0, 4)}`,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus,
  };
}

function makeProduct(
  id: string,
  businessId: string,
  categoryId?: string,
  syncStatus: 'pending' | 'synced' | 'error' = 'synced',
) {
  return {
    id,
    businessId,
    name: `Produto ${id.slice(0, 4)}`,
    code: id.slice(0, 8),
    ...(categoryId ? { categoryId } : {}),
    salePriceInCents: 1599,
    currentQuantity: 5,
    minimumStock: 2,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus,
  };
}

function makeOutbox(product: ReturnType<typeof makeProduct>): OutboxEntry {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    entityType: 'product',
    entityId: product.id,
    operation: 'product.updated',
    payload: product,
    status: 'pending',
    attemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    businessId: BUSINESS_ID,
    idempotencyKey: 'pending-after-bootstrap',
  };
}

function makeOperation(
  changes: Partial<InitialCloudLoadOperation> = {},
): InitialCloudLoadOperation {
  return {
    id: 'inventory-bootstrap:cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    businessId: BUSINESS_ID,
    businessName: 'Loja',
    status: 'reserved',
    idempotencyKey:
      'inventory-bootstrap:cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    payloadText: '{"categories":[],"products":[]}',
    payloadHash: 'a'.repeat(64),
    localSignature: 'b'.repeat(64),
    categoryIds: [],
    productIds: [],
    movementIds: [],
    reservedEventIds: [],
    createdAt: NOW,
    ...changes,
  };
}
