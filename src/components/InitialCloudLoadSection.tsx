import { useEffect, useRef, useState } from 'react';
import {
  initialCloudLoadService,
  type InitialCloudLoadPreview,
  type InitialCloudLoadService,
} from '../services/sync/initialCloudLoadService';

export type InitialCloudLoadAction = 'initial-load-preview' | 'initial-load-execute';

interface InitialCloudLoadSectionProps {
  userId: string;
  businessId?: string;
  businessName?: string;
  isOnline: boolean;
  isBusy: boolean;
  activeAction: InitialCloudLoadAction | null;
  runCloudAction(
    actionName: InitialCloudLoadAction,
    action: () => Promise<void>,
  ): Promise<void>;
  service?: InitialCloudLoadService;
}

const REMOTE_LABELS: Record<InitialCloudLoadPreview['remoteState'], string> = {
  empty: 'vazio e elegivel',
  initialized: 'ja inicializado',
  'contains-data': 'contem dados ou operacoes',
  unavailable: 'indisponivel',
};

export function InitialCloudLoadSection({
  userId,
  businessId,
  businessName,
  isOnline,
  isBusy,
  activeAction,
  runCloudAction,
  service = initialCloudLoadService,
}: InitialCloudLoadSectionProps) {
  const [preview, setPreview] = useState<InitialCloudLoadPreview>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const contextRevision = useRef(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    contextRevision.current += 1;
    setPreview(undefined);
    setMessage('');
    setError('');
    setConfirmed(false);
  }, [userId, businessId, businessName, isOnline]);

  function requestPreview() {
    const revision = contextRevision.current;
    setPreview(undefined);
    setMessage('');
    setError('');
    setConfirmed(false);
    void runCloudAction('initial-load-preview', async () => {
      const result = await service.preview({
        userId,
        businessId,
        businessName,
        isOnline,
      });
      if (!isMounted.current || revision !== contextRevision.current) return;
      setPreview(result.preview);
      setMessage(result.message);
      setError(result.status === 'blocked' ? result.message : '');
    });
  }

  function executeLoad() {
    if (!preview) return;
    const revision = contextRevision.current;
    void runCloudAction('initial-load-execute', async () => {
      try {
        const result = await service.execute({
          userId,
          businessId,
          businessName,
          isOnline,
          confirmed,
          preview,
        });
        if (!isMounted.current || revision !== contextRevision.current) return;
        setConfirmed(false);
        if (result.status === 'blocked') {
          setError(result.message);
          setMessage('');
          if (result.recoveryPreview) {
            setPreview(result.recoveryPreview);
          } else if (/mudaram|contexto|previa/i.test(result.message)) {
            setPreview(undefined);
          }
          return;
        }
        setError('');
        setMessage(
          `${result.message} Categorias: ${result.result?.categories ?? 0}; produtos: ${result.result?.products ?? 0}. O pull continua bloqueado.`,
        );
        setPreview(undefined);
      } catch (caught) {
        if (!isMounted.current || revision !== contextRevision.current) return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'Nao foi possivel concluir a carga inicial. Nenhum dado local foi alterado.',
        );
      }
    });
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <h4 className="font-semibold text-slate-950">Preparar dados iniciais na nuvem</h4>
      <p className="mt-2 text-sm text-slate-600">
        Cria na nuvem um snapshot das categorias e produtos deste estabelecimento. O saldo atual
        vira o saldo inicial; movimentos historicos nao sao enviados. O destino precisa estar
        comprovadamente vazio e nenhuma informacao remota sera sobrescrita.
      </p>
      <p className="mt-2 text-sm font-medium text-slate-700">
        Estabelecimento: {businessName ?? (businessId ? 'selecionado' : 'nenhum selecionado')}
      </p>
      <p className="mt-2 text-sm text-amber-700">
        A acao e manual, nao libera pull, cursor, conflitos reais ou sincronizacao automatica.
        Gere um backup antes de confirmar.
      </p>

      <button
        type="button"
        onClick={requestPreview}
        disabled={isBusy || !businessId || !isOnline}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {activeAction === 'initial-load-preview'
          ? 'Verificando estado local e remoto...'
          : 'Revisar carga inicial'}
      </button>

      {message && <p role="status" className="mt-3 text-sm font-medium text-slate-700">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

      {preview && (
        <div className="mt-4 space-y-3 rounded-md bg-slate-100 p-4 text-sm text-slate-700">
          <div>
            <p>Categorias: {preview.categories} ({preview.activeCategories} ativas; {preview.deletedCategories} excluidas)</p>
            <p>Produtos: {preview.products} ({preview.activeProducts} ativos; {preview.deletedProducts} excluidos)</p>
            <p>Saldo total informativo: {preview.totalCurrentQuantity}</p>
            <p>Movimentos historicos que permanecerao locais: {preview.historicalMovements}</p>
            <p>Eventos bloqueadores da outbox: {preview.blockingOutbox}</p>
            <p>Eventos que serao reservados e absorvidos pelo snapshot: {preview.reservableOutbox}</p>
          </div>
          <div>
            <p>
              Situacao remota:{' '}
              {preview.remoteCommitConfirmed
                ? 'carga confirmada; baseline local pendente'
                : REMOTE_LABELS[preview.remoteState]}
            </p>
            <p>Categorias remotas: {preview.remote.categories}</p>
            <p>Produtos remotos: {preview.remote.products}</p>
            <p>Movimentos remotos: {preview.remote.movements}</p>
            <p>Operacoes de sync remotas: {preview.remote.syncOperations}</p>
          </div>
          {preview.blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {preview.blockers.map((blocker, index) => (
                <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
              ))}
            </ul>
          )}
          <ul className="list-disc space-y-1 pl-5 text-amber-800">
            {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      {preview?.eligible && (
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={isBusy}
            className="mt-1"
          />
          {preview.reservationOperationId
            ? 'Confirmo que desejo continuar a operacao reservada com a mesma chave e o mesmo snapshot, sem liberar os eventos para push individual.'
            : 'Confirmo que categorias e produtos serao criados na nuvem, usando o saldo atual como saldo inicial, sem enviar movimentos historicos.'}
        </label>
      )}

      <button
        type="button"
        onClick={executeLoad}
        disabled={!preview?.eligible || !confirmed || isBusy || !isOnline}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {activeAction === 'initial-load-execute'
          ? 'Preparando estado na nuvem...'
          : preview?.reservationOperationId
            ? 'Continuar carga reservada'
            : 'Preparar estado atual na nuvem'}
      </button>
    </div>
  );
}
