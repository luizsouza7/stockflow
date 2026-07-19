import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outboxRepository } from '../repositories/outboxRepository';
import type { LegacyMovement } from '../types/Movement';
import { categoryService } from './categoryService';
import { localDb } from './db/localDb';
import { createOutboxEntry } from './outboxService';
import { productService } from './productService';
import { stockMovementService } from './stockMovementService';

async function createProduct(currentQuantity = 5) {
  const now = new Date().toISOString();
  return productService.create({
    name: 'Cafe',
    code: `CAFE-${crypto.randomUUID()}`,
    salePriceInCents: 1590,
    currentQuantity,
    minimumStock: 2,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  });
}

describe('outbox local transacional', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('gera eventos pending para criar, atualizar e excluir logicamente categoria', async () => {
    const categoryId = await categoryService.create('Bebidas');
    await categoryService.update(categoryId, 'Bebidas geladas');
    await categoryService.softDelete(categoryId);

    const events = await outboxRepository.findAll();
    expect(events.map((event) => event.operation)).toEqual([
      'category.created',
      'category.updated',
      'category.deleted',
    ]);
    expect(events.every((event) => event.status === 'pending')).toBe(true);
    expect(events.every((event) => event.entityId === categoryId)).toBe(true);
    expect(events[2]?.payload).toMatchObject({
      id: categoryId,
      name: 'Bebidas geladas',
      deletedAt: expect.any(String),
      syncStatus: 'pending',
    });
  });

  it('gera eventos com snapshot real para criar, atualizar e excluir produto', async () => {
    const productId = await createProduct();
    await productService.update(productId, { name: 'Cafe especial', salePriceInCents: 2599 });
    await productService.softDelete(productId);

    const events = await outboxRepository.findAll();
    expect(events.map((event) => event.operation)).toEqual([
      'product.created',
      'product.updated',
      'product.deleted',
    ]);
    expect(events[1]?.payload).toMatchObject({
      id: productId,
      name: 'Cafe especial',
      salePriceInCents: 2599,
      syncStatus: 'pending',
    });
    expect(events[2]?.payload).toMatchObject({
      id: productId,
      deletedAt: expect.any(String),
    });
  });

  it('registra movimento append-only com UUID e snapshots sem criar evento derivado de produto', async () => {
    const productId = await createProduct(10);
    await stockMovementService.register({
      productId,
      type: 'saida',
      quantity: 4,
      note: 'Venda',
      date: '2026-07-17T12:00:00.000Z',
      syncStatus: 'synced',
    });

    const events = await outboxRepository.findAll();
    const movementEvent = events.find((event) => event.operation === 'movement.created');
    expect(events.filter((event) => event.operation.startsWith('product.'))).toHaveLength(1);
    expect(movementEvent).toMatchObject({
      entityType: 'movement',
      entityId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      status: 'pending',
      attemptCount: 0,
      payload: {
        productId,
        previousQuantity: 10,
        resultingQuantity: 6,
        isLegacy: false,
        syncStatus: 'pending',
      },
    });
    expect((await localDb.products.get(productId))?.currentQuantity).toBe(6);
  });

  it('nao cria outbox quando a operacao local falha', async () => {
    await categoryService.create('Bebidas');
    const countBeforeFailure = await localDb.outbox.count();

    await expect(categoryService.create(' bebidas ')).rejects.toThrow(
      'Ja existe uma categoria ativa com este nome.',
    );

    expect(await localDb.categories.count()).toBe(1);
    expect(await localDb.outbox.count()).toBe(countBeforeFailure);
  });

  it('reverte categoria e produto quando a gravacao da outbox falha', async () => {
    vi.spyOn(outboxRepository, 'add').mockRejectedValueOnce(new Error('falha simulada'));
    await expect(categoryService.create('Higiene')).rejects.toThrow('falha simulada');
    expect(await localDb.categories.count()).toBe(0);

    vi.spyOn(outboxRepository, 'add').mockRejectedValueOnce(new Error('falha simulada'));
    await expect(createProduct()).rejects.toThrow('falha simulada');
    expect(await localDb.products.count()).toBe(0);
    expect(await localDb.outbox.count()).toBe(0);
  });

  it('reverte estoque e movimento quando a gravacao da outbox falha', async () => {
    const productId = await createProduct(5);
    vi.spyOn(outboxRepository, 'add').mockRejectedValueOnce(new Error('falha simulada'));

    await expect(
      stockMovementService.register({
        productId,
        type: 'entrada',
        quantity: 3,
        note: '',
        date: new Date().toISOString(),
        syncStatus: 'pending',
      }),
    ).rejects.toThrow('falha simulada');

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(5);
    expect(await localDb.movements.count()).toBe(0);
    expect(await localDb.outbox.count()).toBe(1);
  });

  it('gera timestamps validos e chave de idempotencia deterministica e unica', async () => {
    const categoryId = await categoryService.create('Frios');
    const event = (await outboxRepository.findAll())[0];

    expect(event?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Number.isFinite(Date.parse(event?.createdAt ?? ''))).toBe(true);
    expect(Number.isFinite(Date.parse(event?.updatedAt ?? ''))).toBe(true);
    expect(event?.idempotencyKey).toBe(
      `category:${categoryId}:category.created:${event?.createdAt}`,
    );

    if (!event) throw new Error('Evento esperado nao encontrado.');
    await expect(localDb.outbox.add({ ...event, id: crypto.randomUUID() })).rejects.toThrow();
    expect(await localDb.outbox.count()).toBe(1);
  });

  it('nao armazena senha, token, sessao, userId ou businessId inventados', async () => {
    await createProduct();
    const serialized = JSON.stringify(await outboxRepository.findAll()).toLocaleLowerCase('en-US');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('session');
    const event = (await outboxRepository.findAll())[0];
    expect(event?.userId).toBeUndefined();
    expect(event?.businessId).toBeUndefined();
  });

  it('preserva movimento legado sem inventar snapshots', () => {
    const legacyMovement: LegacyMovement = {
      id: crypto.randomUUID(),
      productId: crypto.randomUUID(),
      type: 'entrada',
      quantity: 2,
      note: 'Importado',
      date: '2025-01-01T00:00:00.000Z',
      syncStatus: 'pending',
      isLegacy: true,
    };
    const event = createOutboxEntry({
      entityType: 'movement',
      entityId: legacyMovement.id,
      operation: 'movement.created',
      payload: legacyMovement,
      occurredAt: legacyMovement.date,
    });

    expect(event.payload).toEqual(legacyMovement);
    expect(event.payload).not.toHaveProperty('previousQuantity');
    expect(event.payload).not.toHaveProperty('resultingQuantity');
  });
});
