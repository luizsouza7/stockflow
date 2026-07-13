import type { Product } from '../types/Product';

export type StockStatus = 'out-of-stock' | 'low-stock' | 'normal';

type StockLevel = Pick<Product, 'currentQuantity' | 'minimumStock'>;

export function getStockStatus(product: StockLevel): StockStatus {
  if (product.currentQuantity === 0) {
    return 'out-of-stock';
  }

  if (product.currentQuantity <= product.minimumStock) {
    return 'low-stock';
  }

  return 'normal';
}

export function isLowStock(product: StockLevel): boolean {
  return getStockStatus(product) === 'low-stock';
}

export function isOutOfStock(product: StockLevel): boolean {
  return getStockStatus(product) === 'out-of-stock';
}

export function needsRestock(product: StockLevel): boolean {
  return getStockStatus(product) !== 'normal';
}
