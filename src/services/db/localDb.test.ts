import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { MovementType } from '../../types/Movement';
import { productService } from '../productService';
import { stockMovementService } from '../stockMovementService';
import { localDb } from './localDb';
import { formatCentsForInput, parseCurrencyToCents } from '../../utils/formatters';
import { categoryService } from '../categoryService';

async function createTestProduct(quantity = 5, code = crypto.randomUUID()) {
  const now = new Date().toISOString();

  return productService.create({
    name: 'Arroz',
    code,
    salePriceInCents: 1990,
    currentQuantity: quantity,
    minimumStock: 2,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  });
}

async function move(
  productId: string,
  type: MovementType,
  quantity: number,
  date = new Date().toISOString(),
) {
  return stockMovementService.register({
    productId,
    type,
    quantity,
    note: '',
    date,
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

    const movement = await localDb.movements.toCollection().first();

    expect((await localDb.products.get(productId))?.currentQuantity).toBe(8);
    expect(movement).toMatchObject({
      id: expect.any(String),
      productId,
      quantity: 3,
      previousQuantity: 5,
      resultingQuantity: 8,
      isLegacy: false,
    });
    expect(movement?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(movement?.id).not.toBe(productId);
  });

  it('persiste um novo produto usando centavos inteiros', async () => {
    const productId = await createTestProduct();

    expect(typeof productId).toBe('string');
    expect(productId).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await localDb.products.get(productId))?.salePriceInCents).toBe(1990);
  });

  it('gera UUIDs distintos para novos produtos antes da persistencia', async () => {
    const firstId = await createTestProduct();
    const secondId = await createTestProduct();

    expect(firstId).not.toBe(secondId);
    expect((await localDb.products.get(firstId))?.id).toBe(firstId);
    expect((await localDb.products.get(secondId))?.id).toBe(secondId);
  });

  it('usa primary keys UUID sem autoincremento para produtos e movimentacoes', () => {
    expect(localDb.products.schema.primKey).toMatchObject({ keyPath: 'id', auto: false });
    expect(localDb.movements.schema.primKey).toMatchObject({ keyPath: 'id', auto: false });
  });

  it('cria banco novo diretamente no schema final e persiste UUIDs apos reabertura', async () => {
    expect(localDb.verno).toBe(9);
    expect(localDb.tables.map((table) => table.name).sort()).toEqual([
      'categories',
      'movements',
      'products',
    ]);

    const categoryId = await categoryService.create('Bebidas');
    const now = '2026-07-13T12:00:00.000Z';
    const productId = await productService.create({
      name: 'Cafe',
      code: 'CAFE-FRESH',
      categoryId,
      salePriceInCents: 1590,
      currentQuantity: 10,
      minimumStock: 2,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await move(productId, 'entrada', 5, '2026-07-13T12:01:00.000Z');
    const movementBeforeReopen = await localDb.movements.toCollection().first();

    expect(productId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(movementBeforeReopen).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      productId,
      previousQuantity: 10,
      resultingQuantity: 15,
    });
    expect((await localDb.products.get(productId))?.categoryId).toBe(categoryId);
    expect((await localDb.categories.get(categoryId))?.id).toBe(categoryId);

    const movementId = movementBeforeReopen?.id;
    localDb.close();
    await localDb.open();

    expect(localDb.verno).toBe(9);
    expect((await localDb.products.get(productId))?.id).toBe(productId);
    expect((await localDb.categories.get(categoryId))?.id).toBe(categoryId);
    expect(await localDb.movements.get(movementId ?? '')).toMatchObject({
      id: movementId,
      productId,
      previousQuantity: 10,
      resultingQuantity: 15,
    });
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

    await move(productId, 'entrada', 5, '2026-07-13T10:00:00.000Z');
    await move(productId, 'saida', 3, '2026-07-13T10:01:00.000Z');

    const movements = await localDb.movements.orderBy('date').toArray();
    expect(movements[0]).toMatchObject({
      productId,
      previousQuantity: 10,
      resultingQuantity: 15,
    });
    expect(movements[1]).toMatchObject({
      productId,
      previousQuantity: 15,
      resultingQuantity: 12,
    });
    expect(movements[0]?.id).not.toBe(movements[1]?.id);
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
