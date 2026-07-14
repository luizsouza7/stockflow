import { EmptyState } from '../components/EmptyState';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { formatCentsToBRL } from '../utils/formatters';
import { productService } from '../services/productService';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export function Alerts() {
  const { data: lowStockProducts, isLoading, error, refetch } = useDexieQuery(
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
      ) : lowStockProducts.length === 0 ? (
        <EmptyState
          title="Nenhum alerta no momento"
          description="Todos os produtos estao acima do estoque minimo configurado."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lowStockProducts.map((product) => (
            <article
              key={product.id}
              className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950">{product.name}</h2>
                  <p className="text-sm text-slate-500">{product.code}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  Repor
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
          ))}
        </div>
      )}
    </div>
  );
}
