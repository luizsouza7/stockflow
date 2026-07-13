import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { MovementType } from '../../types/Movement';
import { productService } from '../productService';
import { stockMovementService } from '../stockMovementService';
import { localDb } from './localDb';
import { formatCentsForInput, parseCurrencyToCents } from '../../utils/formatters';

async function createTestProduct(quantity = 5) {
  const now = new Date().toISOString();

  return productService.create({
    name: 'Arroz',
    code: 'ARROZ-001',
    category: 'Alimentos',
    salePriceInCents: 1990,
    currentQuantity: quantity,
    minimumStock: 2,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  });
}

async function move(productId: number, type: MovementType, quantity: number) {
  return stockMovementService.register({
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
    expect(await localDb.movements.toCollection().first()).toMatchObject({
      quantity: 3,
      previousQuantity: 5,
      resultingQuantity: 8,
      isLegacy: false,
    });
  });

  it('persiste um novo produto usando centavos inteiros', async () => {
    const productId = await createTestProduct();

    expect((await localDb.products.get(productId))?.salePriceInCents).toBe(1990);
  });

  it('edita e reabre o produto sem multiplicar o preco novamente', async () => {
    const productId = await createTestProduct();
    await productService.update(productId, { salePriceInCents: 1990 });

    localDb.close();
    await localDb.open();
    const savedProduct = await localDb.products.get(productId);
    const inputValue = formatCentsForInput(savedProduct?.salePriceInCents ?? -1);

    expect(inputValue).toBe('19,90');
    expect(parseCurrencyToCents(inputValue)).toBe(1990);
  });

  it('recusa persistencia de preco que nao esteja em centavos validos', async () => {
    const productId = await createTestProduct();

    await expect(productService.update(productId, { salePriceInCents: 19.9 })).rejects.toThrow(
      'O preco deve ser armazenado em centavos inteiros e nao negativos.',
    );
  });

  it('permite saida igual ao estoque disponivel', async () => {
    const productId = await createTestProduct();

    await move(productId, 'saida', 5);

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(0);
    expect(await localDb.movements.toCollection().first()).toMatchObject({
      previousQuantity: 5,
      resultingQuantity: 0,
    });
  });

  it('registra saida com os estoques anterior e resultante corretos', async () => {
    const productId = await createTestProduct(10);

    await move(productId, 'saida', 4);

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(6);
    expect(await localDb.movements.toCollection().first()).toMatchObject({
      quantity: 4,
      previousQuantity: 10,
      resultingQuantity: 6,
    });
  });

  it('encadeia snapshots de duas movimentacoes sequenciais', async () => {
    const productId = await createTestProduct(10);

    await move(productId, 'entrada', 5);
    await move(productId, 'saida', 3);

    const movements = await localDb.movements.orderBy('id').toArray();
    expect(movements[0]).toMatchObject({ previousQuantity: 10, resultingQuantity: 15 });
    expect(movements[1]).toMatchObject({ previousQuantity: 15, resultingQuantity: 12 });
    expect((await localDb.products.get(productId))?.currentQuantity).toBe(12);
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

    await productService.softDelete(productId);

    expect((await localDb.products.get(productId))?.deletedAt).toBeTruthy();
    expect(await localDb.movements.where('productId').equals(productId).count()).toBe(1);
    await expect(move(productId, 'entrada', 1)).rejects.toThrow('Produto nao encontrado.');
  });
});
