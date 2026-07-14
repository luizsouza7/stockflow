import { describe, expect, it } from 'vitest';
import { getStockStatus, isLowStock, isOutOfStock, needsRestock } from './stockStatus';

describe('classificacao de estoque', () => {
  it.each([
    [{ currentQuantity: 0, minimumStock: 5 }, 'out-of-stock'],
    [{ currentQuantity: 2, minimumStock: 5 }, 'low-stock'],
    [{ currentQuantity: 5, minimumStock: 5 }, 'low-stock'],
    [{ currentQuantity: 6, minimumStock: 5 }, 'normal'],
    [{ currentQuantity: 0, minimumStock: 0 }, 'out-of-stock'],
    [{ currentQuantity: 1, minimumStock: 0 }, 'normal'],
  ] as const)('classifica %o como %s', (product, expected) => {
    expect(getStockStatus(product)).toBe(expected);
  });

  it('mantem as funcoes auxiliares consistentes', () => {
    const outOfStock = { currentQuantity: 0, minimumStock: 2 };
    const lowStock = { currentQuantity: 1, minimumStock: 2 };
    const normal = { currentQuantity: 3, minimumStock: 2 };

    expect(isOutOfStock(outOfStock)).toBe(true);
    expect(isLowStock(outOfStock)).toBe(false);
    expect(needsRestock(outOfStock)).toBe(true);
    expect(isLowStock(lowStock)).toBe(true);
    expect(needsRestock(lowStock)).toBe(true);
    expect(isLowStock(normal)).toBe(false);
    expect(isOutOfStock(normal)).toBe(false);
    expect(needsRestock(normal)).toBe(false);
  });
});
