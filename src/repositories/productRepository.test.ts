import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { localDb } from '../services/db/localDb';
import { productService } from '../services/productService';
import { productRepository } from './productRepository';

async function createProduct(name: string) {
  const now = new Date().toISOString();
  return productService.create({
    name,
    code: name.toUpperCase(),
    category: 'Teste',
    salePriceInCents: 1000,
    currentQuantity: 5,
    minimumStock: 2,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  });
}

describe('productRepository', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('busca produto por ID', async () => {
    const productId = await createProduct('Arroz');

    expect(await productRepository.findById(productId)).toMatchObject({
      id: productId,
      name: 'Arroz',
      salePriceInCents: 1000,
    });
  });

  it('soft delete preserva o registro e remove o produto da listagem ativa', async () => {
    const productId = await createProduct('Feijao');

    await productService.softDelete(productId);

    expect((await productRepository.findById(productId))?.deletedAt).toBeTruthy();
    expect(await productRepository.findAllActive()).toEqual([]);
  });

  it('filtra somente produtos excluidos sem afetar produtos ativos', async () => {
    const deletedId = await createProduct('Cafe');
    const activeId = await createProduct('Acucar');
    await productService.softDelete(deletedId);

    const activeProducts = await productRepository.findAllActive();

    expect(activeProducts).toHaveLength(1);
    expect(activeProducts[0]?.id).toBe(activeId);
  });
});
