import { isLowStock, isOutOfStock, needsRestock } from '../domain/stockStatus';
import { productRepository } from '../repositories/productRepository';
import type { MovementWithProduct } from '../types/Movement';
import { stockMovementService } from './stockMovementService';
import type { DataScopeReference } from '../domain/businessScope';

export interface DashboardSummary {
  totalProducts: number;
  totalLowStock: number;
  totalNeedingRestock: number;
  totalOutOfStock: number;
  totalMovements: number;
  recentMovements: MovementWithProduct[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [products, movements] = await Promise.all([
    productRepository.findAllActive(),
    stockMovementService.listHistory(),
  ]);

  return {
    totalProducts: products.length,
    totalLowStock: products.filter(isLowStock).length,
    totalNeedingRestock: products.filter(needsRestock).length,
    totalOutOfStock: products.filter(isOutOfStock).length,
    totalMovements: movements.length,
    recentMovements: movements.slice(0, 6),
  };
}

export async function getDashboardSummaryForScope(
  scope: DataScopeReference,
): Promise<DashboardSummary> {
  const [products, movements] = await Promise.all([
    productRepository.findAllActiveForScope(scope),
    stockMovementService.listHistoryForScope(scope),
  ]);

  return {
    totalProducts: products.length,
    totalLowStock: products.filter(isLowStock).length,
    totalNeedingRestock: products.filter(needsRestock).length,
    totalOutOfStock: products.filter(isOutOfStock).length,
    totalMovements: movements.length,
    recentMovements: movements.slice(0, 6),
  };
}
