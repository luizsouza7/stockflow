import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { outboxRepository } from '../repositories/outboxRepository';
import { categoryService } from './categoryService';
import { localDb } from './db/localDb';
import { productService } from './productService';
import { stockMovementService } from './stockMovementService';

const BUSINESS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUSINESS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = '2026-07-22T10:00:00.000Z';

describe('services com fundacao de escopo local', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('cria categoria scoped e grava o mesmo businessId na outbox atomica', async () => {
    const categoryId = await categoryService.createScoped('Bebidas', BUSINESS_A);
    const category = await localDb.categories.get(categoryId);
    const event = (await outboxRepository.findAll())[0];

    expect(category).toMatchObject({ id: categoryId, businessId: BUSINESS_A });
    expect(event).toMatchObject({ entityId: categoryId, businessId: BUSINESS_A });
    expect(event?.payload).toMatchObject({ id: categoryId, businessId: BUSINESS_A });
  });

  it('cria produto scoped com categoria do mesmo business e outbox coerente', async () => {
    const categoryId = await categoryService.createScoped('Bebidas', BUSINESS_A);
    const productId = await productService.createScoped(productInput({ categoryId }), BUSINESS_A);
    const product = await localDb.products.get(productId);
    const event = (await outboxRepository.findAll()).find(({ entityId }) => entityId === productId);

    expect(product).toMatchObject({ id: productId, categoryId, businessId: BUSINESS_A });
    expect(event).toMatchObject({ businessId: BUSINESS_A });
    expect(event?.payload).toMatchObject({ businessId: BUSINESS_A });
  });

  it('rejeita todas as combinacoes de categoria e produto com escopos diferentes', async () => {
    const unscopedCategory = await categoryService.create('Legada');
    const categoryA = await categoryService.createScoped('Business A', BUSINESS_A);
    const categoryB = await categoryService.createScoped('Business B', BUSINESS_B);

    await expect(productService.createScoped(productInput({ categoryId: categoryB }), BUSINESS_A))
      .rejects.toThrow('outro escopo local');
    await expect(productService.createScoped(productInput({ categoryId: unscopedCategory }), BUSINESS_A))
      .rejects.toThrow('outro escopo local');
    await expect(productService.create(productInput({ categoryId: categoryA })))
      .rejects.toThrow('outro escopo local');
    await expect(productService.create(productInput({ categoryId: unscopedCategory })))
      .resolves.toEqual(expect.any(String));
  });

  it('permite o mesmo nome e codigo em escopos diferentes, mas nao no mesmo business', async () => {
    await categoryService.createScoped('Bebidas', BUSINESS_A);
    await expect(categoryService.createScoped(' bebidas ', BUSINESS_B)).resolves.toEqual(expect.any(String));
    await productService.createScoped(productInput({ code: 'COD-1' }), BUSINESS_A);
    await expect(productService.createScoped(productInput({ code: 'cod-1', name: 'Outro' }), BUSINESS_B))
      .resolves.toEqual(expect.any(String));
    await expect(productService.createScoped(productInput({ code: ' cod-1 ', name: 'Duplicado' }), BUSINESS_A))
      .rejects.toThrow('Ja existe um produto ativo com este codigo.');
  });

  it('movimento herda businessId do produto e propaga o mesmo escopo para outbox', async () => {
    const productId = await productService.createScoped(productInput({ currentQuantity: 5 }), BUSINESS_A);

    await stockMovementService.register({
      productId,
      type: 'saida',
      quantity: 2,
      note: 'Venda',
      date: NOW,
      syncStatus: 'pending',
    });

    const movement = await localDb.movements.toCollection().first();
    const event = (await outboxRepository.findAll()).find(({ entityType }) => entityType === 'movement');
    expect(movement).toMatchObject({ businessId: BUSINESS_A, previousQuantity: 5, resultingQuantity: 3 });
    expect(event).toMatchObject({ businessId: BUSINESS_A });
    expect(event?.payload).toMatchObject({ businessId: BUSINESS_A });
  });

  it('ignora businessId arbitrario recebido em runtime no formulario de movimento', async () => {
    const productId = await productService.createScoped(productInput(), BUSINESS_A);
    const attemptedInput = {
      productId,
      businessId: BUSINESS_B,
      type: 'entrada' as const,
      quantity: 1,
      note: '',
      date: NOW,
      syncStatus: 'pending' as const,
    };

    await stockMovementService.register(attemptedInput);

    expect(await localDb.movements.toCollection().first()).toMatchObject({ businessId: BUSINESS_A });
  });

  it('updates e soft deletes preservam businessId original', async () => {
    const categoryId = await categoryService.createScoped('Bebidas', BUSINESS_A);
    const productId = await productService.createScoped(productInput({ categoryId }), BUSINESS_A);
    const attemptedUpdate = { name: 'Produto revisado', businessId: BUSINESS_B };

    await categoryService.update(categoryId, 'Bebidas frias');
    await productService.update(productId, attemptedUpdate);
    await productService.softDelete(productId);
    await categoryService.softDelete(categoryId);

    expect(await localDb.categories.get(categoryId)).toMatchObject({ businessId: BUSINESS_A, deletedAt: expect.any(String) });
    expect(await localDb.products.get(productId)).toMatchObject({ businessId: BUSINESS_A, deletedAt: expect.any(String) });
    expect((await outboxRepository.findAll()).every(({ businessId }) => businessId === BUSINESS_A)).toBe(true);
  });

  it('operacoes unscoped continuam offline e nao recebem businessId', async () => {
    const categoryId = await categoryService.create('Local');
    const productId = await productService.create(productInput({ categoryId, currentQuantity: 2 }));
    await stockMovementService.register({
      productId,
      type: 'entrada',
      quantity: 1,
      note: '',
      date: NOW,
      syncStatus: 'pending',
    });

    expect(await localDb.categories.get(categoryId)).not.toHaveProperty('businessId');
    expect(await localDb.products.get(productId)).not.toHaveProperty('businessId');
    expect(await localDb.movements.toCollection().first()).not.toHaveProperty('businessId');
    expect((await outboxRepository.findAll()).every(({ businessId }) => businessId === undefined)).toBe(true);
  });

  it('associar pendencias da 6C altera somente outbox e nunca faz backfill da entidade', async () => {
    const categoryId = await categoryService.create('Legada');
    const productId = await productService.create(productInput({ categoryId }));

    await outboxRepository.bindEligibleForContext({
      userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      businessId: BUSINESS_A,
      boundAt: '2026-07-22T11:00:00.000Z',
    });

    expect(await localDb.categories.get(categoryId)).not.toHaveProperty('businessId');
    expect(await localDb.products.get(productId)).not.toHaveProperty('businessId');
    expect((await outboxRepository.findAll()).every(({ businessId }) => businessId === BUSINESS_A)).toBe(true);
  });

  it('updates, soft deletes e movimentos scoped permanecem elegiveis para vinculo manual', async () => {
    const categoryId = await categoryService.createScoped('Scoped', BUSINESS_A);
    const productId = await productService.createScoped(
      productInput({ categoryId, currentQuantity: 5 }),
      BUSINESS_A,
    );
    await productService.update(productId, { name: 'Scoped atualizado' });
    await stockMovementService.register({
      productId,
      type: 'saida',
      quantity: 1,
      note: '',
      date: NOW,
      syncStatus: 'pending',
    });
    await productService.softDelete(productId);
    await categoryService.softDelete(categoryId);

    const entitiesBeforeBinding = {
      category: await localDb.categories.get(categoryId),
      product: await localDb.products.get(productId),
      movement: await localDb.movements.toCollection().first(),
    };
    const entriesBeforeBinding = await outboxRepository.findAll();
    expect(entriesBeforeBinding).toHaveLength(6);
    expect(entriesBeforeBinding.every(
      (entry) => entry.businessId === BUSINESS_A && entry.userId === undefined,
    )).toBe(true);
    expect(await outboxRepository.countEligibleForBinding(BUSINESS_A)).toBe(6);

    expect(await outboxRepository.bindEligibleForContext({
      userId: USER_A,
      businessId: BUSINESS_A,
      boundAt: '2026-07-22T12:00:00.000Z',
    })).toBe(6);

    expect((await outboxRepository.findAll()).every(
      (entry) => entry.businessId === BUSINESS_A && entry.userId === USER_A,
    )).toBe(true);
    expect(await localDb.categories.get(categoryId)).toEqual(entitiesBeforeBinding.category);
    expect(await localDb.products.get(productId)).toEqual(entitiesBeforeBinding.product);
    expect(await localDb.movements.toCollection().first()).toEqual(entitiesBeforeBinding.movement);
  });
});

function productInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Produto',
    code: `COD-${crypto.randomUUID()}`,
    salePriceInCents: 1000,
    currentQuantity: 5,
    minimumStock: 1,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'pending' as const,
    ...overrides,
  };
}
