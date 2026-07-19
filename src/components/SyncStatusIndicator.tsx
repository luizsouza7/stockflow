import { useDexieQuery } from '../hooks/useDexieQuery';
import { outboxService } from '../services/outboxService';
import type { DatabaseLifecycleState } from '../services/db/databaseLifecycle';
import type { SyncStatusSummary } from '../types/Sync';

const EMPTY_SUMMARY: SyncStatusSummary = {
  pending: 0,
  processing: 0,
  error: 0,
  conflict: 0,
  totalAwaitingAction: 0,
};

interface SyncStatusReader {
  getStatusSummary(): Promise<SyncStatusSummary>;
}

interface SyncStatusIndicatorProps {
  isOnline: boolean;
  databaseLifecycleStatus: DatabaseLifecycleState['status'];
  service?: SyncStatusReader;
}

export function SyncStatusIndicator({
  isOnline,
  databaseLifecycleStatus,
  service = outboxService,
}: SyncStatusIndicatorProps) {
  const canReadDatabase = databaseLifecycleStatus === 'normal';
  const summaryQuery = useDexieQuery(
    () => (canReadDatabase ? service.getStatusSummary() : Promise.resolve(EMPTY_SUMMARY)),
    EMPTY_SUMMARY,
    [canReadDatabase, service],
  );

  if (!canReadDatabase) {
    return (
      <aside className="border-t border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700 sm:px-6 lg:px-8">
        Recarregue a pagina antes de consultar as alteracoes locais pendentes.
      </aside>
    );
  }

  if (summaryQuery.error) {
    return (
      <aside role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 sm:px-6 lg:px-8">
        Nao foi possivel consultar as pendencias locais agora. Nenhum dado foi enviado.
      </aside>
    );
  }

  const pending = summaryQuery.data.totalAwaitingAction;

  return (
    <aside role="status" className="border-t border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-700 sm:px-6 lg:px-8">
      {summaryQuery.isLoading
        ? 'Consultando alteracoes locais pendentes...'
        : pending > 0
          ? `${pending} ${pending === 1 ? 'alteracao local pendente' : 'alteracoes locais pendentes'} para sincronizacao futura.`
          : 'Nenhuma alteracao local pendente na outbox.'}{' '}
      Sincronizacao com a nuvem ainda nao configurada; os dados continuam apenas neste dispositivo.
      {!isOnline && ' Sem internet; o uso local continua disponivel.'}
    </aside>
  );
}
