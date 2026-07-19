import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { useDexieQuery } from '../hooks/useDexieQuery';
import { getDashboardSummary, type DashboardSummary } from '../services/dashboardService';
import { formatDate } from '../utils/formatters';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export function Dashboard() {
  const { data: summary, isLoading, error, refetch } = useDexieQuery<DashboardSummary>(() => getDashboardSummary(), {
    totalProducts: 0,
    totalLowStock: 0,
    totalNeedingRestock: 0,
    totalOutOfStock: 0,
    totalMovements: 0,
    recentMovements: [],
  });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-950">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Visao geral do estoque local salvo neste dispositivo.
        </p>
      </section>

      {isLoading ? (
        <LoadingState message="Carregando resumo do estoque..." />
      ) : error ? (
        <ErrorState message="Nao foi possivel carregar o dashboard." onRetry={refetch} />
      ) : (
        <>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Produtos cadastrados" value={summary.totalProducts} />
        <StatCard
          label="Estoque baixo"
          value={summary.totalLowStock}
          tone={summary.totalLowStock > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Sem estoque"
          value={summary.totalOutOfStock}
          tone={summary.totalOutOfStock > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Movimentacoes registradas" value={summary.totalMovements} />
      </section>

      {summary.totalNeedingRestock > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <h2 className="font-semibold">Produtos precisam de reposicao</h2>
          <p className="mt-1 text-sm">
            {summary.totalNeedingRestock} produto(s) precisam de reposicao.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Ultimas movimentacoes</h2>
        </div>

        {summary.recentMovements.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhuma movimentacao registrada"
              description="As entradas e saidas de estoque aparecerao aqui."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {summary.recentMovements.map((movement) => (
              <article key={movement.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-950">{movement.productName}</p>
                  <p className="text-sm text-slate-500">
                    Codigo {movement.productCode || 'Sem codigo'} • {formatDate(movement.date)}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                    movement.type === 'entrada'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {movement.type === 'entrada' ? '+' : '-'}
                  {movement.quantity} unidades
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}
