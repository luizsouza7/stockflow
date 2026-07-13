import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { localDb } from './db/localDb';
import { getDashboardSummary } from './dashboardService';
import { productService } from './productService';
import { stockMovementService } from './stockMovementService';

describe('dashboardService', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('calcula indicadores usando apenas produtos ativos', async () => {
    const now = new Date().toISOString();
    const outOfStockId = await productService.create({
      name: 'Cafe',
      code: 'CAFE',
      category: 'Teste',
      salePriceInCents: 1000,
      currentQuantity: 0,
      minimumStock: 2,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    const activeId = await productService.create({
      name: 'Arroz',
      code: 'ARROZ',
      category: 'Teste',
      salePriceInCents: 2000,
      currentQuantity: 10,
      minimumStock: 2,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await productService.softDelete(activeId);
    await stockMovementService.register({
      productId: outOfStockId,
      type: 'entrada',
      quantity: 1,
      note: '',
      date: now,
      syncStatus: 'pending',
    });

    const summary = await getDashboardSummary();

    expect(summary).toMatchObject({
      totalProducts: 1,
      totalNeedingRestock: 1,
      totalOutOfStock: 0,
      totalMovements: 1,
    });
    expect(summary.recentMovements).toHaveLength(1);
  });
});
