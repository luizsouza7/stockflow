// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProductForm } from './ProductForm';
import { Movements } from './Movements';
import { Categories } from './Categories';
import { Products } from './Products';

const mocks = vi.hoisted(() => ({
  useDexieQuery: vi.fn(),
  productCreate: vi.fn(),
  productUpdate: vi.fn(),
  movementRegister: vi.fn(),
  categoryCreate: vi.fn(),
  categoryUpdate: vi.fn(),
  categoryDelete: vi.fn(),
}));

vi.mock('../hooks/useDexieQuery', () => ({ useDexieQuery: mocks.useDexieQuery }));
vi.mock('../services/productService', () => ({
  productService: {
    create: mocks.productCreate,
    update: mocks.productUpdate,
  },
}));
vi.mock('../services/stockMovementService', () => ({
  stockMovementService: { register: mocks.movementRegister },
}));
vi.mock('../services/categoryService', () => ({
  categoryService: {
    create: mocks.categoryCreate,
    update: mocks.categoryUpdate,
    softDelete: mocks.categoryDelete,
  },
}));

const idleQuery = {
  isLoading: false,
  error: undefined,
  refetch: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('robustez dos formularios', () => {
  it('carrega produto ativo para edicao', async () => {
    const product = createProduct();
    configureProductFormQuery({ status: 'active', product });

    renderProductForm(`/produtos/${product.id}/editar`);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Nome');
      expect(nameInput).toBeInstanceOf(HTMLInputElement);
      if (nameInput instanceof HTMLInputElement) {
        expect(nameInput.value).toBe('Cafe');
      }
    });
    expect(screen.queryByLabelText('Quantidade inicial')).toBeNull();
    expect(screen.getByText('Estoque atual:')).toBeTruthy();
    expect(screen.getByText('Para alterar o estoque, registre uma entrada ou saida.')).toBeTruthy();
  });

  it('exibe quantidade inicial somente na criacao', () => {
    configureProductFormQuery({ status: 'not-found' });

    renderProductForm('/produtos/novo');

    expect(screen.getByLabelText('Quantidade inicial')).toBeTruthy();
    expect(screen.queryByText('Para alterar o estoque, registre uma entrada ou saida.')).toBeNull();
  });

  it.each([
    ['not-found', 'Produto nao encontrado.'],
    ['deleted', 'Este produto nao esta mais disponivel.'],
  ] as const)('trata rota de produto %s', (status, expectedMessage) => {
    configureProductFormQuery({ status });

    renderProductForm(`/produtos/${crypto.randomUUID()}/editar`);

    expect(screen.getByText(expectedMessage)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salvar produto' })).toBeNull();
  });

  it('bloqueia duplo envio de produto e informa sucesso somente apos concluir', async () => {
    const pendingCreation = deferred<string>();
    mocks.productCreate.mockReturnValue(pendingCreation.promise);
    configureProductFormQuery({ status: 'not-found' });

    renderProductForm('/produtos/novo');
    fillProductForm();
    const submitButton = screen.getByRole('button', { name: 'Salvar produto' });
    const form = submitButton.closest('form');
    expect(form).toBeInstanceOf(HTMLFormElement);
    if (!(form instanceof HTMLFormElement)) return;

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(mocks.productCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Produto cadastrado com sucesso.')).toBeNull();

    pendingCreation.resolve(crypto.randomUUID());
    await waitFor(() => {
      expect(screen.getByText('Produto cadastrado com sucesso.')).toBeTruthy();
    });
  });

  it('bloqueia movimento duplicado e preserva formulario apos erro', async () => {
    const pendingMovement = deferred<void>();
    mocks.movementRegister.mockReturnValue(pendingMovement.promise);
    const product = createProduct();
    let queryCall = 0;
    const productsResult = { ...idleQuery, data: [{ ...product, categoryName: 'Sem categoria' }] };
    const movementsResult = { ...idleQuery, data: [] };
    mocks.useDexieQuery.mockImplementation(() => {
      queryCall += 1;
      return queryCall % 2 === 1 ? productsResult : movementsResult;
    });

    render(
      <MemoryRouter>
        <Movements />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: product.id } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Observacao'), { target: { value: 'Teste' } });
    const submitButton = screen.getByRole('button', { name: 'Registrar movimentacao' });
    const form = submitButton.closest('form');
    expect(form).toBeInstanceOf(HTMLFormElement);
    if (!(form instanceof HTMLFormElement)) return;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.movementRegister).toHaveBeenCalledTimes(1);

    pendingMovement.reject(new Error('Produto nao encontrado.'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registrar movimentacao' })).toHaveProperty(
        'disabled',
        false,
      );
    });
    const noteInput = screen.getByLabelText('Observacao');
    if (noteInput instanceof HTMLTextAreaElement) {
      expect(noteInput.value).toBe('Teste');
    }
  });

  it('bloqueia categoria duplicada e reabilita o botao depois do erro', async () => {
    const pendingCategory = deferred<string>();
    mocks.categoryCreate.mockReturnValue(pendingCategory.promise);
    mocks.useDexieQuery.mockReturnValue({ ...idleQuery, data: [] });

    render(
      <MemoryRouter>
        <Categories />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bebidas' } });
    const submitButton = screen.getByRole('button', { name: 'Cadastrar categoria' });
    const form = submitButton.closest('form');
    expect(form).toBeInstanceOf(HTMLFormElement);
    if (!(form instanceof HTMLFormElement)) return;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.categoryCreate).toHaveBeenCalledTimes(1);

    pendingCategory.reject(new Error('Ja existe uma categoria ativa com este nome.'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cadastrar categoria' })).toHaveProperty(
        'disabled',
        false,
      );
    });
    const nameInput = screen.getByLabelText('Nome');
    if (nameInput instanceof HTMLInputElement) {
      expect(nameInput.value).toBe('Bebidas');
    }
  });
});

function configureProductFormQuery(editingLookup: object) {
  const categoriesResult = { ...idleQuery, data: [] };
  const productResult = { ...idleQuery, data: editingLookup };
  mocks.useDexieQuery.mockImplementation((_query, initialValue) =>
    Array.isArray(initialValue) ? categoriesResult : productResult,
  );
}

function renderProductForm(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/produtos/novo" element={<ProductForm />} />
        <Route path="/produtos/:id/editar" element={<ProductForm />} />
        <Route path="/produtos" element={<Products />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillProductForm() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cafe' } });
  fireEvent.change(screen.getByLabelText('Codigo interno (opcional)'), {
    target: { value: 'CAFE' },
  });
  fireEvent.change(screen.getByLabelText('Preco'), { target: { value: '10,00' } });
}

function createProduct() {
  const now = '2026-07-14T10:00:00.000Z';
  return {
    id: crypto.randomUUID(),
    name: 'Cafe',
    code: 'CAFE',
    salePriceInCents: 1000,
    currentQuantity: 10,
    minimumStock: 2,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending' as const,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
