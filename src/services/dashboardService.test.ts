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
    await productService.create({
      name: 'Cafe',
      code: 'CAFE',
      salePriceInCents: 1000,
      currentQuantity: 0,
      minimumStock: 2,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await productService.create({
      name: 'Feijao',
      code: 'FEIJAO',
      salePriceInCents: 1500,
      currentQuantity: 2,
      minimumStock: 2,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    const deletedId = await productService.create({
      name: 'Arroz',
      code: 'ARROZ',
      salePriceInCents: 2000,
      currentQuantity: 10,
      minimumStock: 2,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await stockMovementService.register({
      productId: deletedId,
      type: 'entrada',
      quantity: 1,
      note: '',
      date: now,
      syncStatus: 'pending',
    });
    await productService.softDelete(deletedId);

    const summary = await getDashboardSummary();

    expect(summary).toMatchObject({
      totalProducts: 2,
      totalLowStock: 1,
      totalNeedingRestock: 2,
      totalOutOfStock: 1,
      totalMovements: 1,
    });
    expect(summary.recentMovements).toHaveLength(1);
  });
});
