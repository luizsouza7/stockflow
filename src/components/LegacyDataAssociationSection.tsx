import { useEffect, useRef, useState } from 'react';
import {
  legacyDataAssociationService,
  type LegacyAssociationPreview,
  type LegacyDataAssociationService,
} from '../services/sync/legacyDataAssociationService';

export type LegacyAssociationAction = 'legacy-preview' | 'legacy-association';

interface LegacyDataAssociationSectionProps {
  userId: string;
  businessId?: string;
  businessName?: string;
  isOnline: boolean;
  isBusy: boolean;
  activeAction: LegacyAssociationAction | null;
  runCloudAction(
    actionName: LegacyAssociationAction,
    action: () => Promise<void>,
  ): Promise<void>;
  onAssociationCompleted?: () => void | Promise<void>;
  service?: LegacyDataAssociationService;
}

export function LegacyDataAssociationSection({
  userId,
  businessId,
  businessName,
  isOnline,
  isBusy,
  activeAction,
  runCloudAction,
  onAssociationCompleted,
  service = legacyDataAssociationService,
}: LegacyDataAssociationSectionProps) {
  const [preview, setPreview] = useState<LegacyAssociationPreview>();
  const [previewMessage, setPreviewMessage] = useState('');
  const [resultMessage, setResultMessage] = useState('');
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
    setPreviewMessage('');
    setResultMessage('');
    setError('');
    setConfirmed(false);
  }, [userId, businessId, isOnline]);

  function requestPreview() {
    setPreview(undefined);
    setPreviewMessage('');
    setResultMessage('');
    setError('');
    setConfirmed(false);
    const revision = contextRevision.current;
    void runCloudAction('legacy-preview', async () => {
      try {
        const result = await service.preview({ userId, businessId, isOnline });
        if (!isMounted.current || revision !== contextRevision.current) return;
        setPreview(result.preview);
        setPreviewMessage(result.message);
        setResultMessage('');
        setError(result.status === 'blocked' ? result.message : '');
        setConfirmed(false);
      } catch {
        if (isMounted.current && revision === contextRevision.current) {
          setError('Não foi possível preparar a prévia dos dados locais agora.');
        }
      }
    });
  }

  function confirmAssociation() {
    if (!preview) return;
    const revision = contextRevision.current;
    const expectedSnapshotToken = preview.snapshotToken;
    void runCloudAction('legacy-association', async () => {
      try {
        const result = await service.associate({
          userId,
          businessId,
          isOnline,
          confirmed,
          expectedSnapshotToken,
        });
        if (!isMounted.current || revision !== contextRevision.current) return;
        setConfirmed(false);
        if (result.status === 'blocked') {
          setError(result.message);
          setResultMessage('');
          setPreview(undefined);
          setPreviewMessage('Gere uma nova prévia antes de tentar novamente.');
          return;
        }
        setError('');
        setPreview(undefined);
        setPreviewMessage('');
        setResultMessage(
          `${result.message} Categorias: ${result.associated.categories}; produtos: ${result.associated.products}; movimentações: ${result.associated.movements}.`,
        );
        void Promise.resolve(onAssociationCompleted?.()).catch(() => undefined);
      } catch {
        if (isMounted.current && revision === contextRevision.current) {
          setError('Não foi possível associar os dados locais. Nenhuma alteração parcial foi mantida.');
        }
      }
    });
  }

  const hasLegacyData = preview
    ? preview.categories + preview.products + preview.movements > 0
    : false;
  const hasBlockers = (preview?.blockers.length ?? 0) > 0;
  const canAssociate =
    Boolean(businessId) &&
    isOnline &&
    hasLegacyData &&
    !hasBlockers &&
    confirmed &&
    !isBusy;

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <h4 className="font-semibold text-slate-950">Associar dados locais antigos</h4>
      <p className="mt-2 text-sm text-slate-600">
        A operação associa integralmente todas as categorias, produtos e movimentações ainda sem
        estabelecimento. Ela não envia dados, não executa pull e não suporta associação parcial.
        Recomenda-se criar um backup antes de confirmar.
      </p>
      <p className="mt-2 text-sm font-medium text-slate-700">
        Destino: {businessName ?? (businessId ? 'estabelecimento selecionado e validado' : 'nenhum estabelecimento selecionado')}
      </p>
      <p className="mt-2 text-sm text-amber-700">
        A associação não pode ser desfeita pelo fluxo comum. Movimentos históricos não serão
        reexecutados e entidades sem evento de outbox não serão enviadas automaticamente.
      </p>

      <button
        type="button"
        onClick={requestPreview}
        disabled={isBusy || !businessId || !isOnline}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {activeAction === 'legacy-preview' ? 'Preparando prévia...' : 'Revisar dados locais antigos'}
      </button>

      {previewMessage && (
        <p role="status" className="mt-3 text-sm font-medium text-slate-700">{previewMessage}</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
      {resultMessage && (
        <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{resultMessage}</p>
      )}

      {preview && (
        <div className="mt-4 rounded-md bg-slate-100 p-4 text-sm text-slate-700">
          <p>Categorias legadas: {preview.categories}</p>
          <p>Produtos legados: {preview.products}</p>
          <p>Movimentações legadas: {preview.movements}</p>
          <p>Eventos relacionados: {preview.relatedOutbox}</p>
          <p>Eventos totalmente sem contexto: {preview.fullyUnscopedOutbox}</p>
          <p>Eventos já scoped para o destino: {preview.selectedBusinessOutbox}</p>
          <p>Bloqueadores: {preview.blockers.length}</p>
          {preview.blockers.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {preview.blockers.map((blocker, index) => (
                <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview && hasLegacyData && !hasBlockers && (
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={isBusy}
            className="mt-1"
          />
          Confirmo que desejo associar o conjunto completo ao estabelecimento selecionado.
        </label>
      )}

      <button
        type="button"
        onClick={confirmAssociation}
        disabled={!canAssociate}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {activeAction === 'legacy-association'
          ? 'Associando dados...'
          : 'Associar dados ao estabelecimento'}
      </button>
    </div>
  );
}
