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
import {
  manualPullService,
  type ManualPullService,
} from '../services/sync/manualPullService';
import {
  LegacyDataAssociationSection,
  type LegacyAssociationAction,
} from './LegacyDataAssociationSection';
import {
  legacyDataAssociationService,
  type LegacyDataAssociationService,
} from '../services/sync/legacyDataAssociationService';

const EMPTY_SUMMARY: LocalPushSummary = {
  unscoped: 0,
  awaitingUserBinding: 0,
  selectedBusiness: 0,
};
type ActiveAction =
  | 'load-businesses'
  | 'select-business'
  | 'bind'
  | 'push'
  | LegacyAssociationAction
  | null;

interface ManualCloudPushPanelProps {
  session: Session;
  isOnline: boolean;
  contextService?: BusinessContextService;
  pushService?: ManualPushService;
  pullService?: ManualPullService;
  associationService?: LegacyDataAssociationService;
  onBusyChange?(isBusy: boolean): void;
}

export function ManualCloudPushPanel({
  session,
  isOnline,
  contextService = businessContextService,
  pushService = manualPushService,
  pullService = manualPullService,
  associationService = legacyDataAssociationService,
  onBusyChange,
}: ManualCloudPushPanelProps) {
  const userId = session.user.id;
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [selectedId, setSelectedId] = useState(() => contextService.getSelected(userId) ?? '');
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pullMessage, setPullMessage] = useState('');
  const [isCheckingPull, setIsCheckingPull] = useState(false);
  const actionInProgress = useRef(false);
  const pullCheckInProgress = useRef(false);
  const pullContextRevision = useRef(0);
  const isMounted = useRef(true);
  const currentUserId = useRef(userId);
  const currentSelectedId = useRef(selectedId);
  const summaryRequestId = useRef(0);
  const isBusy = activeAction !== null;
  const selectedBusinessName = businesses.find(({ id }) => id === selectedId)?.name;

  currentUserId.current = userId;
  currentSelectedId.current = selectedId;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    onBusyChange?.(isBusy || isCheckingPull);
    return () => onBusyChange?.(false);
  }, [isBusy, isCheckingPull, onBusyChange]);

  useEffect(() => {
    setSelectedId(contextService.getSelected(userId) ?? '');
    setBusinesses([]);
    setCandidateId('');
  }, [contextService, userId]);

  useEffect(() => {
    pullContextRevision.current += 1;
    pullCheckInProgress.current = false;
    setIsCheckingPull(false);
    setPullMessage('');
  }, [userId, selectedId, isOnline]);

  useEffect(() => {
    if (!contextService.isConfigured()) return;
    let active = true;
    const requestId = ++summaryRequestId.current;
    const expectedUserId = userId;
    const expectedBusinessId = selectedId;
    void pushService.getLocalSummary(userId, selectedId || undefined).then((value) => {
      if (
        active &&
        requestId === summaryRequestId.current &&
        currentUserId.current === expectedUserId &&
        currentSelectedId.current === expectedBusinessId
      ) {
        setSummary(value);
      }
    });
    return () => {
      active = false;
    };
  }, [contextService, pushService, selectedId, userId]);

  async function runAction(actionName: Exclude<ActiveAction, null>, action: () => Promise<void>) {
    if (actionInProgress.current || pullCheckInProgress.current) return;
    actionInProgress.current = true;
    setActiveAction(actionName);
    setMessage('');
    setError('');

    try {
      await action();
    } catch {
      if (isMounted.current) {
        setError('Nao foi possivel concluir esta acao de nuvem agora.');
      }
    } finally {
      actionInProgress.current = false;
      if (isMounted.current) setActiveAction(null);
    }
  }

  async function refreshSummary(businessId = selectedId) {
    const requestId = ++summaryRequestId.current;
    const expectedUserId = userId;
    const expectedBusinessId = businessId;
    const nextSummary = await pushService.getLocalSummary(expectedUserId, businessId || undefined);
    if (
      isMounted.current &&
      requestId === summaryRequestId.current &&
      currentUserId.current === expectedUserId &&
      currentSelectedId.current === expectedBusinessId
    ) {
      setSummary(nextSummary);
    }
  }

  function loadBusinesses() {
    void runAction('load-businesses', async () => {
      if (!isOnline) {
        setError('Conecte-se a internet para consultar estabelecimentos.');
        return;
      }
      const available = await contextService.listAvailable();
      if (!isMounted.current) return;
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
    void runAction('select-business', async () => {
      await contextService.select(userId, candidateId);
      if (!isMounted.current) return;
      currentSelectedId.current = candidateId;
      setSelectedId(candidateId);
      await refreshSummary(candidateId);
      if (isMounted.current) {
        setMessage('Estabelecimento selecionado e validado para esta conta.');
      }
    });
  }

  function bindLocalEvents() {
    void runAction('bind', async () => {
      const result = await pushService.bindLocalEvents({
        userId,
        businessId: selectedId || undefined,
        isOnline,
      });
      if (!isMounted.current) return;
      if (result.status === 'blocked') setError(result.message);
      else setMessage(result.message);
      await refreshSummary();
    });
  }

  function pushCompatibleEvents() {
    void runAction('push', async () => {
      try {
        const result = await pushService.push({
          userId,
          businessId: selectedId || undefined,
          isOnline,
        });
        if (!isMounted.current) return;
        if (result.status === 'blocked') {
          setError(result.message);
        } else {
          setMessage(result.message);
          setSummary((current) => ({
            ...current,
            selectedBusiness: Math.max(0, current.selectedBusiness - result.succeeded),
          }));
        }
      } finally {
        if (isMounted.current) void refreshSummary().catch(() => undefined);
      }
    });
  }

  async function checkManualPull() {
    if (pullCheckInProgress.current || actionInProgress.current) return;
    const contextRevision = pullContextRevision.current;
    pullCheckInProgress.current = true;
    setIsCheckingPull(true);
    setPullMessage('');

    try {
      const result = await pullService.check({
        userId,
        businessId: selectedId || undefined,
        isOnline,
      });
      if (isMounted.current && contextRevision === pullContextRevision.current) {
        setPullMessage(result.message);
      }
    } catch {
      if (isMounted.current && contextRevision === pullContextRevision.current) {
        setPullMessage('Nao foi possivel verificar a disponibilidade da busca remota agora.');
      }
    } finally {
      if (contextRevision === pullContextRevision.current) {
        pullCheckInProgress.current = false;
        if (isMounted.current) setIsCheckingPull(false);
      }
    }
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
        legadas sem snapshots permanecem bloqueadas. A busca remota e a resolucao de conflitos
        ainda nao estao disponiveis.
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
          disabled={isBusy || isCheckingPull || !isOnline}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {activeAction === 'load-businesses' ? 'Aguarde...' : 'Carregar meus estabelecimentos'}
        </button>

        {businesses.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label htmlFor="cloud-business" className="flex-1 text-sm font-medium text-slate-700">
              Estabelecimento
              <select
                id="cloud-business"
                value={candidateId}
                onChange={(event) => setCandidateId(event.target.value)}
                disabled={isBusy || isCheckingPull}
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
              disabled={isBusy || isCheckingPull || !candidateId || !isOnline}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Usar estabelecimento
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-md bg-slate-100 p-4 text-sm text-slate-700">
        <p>{summary.unscoped} alteracao(oes) local(is) ainda sem estabelecimento.</p>
        <p className="mt-1">
          {summary.awaitingUserBinding} alteracao(oes) elegivel(is) para associacao manual ao
          estabelecimento selecionado.
        </p>
        <p className="mt-1">{summary.selectedBusiness} alteracao(oes) vinculada(s) ao estabelecimento selecionado.</p>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        Associar pendencias grava o usuario na outbox e, quando ainda ausente, o estabelecimento.
        Esse passo nao envia dados e nao altera produtos, categorias ou movimentacoes.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={bindLocalEvents}
          disabled={isBusy || isCheckingPull || !selectedId || !isOnline || summary.awaitingUserBinding === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {activeAction === 'bind' ? 'Processando...' : 'Associar pendencias locais'}
        </button>
        <button
          type="button"
          onClick={pushCompatibleEvents}
          disabled={isBusy || isCheckingPull || !selectedId || !isOnline || summary.selectedBusiness === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {activeAction === 'push'
            ? 'Enviando...'
            : summary.selectedBusiness === 0
              ? 'Nenhuma alteracao compativel para enviar'
              : 'Enviar alteracoes compativeis'}
        </button>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className="font-semibold text-slate-950">Busca manual da nuvem</h4>
        <p className="mt-2 text-sm text-slate-600">
          A busca permanece bloqueada porque o runtime principal ainda nao filtra todas as telas e
          operacoes pelo estabelecimento selecionado, os formularios comuns ainda podem criar
          dados sem escopo e ainda faltam carga inicial segura, cursor, aplicacao local remota e
          tratamento real de conflitos. Esta verificacao e manual e nao baixa dados.
        </p>
        {pullMessage && (
          <p role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {pullMessage}
          </p>
        )}
        <button
          type="button"
          onClick={() => void checkManualPull()}
          disabled={isBusy || isCheckingPull || !selectedId || !isOnline}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isCheckingPull ? 'Verificando busca...' : 'Verificar busca manual da nuvem'}
        </button>
      </div>

      <LegacyDataAssociationSection
        userId={userId}
        businessId={selectedId || undefined}
        businessName={selectedBusinessName}
        isOnline={isOnline}
        isBusy={isBusy || isCheckingPull}
        activeAction={
          activeAction === 'legacy-preview' || activeAction === 'legacy-association'
            ? activeAction
            : null
        }
        runCloudAction={runAction}
        onAssociationCompleted={() => {
          void refreshSummary().catch(() => undefined);
        }}
        service={associationService}
      />
    </section>
  );
}
