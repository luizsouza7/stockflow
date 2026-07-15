// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { needsRestock } from '../domain/stockStatus';
import type { DashboardSummary } from '../services/dashboardService';
import type { ProductWithCategory } from '../types/Product';
import { Alerts } from './Alerts';
import { Dashboard } from './Dashboard';
import { Products } from './Products';

const mocks = vi.hoisted(() => ({
  useDexieQuery: vi.fn(),
}));

vi.mock('../hooks/useDexieQuery', () => ({ useDexieQuery: mocks.useDexieQuery }));

const idleQuery = { isLoading: false, error: undefined, refetch: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('apresentacao dos estados de estoque', () => {
  it('exibe estoque baixo e sem estoque separadamente no dashboard', () => {
    const summary: DashboardSummary = {
      totalProducts: 3,
      totalLowStock: 1,
      totalNeedingRestock: 2,
      totalOutOfStock: 1,
      totalMovements: 0,
      recentMovements: [],
    };
    mocks.useDexieQuery.mockReturnValue({ ...idleQuery, data: summary });

    render(<Dashboard />);

    expect(within(screen.getByText('Estoque baixo').parentElement!).getByText('1')).toBeTruthy();
    expect(within(screen.getByText('Sem estoque').parentElement!).getByText('1')).toBeTruthy();
    expect(screen.getByText('2 produto(s) precisam de reposicao.')).toBeTruthy();
  });

  it('mostra rotulos distintos para os tres estados na lista de produtos', () => {
    configureProductsQuery([
      product('Produto normal', 6, 5),
      product('Produto baixo', 5, 5),
      product('Produto zerado', 0, 5),
    ]);

    render(
      <MemoryRouter>
        <Products />
      </MemoryRouter>,
    );

    expect(within(productArticle('Produto normal')).getByText(/Normal/)).toBeTruthy();
    expect(within(productArticle('Produto baixo')).getByText(/Estoque baixo/)).toBeTruthy();
    expect(within(productArticle('Produto zerado')).getByText(/Sem estoque/)).toBeTruthy();
  });

  it('distingue alertas baixos e zerados e mantem produto normal fora da lista', () => {
    const products = [
      product('Produto baixo', 1, 2),
      product('Produto zerado', 0, 2),
      product('Produto normal', 3, 2),
    ];
    mocks.useDexieQuery.mockReturnValue({
      ...idleQuery,
      data: products.filter(needsRestock),
    });

    render(<Alerts />);

    expect(within(productArticle('Produto baixo')).getByText('Estoque baixo')).toBeTruthy();
    expect(within(productArticle('Produto zerado')).getByText('Sem estoque')).toBeTruthy();
    expect(screen.queryByText('Produto normal')).toBeNull();
  });
});

function configureProductsQuery(products: ProductWithCategory[]) {
  const results = [
    { ...idleQuery, data: products },
    { ...idleQuery, data: [] },
  ];
  let queryIndex = 0;
  mocks.useDexieQuery.mockImplementation(() => results[queryIndex++]);
}

function productArticle(name: string): HTMLElement {
  const article = screen.getByRole('heading', { name }).closest('article');
  expect(article).not.toBeNull();
  return article!;
}

function product(
  name: string,
  currentQuantity: number,
  minimumStock: number,
): ProductWithCategory {
  return {
    id: crypto.randomUUID(),
    name,
    code: name.toUpperCase().replace(/ /g, '-'),
    categoryName: 'Sem categoria',
    salePriceInCents: 1000,
    currentQuantity,
    minimumStock,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-15T10:00:00.000Z',
    syncStatus: 'pending',
  };
}
