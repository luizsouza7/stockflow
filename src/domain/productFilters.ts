import { getStockStatus, type StockStatus } from './stockStatus';
import type { ProductWithCategory } from '../types/Product';

export const UNCATEGORIZED_FILTER = 'uncategorized';

export type ProductCategoryFilter = 'all' | typeof UNCATEGORIZED_FILTER | string;
export type ProductStockFilter = 'all' | StockStatus;
export type ProductSort =
  | 'name-asc'
  | 'name-desc'
  | 'stock-asc'
  | 'stock-desc'
  | 'price-asc'
  | 'price-desc'
  | 'updated-desc'
  | 'updated-asc';

export interface ProductFilters {
  search: string;
  category: ProductCategoryFilter;
  stockStatus: ProductStockFilter;
  sort: ProductSort;
}

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  search: '',
  category: 'all',
  stockStatus: 'all',
  sort: 'name-asc',
};

export function filterAndSortProducts(
  products: ProductWithCategory[],
  filters: ProductFilters,
): ProductWithCategory[] {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('pt-BR');

  return products
    .filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
        product.code.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
      const matchesCategory =
        filters.category === 'all' ||
        (filters.category === UNCATEGORIZED_FILTER
          ? !product.categoryId
          : product.categoryId === filters.category);
      const matchesStock =
        filters.stockStatus === 'all' || getStockStatus(product) === filters.stockStatus;

      return matchesSearch && matchesCategory && matchesStock;
    })
    .map((product, originalIndex) => ({ product, originalIndex }))
    .sort((first, second) => {
      const comparison = compareProducts(first.product, second.product, filters.sort);
      return comparison || first.originalIndex - second.originalIndex;
    })
    .map(({ product }) => product);
}

export function hasActiveProductFilters(filters: ProductFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.category !== DEFAULT_PRODUCT_FILTERS.category ||
    filters.stockStatus !== DEFAULT_PRODUCT_FILTERS.stockStatus ||
    filters.sort !== DEFAULT_PRODUCT_FILTERS.sort
  );
}

function compareProducts(
  first: ProductWithCategory,
  second: ProductWithCategory,
  sort: ProductSort,
): number {
  switch (sort) {
    case 'name-desc':
      return compareText(second.name, first.name);
    case 'stock-asc':
      return first.currentQuantity - second.currentQuantity;
    case 'stock-desc':
      return second.currentQuantity - first.currentQuantity;
    case 'price-asc':
      return first.salePriceInCents - second.salePriceInCents;
    case 'price-desc':
      return second.salePriceInCents - first.salePriceInCents;
    case 'updated-desc':
      return timestamp(second.updatedAt) - timestamp(first.updatedAt);
    case 'updated-asc':
      return timestamp(first.updatedAt) - timestamp(second.updatedAt);
    case 'name-asc':
    default:
      return compareText(first.name, second.name);
  }
}

function compareText(first: string, second: string): number {
  return first.localeCompare(second, 'pt-BR', { sensitivity: 'base', numeric: true });
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
