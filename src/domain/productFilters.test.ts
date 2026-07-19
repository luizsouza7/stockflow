import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_FILTERS,
  filterAndSortProducts,
  UNCATEGORIZED_FILTER,
  type ProductFilters,
} from './productFilters';
import type { ProductWithCategory } from '../types/Product';

const beverageId = '11111111-1111-4111-8111-111111111111';
const foodId = '22222222-2222-4222-8222-222222222222';

const products: ProductWithCategory[] = [
  product('Coca-Cola 2L', 'ABC123', 3, 5, 899, '2026-07-13T10:00:00.000Z', beverageId),
  product('Arroz', 'ARR-01', 12, 3, 2590, '2026-07-14T10:00:00.000Z', foodId),
  product('Agua', 'AGUA-0', 0, 2, 350, '2026-07-12T10:00:00.000Z'),
];

describe('filtros e ordenacao de produtos', () => {
  it.each([
    ['nome', { search: ' coca ' }, ['Coca-Cola 2L']],
    ['codigo', { search: 'ABC123' }, ['Coca-Cola 2L']],
    ['caixa', { search: 'cOcA-CoLa' }, ['Coca-Cola 2L']],
    ['consulta vazia', { search: '   ' }, ['Agua', 'Arroz', 'Coca-Cola 2L']],
  ])('busca por %s', (_scenario, changes, expectedNames) => {
    expect(run(changes).map((item) => item.name)).toEqual(expectedNames);
  });

  it('filtra por categoria especifica e por produtos sem categoria', () => {
    expect(run({ category: beverageId }).map((item) => item.name)).toEqual(['Coca-Cola 2L']);
    expect(run({ category: UNCATEGORIZED_FILTER }).map((item) => item.name)).toEqual(['Agua']);
  });

  it.each([
    ['normal', 'normal', ['Arroz']],
    ['estoque baixo', 'low-stock', ['Coca-Cola 2L']],
    ['sem estoque', 'out-of-stock', ['Agua']],
  ] as const)('filtra estoque %s pela classificacao centralizada', (_label, stockStatus, names) => {
    expect(run({ stockStatus }).map((item) => item.name)).toEqual(names);
  });

  it('combina busca, categoria e situacao de estoque', () => {
    expect(
      run({ search: 'coca', category: beverageId, stockStatus: 'low-stock' }).map(
        (item) => item.name,
      ),
    ).toEqual(['Coca-Cola 2L']);
    expect(run({ search: 'coca', category: foodId, stockStatus: 'low-stock' })).toEqual([]);
  });

  it.each([
    ['nome A-Z', 'name-asc', ['Agua', 'Arroz', 'Coca-Cola 2L']],
    ['nome Z-A', 'name-desc', ['Coca-Cola 2L', 'Arroz', 'Agua']],
    ['estoque menor', 'stock-asc', ['Agua', 'Coca-Cola 2L', 'Arroz']],
    ['estoque maior', 'stock-desc', ['Arroz', 'Coca-Cola 2L', 'Agua']],
    ['preco menor', 'price-asc', ['Agua', 'Coca-Cola 2L', 'Arroz']],
    ['preco maior', 'price-desc', ['Arroz', 'Coca-Cola 2L', 'Agua']],
    ['atualizacao recente', 'updated-desc', ['Arroz', 'Coca-Cola 2L', 'Agua']],
    ['atualizacao antiga', 'updated-asc', ['Agua', 'Coca-Cola 2L', 'Arroz']],
  ] as const)('ordena por %s', (_label, sort, expectedNames) => {
    expect(run({ sort }).map((item) => item.name)).toEqual(expectedNames);
  });
});

function run(changes: Partial<ProductFilters>) {
  return filterAndSortProducts(products, { ...DEFAULT_PRODUCT_FILTERS, ...changes });
}

function product(
  name: string,
  code: string,
  currentQuantity: number,
  minimumStock: number,
  salePriceInCents: number,
  updatedAt: string,
  categoryId?: string,
): ProductWithCategory {
  return {
    id: crypto.randomUUID(),
    name,
    code,
    categoryId,
    categoryName: categoryId ? 'Categoria' : 'Sem categoria',
    salePriceInCents,
    currentQuantity,
    minimumStock,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt,
    syncStatus: 'pending',
  };
}
