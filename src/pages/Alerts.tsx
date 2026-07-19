import { EmptyState } from '../components/EmptyState';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { formatCentsToBRL } from '../utils/formatters';
import { productService } from '../services/productService';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { getStockStatus, type StockStatus } from '../domain/stockStatus';

export function Alerts() {
  const { data: productsNeedingRestock, isLoading, error, refetch } = useDexieQuery(
    () => productService.listProductsNeedingRestock(),
    [],
  );

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-950">Alertas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Produtos que chegaram ao estoque minimo ou ficaram abaixo dele.
        </p>
      </section>

      {isLoading ? (
        <LoadingState message="Carregando alertas..." />
      ) : error ? (
        <ErrorState message="Nao foi possivel carregar os alertas." onRetry={refetch} />
      ) : productsNeedingRestock.length === 0 ? (
        <EmptyState
          title="Nenhum alerta no momento"
          description="Todos os produtos estao acima do estoque minimo configurado."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {productsNeedingRestock.map((product) => {
            const statusPresentation = ALERT_STATUS_PRESENTATION[getStockStatus(product)];

            return (
              <article
                key={product.id}
                className={`rounded-lg border bg-white p-4 shadow-sm ${statusPresentation.cardClassName}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">{product.name}</h2>
                    <p className="text-sm text-slate-500">{product.code || 'Sem codigo'}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusPresentation.badgeClassName}`}
                  >
                    {statusPresentation.label}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Atual</dt>
                    <dd className="font-semibold text-slate-950">{product.currentQuantity}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Minimo</dt>
                    <dd className="font-semibold text-slate-950">{product.minimumStock}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Categoria</dt>
                    <dd className="font-semibold text-slate-950">{product.categoryName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Preco</dt>
                    <dd className="font-semibold text-slate-950">
                      {formatCentsToBRL(product.salePriceInCents)}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ALERT_STATUS_PRESENTATION: Record<
  StockStatus,
  { label: string; cardClassName: string; badgeClassName: string }
> = {
  normal: {
    label: 'Normal',
    cardClassName: 'border-emerald-200',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
  },
  'low-stock': {
    label: 'Estoque baixo',
    cardClassName: 'border-amber-200',
    badgeClassName: 'bg-amber-100 text-amber-800',
  },
  'out-of-stock': {
    label: 'Sem estoque',
    cardClassName: 'border-rose-300',
    badgeClassName: 'bg-rose-100 text-rose-700',
  },
};
