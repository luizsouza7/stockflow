import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { localDb } from './db/localDb';
import { getDashboardSummary, getDashboardSummaryForScope } from './dashboardService';
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

  it('isola dashboard local e business sem contaminar totais ou historico', async () => {
    const now = new Date().toISOString();
    const businessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const localId = await productService.createForScope(
      productInput(now, 'LOCAL', 0),
      { kind: 'local' },
    );
    const businessProductId = await productService.createForScope(
      productInput(now, 'BUSINESS', 5),
      { kind: 'business', userId, businessId },
    );
    await stockMovementService.registerForScope(
      movementInput(localId, now),
      { kind: 'local' },
    );
    await stockMovementService.registerForScope(
      movementInput(businessProductId, now),
      { kind: 'business', userId, businessId },
    );

    const local = await getDashboardSummaryForScope({ kind: 'local' });
    const business = await getDashboardSummaryForScope({ kind: 'business', businessId });
    expect(local).toMatchObject({ totalProducts: 1, totalOutOfStock: 0, totalMovements: 1 });
    expect(local.recentMovements[0]?.productCode).toBe('LOCAL');
    expect(business).toMatchObject({ totalProducts: 1, totalOutOfStock: 0, totalMovements: 1 });
    expect(business.recentMovements[0]?.productCode).toBe('BUSINESS');
  });
});

function productInput(now: string, code: string, quantity: number) {
  return {
    name: code,
    code,
    salePriceInCents: 100,
    currentQuantity: quantity,
    minimumStock: 0,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending' as const,
  };
}

function movementInput(productId: string, now: string) {
  return {
    productId,
    type: 'entrada' as const,
    quantity: 1,
    note: '',
    date: now,
    syncStatus: 'pending' as const,
  };
}
