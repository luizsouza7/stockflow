import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  businessContextService,
  type BusinessContextService,
  type BusinessSummary,
} from '../services/businessContextService';
import {
  manualPushService,
  type LocalPushSummary,
  type ManualPushService,
} from '../services/sync/manualPushService';

const EMPTY_SUMMARY: LocalPushSummary = { unscoped: 0, selectedBusiness: 0 };

interface ManualCloudPushPanelProps {
  session: Session;
  isOnline: boolean;
  contextService?: BusinessContextService;
  pushService?: ManualPushService;
}

export function ManualCloudPushPanel({
  session,
  isOnline,
  contextService = businessContextService,
  pushService = manualPushService,
}: ManualCloudPushPanelProps) {
  const userId = session.user.id;
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [selectedId, setSelectedId] = useState(() => contextService.getSelected(userId) ?? '');
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const actionInProgress = useRef(false);

  useEffect(() => {
    setSelectedId(contextService.getSelected(userId) ?? '');
    setBusinesses([]);
    setCandidateId('');
  }, [contextService, userId]);

  useEffect(() => {
    if (!contextService.isConfigured()) return;
    let active = true;
    void pushService.getLocalSummary(userId, selectedId || undefined).then((value) => {
      if (active) setSummary(value);
    });
    return () => {
      active = false;
    };
  }, [contextService, pushService, selectedId, userId]);

  async function runAction(action: () => Promise<void>) {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setIsBusy(true);
    setMessage('');
    setError('');

    try {
      await action();
    } catch {
      setError('Nao foi possivel concluir esta acao de nuvem agora.');
    } finally {
      actionInProgress.current = false;
      setIsBusy(false);
    }
  }

  async function refreshSummary(businessId = selectedId) {
    setSummary(await pushService.getLocalSummary(userId, businessId || undefined));
  }

  function loadBusinesses() {
    void runAction(async () => {
      if (!isOnline) {
        setError('Conecte-se a internet para consultar estabelecimentos.');
        return;
      }
      const available = await contextService.listAvailable();
      setBusinesses(available);
      const stored = contextService.getSelected(userId);
      setCandidateId(
        stored && available.some((business) => business.id === stored)
          ? stored
          : available[0]?.id ?? '',
      );
      setMessage(
        available.length > 0
          ? 'Estabelecimentos ativos carregados. Confirme qual deseja usar.'
          : 'Nenhum estabelecimento ativo foi encontrado para esta conta.',
      );
    });
  }

  function selectBusiness() {
    void runAction(async () => {
      await contextService.select(userId, candidateId);
      setSelectedId(candidateId);
      await refreshSummary(candidateId);
      setMessage('Estabelecimento selecionado e validado para esta conta.');
    });
  }

  function bindLocalEvents() {
    void runAction(async () => {
      const result = await pushService.bindLocalEvents({
        userId,
        businessId: selectedId || undefined,
        isOnline,
      });
      if (result.status === 'blocked') setError(result.message);
      else setMessage(result.message);
      await refreshSummary();
    });
  }

  function pushCompatibleEvents() {
    void runAction(async () => {
      const result = await pushService.push({
        userId,
        businessId: selectedId || undefined,
        isOnline,
      });
      if (result.status === 'blocked') setError(result.message);
      else setMessage(result.message);
      await refreshSummary();
    });
  }

  if (!contextService.isConfigured()) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold text-amber-950">Envio manual indisponivel</h3>
        <p className="mt-2 text-sm text-amber-800">
          Supabase nao esta configurado. Seus dados locais continuam neste dispositivo.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-lg font-semibold text-slate-950">Envio manual para a nuvem</h3>
      <p className="mt-2 text-sm text-slate-600">
        Esta etapa envia categorias, produtos e movimentacoes rastreadas compativeis. Movimentacoes
        legadas sem snapshots permanecem bloqueadas. Pull e resolucao de conflitos ainda nao estao
        disponiveis.
      </p>

      {!isOnline && (
        <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Voce esta offline. Nenhuma tentativa remota sera feita.
        </p>
      )}
      {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm font-medium text-slate-700">{message}</p>}

      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={loadBusinesses}
          disabled={isBusy || !isOnline}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isBusy ? 'Aguarde...' : 'Carregar meus estabelecimentos'}
        </button>

        {businesses.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label htmlFor="cloud-business" className="flex-1 text-sm font-medium text-slate-700">
              Estabelecimento
              <select
                id="cloud-business"
                value={candidateId}
                onChange={(event) => setCandidateId(event.target.value)}
                disabled={isBusy}
                className="input mt-2"
              >
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>{business.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={selectBusiness}
              disabled={isBusy || !candidateId || !isOnline}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Usar estabelecimento
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-md bg-slate-100 p-4 text-sm text-slate-700">
        <p>{summary.unscoped} alteracao(oes) local(is) ainda sem estabelecimento.</p>
        <p className="mt-1">{summary.selectedBusiness} alteracao(oes) vinculada(s) ao estabelecimento selecionado.</p>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        Associar pendencias apenas grava usuario e estabelecimento na outbox. Esse passo nao envia
        dados e nao altera produtos, categorias ou movimentacoes.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={bindLocalEvents}
          disabled={isBusy || !selectedId || !isOnline || summary.unscoped === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isBusy ? 'Processando...' : 'Associar pendencias locais'}
        </button>
        <button
          type="button"
          onClick={pushCompatibleEvents}
          disabled={isBusy || !selectedId || !isOnline || summary.selectedBusiness === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isBusy ? 'Enviando...' : 'Enviar alteracoes compativeis'}
        </button>
      </div>
    </section>
  );
}
