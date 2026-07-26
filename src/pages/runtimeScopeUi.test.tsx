// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ActiveDataScopeState } from '../hooks/useActiveDataScope';
import { localDb } from '../services/db/localDb';
import type { Category } from '../types/Category';
import type { Product } from '../types/Product';
import { productService } from '../services/productService';
import { ProductForm } from './ProductForm';

const active = vi.hoisted(() => ({
  state: {
    scope: { kind: 'local' as const },
    scopeToken: 'local',
    label: 'Dados locais deste dispositivo',
    isLoading: false,
  } as ActiveDataScopeState,
}));

vi.mock('../hooks/useActiveDataScope', () => ({
  useActiveDataScope: () => active.state,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUSINESS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LOCAL_PRODUCT = '22222222-2222-4222-8222-222222222222';
const PRODUCT_A = '33333333-3333-4333-8333-333333333333';
const PRODUCT_B = '44444444-4444-4444-8444-444444444444';
const CATEGORY_A = '55555555-5555-4555-8555-555555555555';
const CATEGORY_B = '66666666-6666-4666-8666-666666666666';
const LOCAL_CATEGORY = '77777777-7777-4777-8777-777777777777';
const NOW = '2026-07-24T12:00:00.000Z';

describe('rotas e formulario orientados pelo escopo ativo', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
    active.state = localState();
    await localDb.categories.bulkAdd([
      category(LOCAL_CATEGORY, 'Categoria local'),
      category(CATEGORY_A, 'Categoria A', BUSINESS_A),
      category(CATEGORY_B, 'Categoria B', BUSINESS_B),
    ]);
    await localDb.products.bulkAdd([
      product(LOCAL_PRODUCT, 'Produto local', LOCAL_CATEGORY),
      product(PRODUCT_A, 'Produto A', CATEGORY_A, BUSINESS_A),
      product(PRODUCT_B, 'Produto B', CATEGORY_B, BUSINESS_B),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('modo local nao abre produto business por URL direta', async () => {
    renderForm(`/produtos/${PRODUCT_A}/editar`);
    expect(await screen.findByText('Produto nao encontrado.')).toBeTruthy();
  });

  it('business A nao abre produto local ou do business B por URL direta', async () => {
    active.state = businessState(BUSINESS_A, 'Loja A');
    const first = renderForm(`/produtos/${PRODUCT_B}/editar`);
    expect(await screen.findByText('Produto nao encontrado.')).toBeTruthy();
    first.unmount();

    renderForm(`/produtos/${LOCAL_PRODUCT}/editar`);
    expect(await screen.findByText('Produto nao encontrado.')).toBeTruthy();
  });

  it('produto business abre no escopo correto e lista somente categorias do mesmo business', async () => {
    active.state = businessState(BUSINESS_A, 'Loja A');
    renderForm(`/produtos/${PRODUCT_A}/editar`);

    await waitFor(() => {
      expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Produto A');
    });
    expect(screen.getByRole('option', { name: 'Categoria A' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Categoria B' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Categoria local' })).toBeNull();
  });

  it('sucesso tardio de A nao navega nem aparece depois do remount em B', async () => {
    active.state = businessState(BUSINESS_A, 'Loja A');
    const pendingCreation = deferred<string>();
    const createSpy = vi
      .spyOn(productService, 'createForScope')
      .mockReturnValueOnce(pendingCreation.promise);
    const view = render(keyedCreateTree());

    await fillAndSubmitPendingProduct('Produto pendente A');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Produto pendente A' }),
      { kind: 'business', userId: USER_ID, businessId: BUSINESS_A },
    );

    active.state = businessState(BUSINESS_B, 'Loja B');
    view.rerender(keyedCreateTree());
    expect(await screen.findByText('Estabelecimento: Loja B')).toBeTruthy();
    await waitFor(() => {
      expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('');
    });

    await act(async () => {
      pendingCreation.resolve('88888888-8888-4888-8888-888888888888');
      await pendingCreation.promise;
    });

    expect(screen.getByRole('heading', { name: 'Novo produto' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Lista de produtos' })).toBeNull();
    expect(screen.queryByText('Produto cadastrado com sucesso.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('erro tardio de A nao aparece depois do remount em B', async () => {
    active.state = businessState(BUSINESS_A, 'Loja A');
    const pendingCreation = deferred<string>();
    const createSpy = vi
      .spyOn(productService, 'createForScope')
      .mockReturnValueOnce(pendingCreation.promise);
    const view = render(keyedCreateTree());

    await fillAndSubmitPendingProduct('Produto com erro tardio');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Produto com erro tardio' }),
      { kind: 'business', userId: USER_ID, businessId: BUSINESS_A },
    );

    active.state = businessState(BUSINESS_B, 'Loja B');
    view.rerender(keyedCreateTree());
    expect(await screen.findByText('Estabelecimento: Loja B')).toBeTruthy();

    await act(async () => {
      pendingCreation.reject(new Error('Ja existe um produto ativo com este codigo.'));
      await expect(pendingCreation.promise).rejects.toThrow(
        'Ja existe um produto ativo com este codigo.',
      );
    });

    expect(screen.getByRole('heading', { name: 'Novo produto' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Lista de produtos' })).toBeNull();
    expect(screen.queryByText('Ja existe um produto ativo com este codigo.')).toBeNull();
    expect(screen.queryByText('Produto cadastrado com sucesso.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

function renderForm(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/produtos/:id/editar" element={<ProductForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

function keyedCreateTree() {
  return (
    <MemoryRouter initialEntries={['/produtos/novo']}>
      <p>{active.state.label}</p>
      <Routes>
        <Route
          path="/produtos/novo"
          element={<ProductForm key={active.state.scopeToken} />}
        />
        <Route path="/produtos" element={<ProductListProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function ProductListProbe() {
  const location = useLocation();
  const successMessage =
    typeof location.state === 'object' &&
    location.state !== null &&
    'successMessage' in location.state &&
    typeof location.state.successMessage === 'string'
      ? location.state.successMessage
      : '';

  return (
    <>
      <h1>Lista de produtos</h1>
      {successMessage && <p>{successMessage}</p>}
    </>
  );
}

async function fillAndSubmitPendingProduct(name: string) {
  await screen.findByRole('heading', { name: 'Novo produto' });
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: name } });
  const submitButton = screen.getByRole('button', { name: 'Salvar produto' });
  const form = submitButton.closest('form');
  expect(form).toBeInstanceOf(HTMLFormElement);
  fireEvent.submit(form!);
  await waitFor(() =>
    expect((submitButton as HTMLButtonElement).disabled).toBe(true),
  );
}

function localState(): ActiveDataScopeState {
  return {
    scope: { kind: 'local' },
    scopeToken: 'local',
    label: 'Dados locais deste dispositivo',
    isLoading: false,
  };
}

function businessState(businessId: string, businessName: string): ActiveDataScopeState {
  return {
    scope: { kind: 'business', userId: USER_ID, businessId, businessName },
    scopeToken: `business:${USER_ID}:${businessId}`,
    label: `Estabelecimento: ${businessName}`,
    isLoading: false,
  };
}

function category(id: string, name: string, businessId?: string): Category {
  return {
    id,
    ...(businessId ? { businessId } : {}),
    name,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'synced',
  };
}

function product(
  id: string,
  name: string,
  categoryId: string,
  businessId?: string,
): Product {
  return {
    id,
    ...(businessId ? { businessId } : {}),
    name,
    code: name,
    categoryId,
    salePriceInCents: 100,
    currentQuantity: 1,
    minimumStock: 0,
    createdAt: NOW,
    updatedAt: NOW,
    syncStatus: 'synced',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
