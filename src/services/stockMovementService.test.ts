import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { localDb } from './db/localDb';
import { productService } from './productService';
import { stockMovementService } from './stockMovementService';

describe('stockMovementService', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('resolve em lote o produto excluido e preserva o snapshot no historico', async () => {
    const now = '2026-07-14T10:00:00.000Z';
    const productId = await productService.create({
      name: 'Cafe excluido',
      code: 'CAFE-X',
      salePriceInCents: 1000,
      currentQuantity: 4,
      minimumStock: 1,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await stockMovementService.register({
      productId,
      type: 'saida',
      quantity: 2,
      note: 'Venda historica',
      date: now,
      syncStatus: 'pending',
    });
    await productService.softDelete(productId);

    expect(await stockMovementService.listHistory()).toEqual([
      expect.objectContaining({
        productId,
        productName: 'Cafe excluido',
        productCode: 'CAFE-X',
        previousQuantity: 4,
        resultingQuantity: 2,
      }),
    ]);
  });
});
