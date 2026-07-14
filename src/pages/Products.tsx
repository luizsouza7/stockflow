import { Link, useLocation, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { productService } from '../services/productService';
import { formatCentsToBRL, formatDate } from '../utils/formatters';
import { useEffect, useMemo, useRef, useState } from 'react';
import { needsRestock } from '../domain/stockStatus';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { getUserFacingError } from '../utils/errors';
import { categoryService } from '../services/categoryService';
import {
  DEFAULT_PRODUCT_FILTERS,
  filterAndSortProducts,
  hasActiveProductFilters,
  UNCATEGORIZED_FILTER,
  type ProductFilters,
  type ProductSort,
  type ProductStockFilter,
} from '../domain/productFilters';

export function Products() {
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_PRODUCT_FILTERS);
  const location = useLocation();
  const navigate = useNavigate();
  const [operationError, setOperationError] = useState('');
  const [success, setSuccess] = useState(() => readSuccessMessage(location.state));
  const [deletingId, setDeletingId] = useState<string>();
  const deletionInProgress = useRef(false);
  const productsQuery = useDexieQuery(
    () => productService.listActive(),
    [],
  );
  const categoriesQuery = useDexieQuery(() => categoryService.listActive(), []);
  const products = productsQuery.data;

  useEffect(() => {
    if (readSuccessMessage(location.state)) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const filteredProducts = useMemo(() => {
    return filterAndSortProducts(products, filters);
  }, [filters, products]);
  const hasActiveFilters = hasActiveProductFilters(filters);

  function updateFilter<K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleDelete(id: string) {
    if (deletionInProgress.current) {
      return;
    }

    const confirmed = window.confirm(
      'Excluir este produto? O historico de movimentacoes sera preservado.',
    );

    if (confirmed) {
      deletionInProgress.current = true;
      setDeletingId(id);
      setOperationError('');
      setSuccess('');

      try {
        await productService.softDelete(id);
        setSuccess('Produto excluido com sucesso.');
      } catch (deleteError) {
        setOperationError(
          getUserFacingError(deleteError, 'Nao foi possivel excluir o produto.', [
            'Produto nao encontrado.',
          ]),
        );
      } finally {
        deletionInProgress.current = false;
        setDeletingId(undefined);
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Produtos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre, edite e acompanhe os itens do estoque.
          </p>
        </div>
        <Link
          to="/produtos/novo"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-900"
        >
          Novo produto
        </Link>
      </section>

      {operationError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {operationError}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(10rem,1fr))]">
          <label className="block text-sm font-medium text-slate-700" htmlFor="product-search">
            Buscar por nome ou codigo
            <input
              id="product-search"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              className="input mt-2"
              placeholder="Ex.: Arroz ou COD-001"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700" htmlFor="product-category-filter">
            Categoria
            <select
              id="product-category-filter"
              value={filters.category}
              onChange={(event) => updateFilter('category', event.target.value)}
              className="input mt-2"
            >
              <option value="all">Todas as categorias</option>
              <option value={UNCATEGORIZED_FILTER}>Sem categoria</option>
              {categoriesQuery.data.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700" htmlFor="product-stock-filter">
            Situacao do estoque
            <select
              id="product-stock-filter"
              value={filters.stockStatus}
              onChange={(event) =>
                updateFilter('stockStatus', event.target.value as ProductStockFilter)
              }
              className="input mt-2"
            >
              <option value="all">Todos</option>
              <option value="normal">Normal</option>
              <option value="low-stock">Estoque baixo</option>
              <option value="out-of-stock">Sem estoque</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700" htmlFor="product-sort">
            Ordenar por
            <select
              id="product-sort"
              value={filters.sort}
              onChange={(event) => updateFilter('sort', event.target.value as ProductSort)}
              className="input mt-2"
            >
              <option value="name-asc">Nome A-Z</option>
              <option value="name-desc">Nome Z-A</option>
              <option value="stock-asc">Estoque menor primeiro</option>
              <option value="stock-desc">Estoque maior primeiro</option>
              <option value="price-asc">Preco menor primeiro</option>
              <option value="price-desc">Preco maior primeiro</option>
              <option value="updated-desc">Atualizacao mais recente</option>
              <option value="updated-asc">Atualizacao mais antiga</option>
            </select>
          </label>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_PRODUCT_FILTERS)}
            className="mt-4 min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Limpar filtros
          </button>
        )}
      </section>

      {productsQuery.isLoading || categoriesQuery.isLoading ? (
        <LoadingState message="Carregando produtos..." />
      ) : productsQuery.error || categoriesQuery.error ? (
        <ErrorState
          message="Nao foi possivel carregar os produtos."
          onRetry={() => {
            productsQuery.refetch();
            categoriesQuery.refetch();
          }}
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title={
            products.length === 0
              ? 'Nenhum produto cadastrado.'
              : 'Nenhum produto encontrado com os filtros atuais.'
          }
          description={
            products.length === 0
              ? 'Crie o primeiro produto para comecar o controle de estoque.'
              : 'Ajuste ou limpe os filtros para consultar outros produtos.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_1fr] gap-4 border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>Produto</span>
            <span>Categoria</span>
            <span>Preco</span>
            <span>Estoque</span>
            <span className="text-right">Acoes</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredProducts.map((product) => {
              const isLowStock = needsRestock(product);

              return (
                <article
                  key={product.id}
                  className="grid gap-4 px-4 py-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_1fr] lg:items-center"
                >
                  <div>
                    <h2 className="font-semibold text-slate-950">{product.name}</h2>
                    <p className="text-sm text-slate-500">
                      {product.code || 'Sem codigo'} • Atualizado em {formatDate(product.updatedAt)}
                    </p>
                  </div>
                  <p className="text-sm text-slate-700">{product.categoryName}</p>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCentsToBRL(product.salePriceInCents)}
                  </p>
                  <div>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        isLowStock
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {product.currentQuantity} un.
                    </span>
                    <p className="mt-1 text-xs text-slate-500">Min. {product.minimumStock}</p>
                  </div>
                  <div className="flex gap-2 lg:justify-end">
                    <Link
                      to={`/produtos/${product.id}/editar`}
                      className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(product.id)}
                      disabled={deletingId !== undefined}
                      className="inline-flex min-h-10 items-center rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      {deletingId === product.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function readSuccessMessage(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('successMessage' in state)) {
    return '';
  }

  return typeof state.successMessage === 'string' ? state.successMessage : '';
}
