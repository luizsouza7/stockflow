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
  const submissionInProgress = useRef(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  );

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
        ) : movements.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Historico vazio"
              description="Registre uma entrada ou saida para criar o primeiro registro."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {movements.map((movement) => (
              <article key={movement.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-950">{movement.productName}</h3>
                    <p className="text-sm text-slate-500">
                      {movement.productCode} • {formatDate(movement.date)}
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
