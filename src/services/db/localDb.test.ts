import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { MovementType } from '../../types/Movement';
import { createProduct, deleteProduct, localDb, registerMovement } from './localDb';

async function createTestProduct(quantity = 5) {
  const now = new Date().toISOString();

  return createProduct({
    name: 'Arroz',
    code: 'ARROZ-001',
    category: 'Alimentos',
    price: 19.9,
    currentQuantity: quantity,
    minimumStock: 2,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  });
}

async function move(productId: number, type: MovementType, quantity: number) {
  return registerMovement({
    productId,
    type,
    quantity,
    note: '',
    date: new Date().toISOString(),
    syncStatus: 'pending',
  });
}

describe('regras locais de estoque', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('registra entrada e atualiza o estoque atomicamente', async () => {
    const productId = await createTestProduct();

    await move(productId, 'entrada', 3);

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(8);
    expect(await localDb.movements.count()).toBe(1);
  });

  it('permite saida igual ao estoque disponivel', async () => {
    const productId = await createTestProduct();

    await move(productId, 'saida', 5);

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(0);
  });

  it('recusa saida maior que o estoque sem deixar alteracao parcial', async () => {
    const productId = await createTestProduct();

    await expect(move(productId, 'saida', 6)).rejects.toThrow(
      'A saida nao pode ser maior que a quantidade disponivel.',
    );

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(5);
    expect(await localDb.movements.count()).toBe(0);
  });

  it.each([0, -1, 1.5])('recusa quantidade invalida (%s)', async (quantity) => {
    const productId = await createTestProduct();

    await expect(move(productId, 'entrada', quantity)).rejects.toThrow(
      'A quantidade deve ser um numero inteiro maior que zero.',
    );

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(5);
    expect(await localDb.movements.count()).toBe(0);
  });

  it('preserva produto e historico apos exclusao logica', async () => {
    const productId = await createTestProduct();
    await move(productId, 'entrada', 1);

    await deleteProduct(productId);

    expect((await localDb.products.get(productId))?.deletedAt).toBeTruthy();
    expect(await localDb.movements.where('productId').equals(productId).count()).toBe(1);
    await expect(move(productId, 'entrada', 1)).rejects.toThrow('Produto nao encontrado.');
  });
});
