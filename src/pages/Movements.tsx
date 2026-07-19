import { FormEvent, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { stockMovementService } from '../services/stockMovementService';
import type { MovementType } from '../types/Movement';
import { formatDate } from '../utils/formatters';
import { productService } from '../services/productService';
import { hasStockSnapshot } from '../domain/stockMovement';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { getUserFacingError } from '../utils/errors';
import {
  DEFAULT_MOVEMENT_FILTERS,
  filterAndSortMovements,
  getMovementProductOptions,
  hasActiveMovementFilters,
  type MovementFilters,
  type MovementSort,
  type MovementTypeFilter,
} from '../domain/movementFilters';

export function Movements() {
  const productsQuery = useDexieQuery(() => productService.listActive(), []);
  const movementsQuery = useDexieQuery(() => stockMovementService.listHistory(), []);
  const products = productsQuery.data;
  const movements = movementsQuery.data;
  const [productId, setProductId] = useState('');
  const [type, setType] = useState<MovementType>('entrada');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyFilters, setHistoryFilters] = useState<MovementFilters>(
    DEFAULT_MOVEMENT_FILTERS,
  );
  const submissionInProgress = useRef(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  );
  const movementFilterResult = useMemo(
    () => filterAndSortMovements(movements, historyFilters),
    [historyFilters, movements],
  );
  const historyProductOptions = useMemo(
    () => getMovementProductOptions(movements),
    [movements],
  );
  const hasActiveHistoryFilters = hasActiveMovementFilters(historyFilters);

  function updateHistoryFilter<K extends keyof MovementFilters>(
    key: K,
    value: MovementFilters[K],
  ) {
    setHistoryFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    setError('');
    setSuccess('');

    if (!productId) {
      setError('Selecione um produto.');
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('A quantidade deve ser um numero inteiro maior que zero.');
      return;
    }

    if (type === 'saida' && selectedProduct && quantity > selectedProduct.currentQuantity) {
      setError('A saida nao pode ser maior que a quantidade disponivel.');
      return;
    }

    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      await stockMovementService.register({
        productId,
        type,
        quantity,
        note,
        date: new Date().toISOString(),
        syncStatus: 'pending',
      });

      setQuantity(1);
      setNote('');
      setSuccess('Movimentacao registrada com sucesso.');
    } catch (movementError) {
      setError(
        getUserFacingError(movementError, 'Nao foi possivel registrar a movimentacao.', [
          'Produto nao encontrado.',
          'A quantidade deve ser um numero inteiro maior que zero.',
          'A saida nao pode ser maior que a quantidade disponivel.',
          'O estoque atual do produto e invalido.',
          'Tipo de movimentacao invalido.',
        ]),
      );
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Movimentacoes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registre entradas e saidas para manter o estoque atualizado.
          </p>
        </div>

        {productsQuery.isLoading ? (
          <LoadingState message="Carregando produtos..." />
        ) : productsQuery.error ? (
          <ErrorState
            message="Nao foi possivel carregar os produtos para movimentacao."
            onRetry={productsQuery.refetch}
          />
        ) : (
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {error && (
            <div role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {success}
            </div>
          )}

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700" htmlFor="product">
              Produto
              <select
                id="product"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                disabled={isSubmitting}
                className="input mt-2"
                required
              >
                <option value="">Selecione</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - {product.currentQuantity} un.
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="text-sm font-medium text-slate-700">Tipo</span>
              <div className="mt-2 grid grid-cols-2 rounded-md border border-slate-300 bg-slate-100 p-1">
                {(['entrada', 'saida'] as MovementType[]).map((movementType) => (
                  <button
                    key={movementType}
                    type="button"
                    onClick={() => setType(movementType)}
                    disabled={isSubmitting}
                    className={`min-h-10 rounded px-3 text-sm font-semibold capitalize transition ${
                      type === movementType
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {movementType}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-700" htmlFor="quantity">
              Quantidade
              <input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                disabled={isSubmitting}
                className="input mt-2"
                required
              />
            </label>

            {selectedProduct && (
              <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
                Disponivel agora: <strong>{selectedProduct.currentQuantity} unidades</strong>
              </div>
            )}

            <label className="block text-sm font-medium text-slate-700" htmlFor="note">
              Observacao
              <textarea
                id="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={isSubmitting}
                className="input mt-2 min-h-24 resize-y"
                placeholder="Ex.: compra de fornecedor, venda no caixa..."
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || products.length === 0}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-900"
          >
            {isSubmitting ? 'Registrando...' : 'Registrar movimentacao'}
          </button>
        </form>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Historico</h2>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="movement-product-filter">
              Filtrar por produto
              <select
                id="movement-product-filter"
                value={historyFilters.productId}
                onChange={(event) => updateHistoryFilter('productId', event.target.value)}
                className="input mt-2"
              >
                <option value="">Todos os produtos</option>
                {historyProductOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.code || 'Sem codigo'})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700" htmlFor="movement-type-filter">
              Filtrar por tipo
              <select
                id="movement-type-filter"
                value={historyFilters.type}
                onChange={(event) =>
                  updateHistoryFilter('type', event.target.value as MovementTypeFilter)
                }
                className="input mt-2"
              >
                <option value="all">Todas</option>
                <option value="entrada">Entradas</option>
                <option value="saida">Saidas</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700" htmlFor="movement-start-date">
              Data inicial
              <input
                id="movement-start-date"
                type="date"
                value={historyFilters.startDate}
                onChange={(event) => updateHistoryFilter('startDate', event.target.value)}
                className="input mt-2"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700" htmlFor="movement-end-date">
              Data final
              <input
                id="movement-end-date"
                type="date"
                value={historyFilters.endDate}
                onChange={(event) => updateHistoryFilter('endDate', event.target.value)}
                className="input mt-2"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700 sm:col-span-2" htmlFor="movement-sort">
              Ordenar por
              <select
                id="movement-sort"
                value={historyFilters.sort}
                onChange={(event) =>
                  updateHistoryFilter('sort', event.target.value as MovementSort)
                }
                className="input mt-2"
              >
                <option value="newest">Mais recentes primeiro</option>
                <option value="oldest">Mais antigas primeiro</option>
              </select>
            </label>
          </div>

          {hasActiveHistoryFilters && (
            <button
              type="button"
              onClick={() => setHistoryFilters(DEFAULT_MOVEMENT_FILTERS)}
              className="mt-4 min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {movementsQuery.isLoading ? (
          <div className="p-4">
            <LoadingState message="Carregando movimentacoes..." />
          </div>
        ) : movementsQuery.error ? (
          <div className="p-4">
            <ErrorState
              message="Nao foi possivel carregar as movimentacoes."
              onRetry={movementsQuery.refetch}
            />
          </div>
        ) : movementFilterResult.validationError ? (
          <div className="p-4">
            <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {movementFilterResult.validationError}
            </p>
          </div>
        ) : movements.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhuma movimentacao registrada."
              description="Registre uma entrada ou saida para criar o primeiro registro."
            />
          </div>
        ) : movementFilterResult.movements.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhuma movimentacao encontrada com os filtros atuais."
              description="Ajuste ou limpe os filtros para consultar outros registros."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {movementFilterResult.movements.map((movement) => (
              <article key={movement.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-950">{movement.productName}</h3>
                    <p className="text-sm text-slate-500">
                      {movement.productCode || 'Sem codigo'} • {formatDate(movement.date)}
                    </p>
                    {movement.note && (
                      <p className="mt-2 text-sm text-slate-600">{movement.note}</p>
                    )}
                    {hasStockSnapshot(movement) ? (
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:flex sm:gap-5">
                        <div>
                          <dt className="text-xs text-slate-500">Estoque anterior</dt>
                          <dd className="font-semibold text-slate-900">
                            {movement.previousQuantity} un.
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Estoque resultante</dt>
                          <dd className="font-semibold text-slate-900">
                            {movement.resultingQuantity} un.
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                        Estoque anterior e resultante indisponiveis para movimentacao legada.
                      </p>
                    )}
                  </div>
                  <span
                    className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                      movement.type === 'entrada'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {movement.type === 'entrada' ? '+' : '-'}
                    {movement.quantity}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
