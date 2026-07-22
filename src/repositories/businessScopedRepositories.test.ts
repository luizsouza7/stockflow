import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Category } from '../types/Category';
import type { Movement } from '../types/Movement';
import type { Product } from '../types/Product';
import { localDb } from '../services/db/localDb';
import { categoryRepository } from './categoryRepository';
import { movementRepository } from './movementRepository';
import { productRepository } from './productRepository';

const BUSINESS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUSINESS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = '2026-07-22T10:00:00.000Z';

describe('repositories com escopo local', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
    await localDb.categories.bulkAdd([
      category('11111111-1111-4111-8111-111111111111'),
      category('22222222-2222-4222-8222-222222222222', BUSINESS_A),
      category('33333333-3333-4333-8333-333333333333', BUSINESS_B),
      { ...category('44444444-4444-4444-8444-444444444444', BUSINESS_A), deletedAt: NOW },
    ]);
    await localDb.products.bulkAdd([
      product('55555555-5555-4555-8555-555555555555'),
      product('66666666-6666-4666-8666-666666666666', BUSINESS_A),
      product('77777777-7777-4777-8777-777777777777', BUSINESS_B),
      { ...product('88888888-8888-4888-8888-888888888888', BUSINESS_A), deletedAt: NOW },
    ]);
    await localDb.movements.bulkAdd([
      movement('99999999-9999-4999-8999-999999999999', '55555555-5555-4555-8555-555555555555'),
      movement('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', BUSINESS_A),
      movement('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', '77777777-7777-4777-8777-777777777777', BUSINESS_B),
    ]);
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('lista somente entidades unscoped sem misturar business', async () => {
    expect((await categoryRepository.findAllUnscoped()).map(({ id }) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect((await productRepository.findAllUnscoped()).map(({ id }) => id)).toEqual([
      '55555555-5555-4555-8555-555555555555',
    ]);
    expect((await movementRepository.findAllUnscopedNewestFirst()).map(({ id }) => id)).toEqual([
      '99999999-9999-4999-8999-999999999999',
    ]);
  });

  it('usa indices businessId sem misturar legado ou outro business', async () => {
    expect((await categoryRepository.findAllForBusiness(BUSINESS_A)).map(({ businessId }) => businessId))
      .toEqual([BUSINESS_A, BUSINESS_A]);
    expect((await productRepository.findAllForBusiness(BUSINESS_A)).map(({ businessId }) => businessId))
      .toEqual([BUSINESS_A, BUSINESS_A]);
    expect((await movementRepository.findAllForBusinessNewestFirst(BUSINESS_A)).map(({ businessId }) => businessId))
      .toEqual([BUSINESS_A]);
  });

  it('consultas ativas scoped preservam soft delete', async () => {
    expect(await categoryRepository.findAllActiveForBusiness(BUSINESS_A)).toHaveLength(1);
    expect(await productRepository.findAllActiveForBusiness(BUSINESS_A)).toHaveLength(1);
  });

  it('lookup scoped nao retorna entidade de outro business ou legado', async () => {
    expect(await categoryRepository.findByIdForBusiness('33333333-3333-4333-8333-333333333333', BUSINESS_A)).toBeUndefined();
    expect(await categoryRepository.findByIdForBusiness('11111111-1111-4111-8111-111111111111', BUSINESS_A)).toBeUndefined();
    expect(await productRepository.findByIdForBusiness('77777777-7777-4777-8777-777777777777', BUSINESS_A)).toBeUndefined();
    expect(await productRepository.findByIdForBusiness('55555555-5555-4555-8555-555555555555', BUSINESS_A)).toBeUndefined();
  });

  it('lookup unscoped nao retorna entidade scoped', async () => {
    expect(await categoryRepository.findUnscopedById('22222222-2222-4222-8222-222222222222')).toBeUndefined();
    expect(await productRepository.findUnscopedById('66666666-6666-4666-8666-666666666666')).toBeUndefined();
  });
});

function category(id: string, businessId?: string): Category {
  return { id, ...(businessId ? { businessId } : {}), name: id, createdAt: NOW, updatedAt: NOW, syncStatus: 'synced' };
}

function product(id: string, businessId?: string): Product {
  return {
    id,
    ...(businessId ? { businessId } : {}),
    name: id,
    code: id,
    salePriceInCents: 100,
    currentQuantity: 2,
    minimumStock: 1,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'synced',
  };
}

function movement(id: string, productId: string, businessId?: string): Movement {
  return {
    id,
    ...(businessId ? { businessId } : {}),
    productId,
    type: 'entrada',
    quantity: 1,
    note: '',
    date: NOW,
    previousQuantity: 1,
    resultingQuantity: 2,
    syncStatus: 'synced',
  };
}
