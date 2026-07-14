// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Products } from './Products';
import { Movements } from './Movements';
import type { ProductWithCategory } from '../types/Product';
import type { MovementWithProduct } from '../types/Movement';

const mocks = vi.hoisted(() => ({
  useDexieQuery: vi.fn(),
  productDelete: vi.fn(),
  movementRegister: vi.fn(),
}));

vi.mock('../hooks/useDexieQuery', () => ({ useDexieQuery: mocks.useDexieQuery }));
vi.mock('../services/productService', () => ({
  productService: { listActive: vi.fn(), softDelete: mocks.productDelete },
}));
vi.mock('../services/categoryService', () => ({
  categoryService: { listActive: vi.fn() },
}));
vi.mock('../services/stockMovementService', () => ({
  stockMovementService: { listHistory: vi.fn(), register: mocks.movementRegister },
}));

const idleQuery = { isLoading: false, error: undefined, refetch: vi.fn() };
const beverageId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('controles de consulta das paginas', () => {
  it('combina filtros de produto e restaura a listagem ao limpar', () => {
    configureProductsQuery([
      product('Coca-Cola 2L', 'COCA', 2, 5, beverageId),
      product('Arroz', 'ARROZ', 10, 2),
    ]);
    renderPage(<Products />);

    fireEvent.change(screen.getByLabelText('Buscar por nome ou codigo'), {
      target: { value: 'coca' },
    });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: beverageId } });
    fireEvent.change(screen.getByLabelText('Situacao do estoque'), {
      target: { value: 'low-stock' },
    });

    expect(screen.getByText('Coca-Cola 2L')).toBeTruthy();
    expect(screen.queryByText('Arroz')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Arroz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('distingue ausencia total de produtos de filtro sem resultado', () => {
    configureProductsQuery([product('Arroz', 'ARROZ', 10, 2)]);
    const view = renderPage(<Products />);
    fireEvent.change(screen.getByLabelText('Buscar por nome ou codigo'), {
      target: { value: 'inexistente' },
    });
    expect(screen.getByText('Nenhum produto encontrado com os filtros atuais.')).toBeTruthy();

    view.unmount();
    configureProductsQuery([]);
    renderPage(<Products />);
    expect(screen.getByText('Nenhum produto cadastrado.')).toBeTruthy();
  });

  it('informa intervalo invalido sem apagar filtros e permite limpa-los', () => {
    configureMovementsQuery([product('Cafe', 'CAFE', 5, 1)], [movement('Entrada')]);
    renderPage(<Movements />);

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-07-15' } });
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-07-14' } });

    expect(
      screen.getByText('A data inicial nao pode ser posterior a data final.'),
    ).toBeTruthy();
    const startInput = screen.getByLabelText('Data inicial');
    expect(startInput).toHaveProperty('value', '2026-07-15');

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Entrada')).toBeTruthy();
  });

  it('distingue ausencia total de movimentos de filtros sem correspondencia', () => {
    configureMovementsQuery([product('Cafe', 'CAFE', 5, 1)], [movement('Entrada')]);
    const view = renderPage(<Movements />);
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'saida' } });
    expect(
      screen.getByText('Nenhuma movimentacao encontrada com os filtros atuais.'),
    ).toBeTruthy();

    view.unmount();
    configureMovementsQuery([product('Cafe', 'CAFE', 5, 1)], []);
    renderPage(<Movements />);
    expect(screen.getByText('Nenhuma movimentacao registrada.')).toBeTruthy();
  });
});

function configureProductsQuery(products: ProductWithCategory[]) {
  const productsResult = { ...idleQuery, data: products };
  const categoriesResult = {
    ...idleQuery,
    data: [
      {
        id: beverageId,
        name: 'Bebidas',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        syncStatus: 'pending',
      },
    ],
  };
  let queryCall = 0;
  mocks.useDexieQuery.mockImplementation(() => {
    queryCall += 1;
    return queryCall % 2 === 1 ? productsResult : categoriesResult;
  });
}

function configureMovementsQuery(
  products: ProductWithCategory[],
  movements: MovementWithProduct[],
) {
  const productsResult = { ...idleQuery, data: products };
  const movementsResult = { ...idleQuery, data: movements };
  let queryCall = 0;
  mocks.useDexieQuery.mockImplementation(() => {
    queryCall += 1;
    return queryCall % 2 === 1 ? productsResult : movementsResult;
  });
}

function renderPage(component: React.ReactNode) {
  return render(<MemoryRouter>{component}</MemoryRouter>);
}

function product(
  name: string,
  code: string,
  currentQuantity: number,
  minimumStock: number,
  categoryId?: string,
): ProductWithCategory {
  return {
    id: crypto.randomUUID(),
    name,
    code,
    categoryId,
    categoryName: categoryId ? 'Bebidas' : 'Sem categoria',
    salePriceInCents: 1000,
    currentQuantity,
    minimumStock,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-14T10:00:00.000Z',
    syncStatus: 'pending',
  };
}

function movement(note: string): MovementWithProduct {
  return {
    id: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    productName: 'Cafe',
    productCode: 'CAFE',
    type: 'entrada',
    quantity: 1,
    note,
    date: '2026-07-14T10:00:00.000Z',
    syncStatus: 'pending',
    isLegacy: false,
    previousQuantity: 4,
    resultingQuantity: 5,
  };
}
