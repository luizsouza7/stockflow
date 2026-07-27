import { useEffect, useRef, useState } from 'react';
import type { RemoteInventoryPage } from '../types/RemoteInventory';
import {
  remoteInventoryReadService,
  type RemoteInventoryReadService,
} from '../services/sync/remoteInventoryReadService';
import { RemoteInventoryReadError } from '../services/sync/remoteInventoryReadGateway';

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const;
const MAXIMUM_REMOTE_LABEL_LENGTH = 120;

interface RemoteInventoryInspectionSectionProps {
  userId: string;
  businessId?: string;
  isOnline: boolean;
  disabled?: boolean;
  service?: RemoteInventoryReadService;
}

export function RemoteInventoryInspectionSection({
  userId,
  businessId,
  isOnline,
  disabled = false,
  service = remoteInventoryReadService,
}: RemoteInventoryInspectionSectionProps) {
  const [page, setPage] = useState<RemoteInventoryPage | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const requestInProgress = useRef(false);
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
    requestInProgress.current = false;
    setPage(null);
    setPageIndex(0);
    setPageSizeInput(String(DEFAULT_PAGE_SIZE));
    setIsLoading(false);
    setError('');
  }, [userId, businessId]);

  function reset() {
    contextRevision.current += 1;
    requestInProgress.current = false;
    setPage(null);
    setPageIndex(0);
    setPageSizeInput(String(DEFAULT_PAGE_SIZE));
    setIsLoading(false);
    setError('');
  }

  async function read(kind: 'first' | 'next') {
    if (requestInProgress.current || disabled || !businessId || !isOnline) return;
    if (kind === 'next' && !page?.nextCursor) return;

    const requestedPageSize = Number(pageSizeInput);
    if (
      !Number.isSafeInteger(requestedPageSize)
      || requestedPageSize < 1
      || requestedPageSize > 200
    ) {
      setError('Escolha uma quantidade valida entre 1 e 200 itens por pagina.');
      return;
    }

    const revision = contextRevision.current;
    requestInProgress.current = true;
    setIsLoading(true);
    setError('');

    try {
      const input = { userId, businessId, pageSize: requestedPageSize };
      const result =
        kind === 'first'
          ? await service.readFirstRemoteInventoryPage(input)
          : await service.readNextRemoteInventoryPage({
              ...input,
              cursor: page!.nextCursor!,
            });
      if (isMounted.current && revision === contextRevision.current) {
        setPage(result);
        setPageIndex((current) => (kind === 'first' ? 1 : current + 1));
      }
    } catch (caught) {
      if (isMounted.current && revision === contextRevision.current) {
        setError(
          caught instanceof RemoteInventoryReadError
            ? caught.message
            : 'Nao foi possivel concluir a inspecao remota agora.',
        );
      }
    } finally {
      if (revision === contextRevision.current) {
        requestInProgress.current = false;
        if (isMounted.current) setIsLoading(false);
      }
    }
  }

  const counts = page?.items.reduce(
    (summary, item) => {
      summary[item.entityType] += 1;
      if (item.deletedAt) summary.deleted += 1;
      return summary;
    },
    { category: 0, product: 0, movement: 0, deleted: 0 },
  ) ?? { category: 0, product: 0, movement: 0, deleted: 0 };

  const actionsDisabled = disabled || isLoading || !businessId || !isOnline;

  return (
    <section className="mt-6 border-t border-slate-200 pt-5" aria-labelledby="remote-inspection-title">
      <h4 id="remote-inspection-title" className="font-semibold text-slate-950">
        Inspecao remota paginada
      </h4>
      <p className="mt-2 text-sm font-medium text-slate-700">
        Esta leitura nao altera os dados deste dispositivo.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        A pagina atual fica apenas em memoria. O cursor serve somente para avancar nesta sessao de
        inspecao e desaparece ao recarregar a pagina.
      </p>

      <div className="mt-4 max-w-xs">
        <label htmlFor="remote-inventory-page-size" className="text-sm font-semibold text-slate-700">
          Itens por página
        </label>
        <select
          id="remote-inventory-page-size"
          value={pageSizeInput}
          onChange={(event) => setPageSizeInput(event.target.value)}
          disabled={disabled || isLoading}
          className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-600">
          Tamanho selecionado: {pageSizeInput || 'invalido'} itens.
        </p>
      </div>

      {!isOnline && (
        <p role="status" className="mt-3 text-sm text-amber-800">
          Conecte-se a internet para consultar o inventario remoto.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void read('first')}
          disabled={actionsDisabled}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isLoading && pageIndex === 0 ? 'Lendo pagina...' : 'Ler primeira pagina'}
        </button>
        <button
          type="button"
          onClick={() => void read('next')}
          disabled={actionsDisabled || !page?.hasMore || !page.nextCursor}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isLoading && pageIndex > 0 ? 'Carregando pagina...' : 'Carregar proxima pagina'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={isLoading || (!page && !error)}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          Reiniciar leitura
        </button>
      </div>

      {isLoading && <p role="status" className="mt-3 text-sm text-slate-600">Leitura remota em andamento...</p>}

      {page && (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-2 rounded-md bg-slate-100 p-4 text-sm text-slate-700 sm:grid-cols-2">
            <div><dt className="font-semibold">Pagina</dt><dd>{pageIndex}</dd></div>
            <div><dt className="font-semibold">Tamanho retornado da pagina</dt><dd>{page.pageSize}</dd></div>
            <div><dt className="font-semibold">Quantidade retornada</dt><dd>{page.returnedCount}</dd></div>
            <div><dt className="font-semibold">Mais paginas</dt><dd>{page.hasMore ? 'Sim' : 'Nao'}</dd></div>
            <div><dt className="font-semibold">Watermark da sessao</dt><dd>{page.watermark}</dd></div>
          </dl>
          <p className="text-sm text-slate-700">
            Categorias: {counts.category} · Produtos: {counts.product} · Movimentos: {counts.movement} ·
            Excluidos: {counts.deleted}
          </p>
          {page.items.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhum item remoto nesta pagina.</p>
          ) : (
            <ul className="space-y-2">
              {page.items.map((item) => (
                <li
                  key={`${item.entityType}:${item.entityId}:${item.version}:${item.sortTime}`}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <span className="font-semibold">
                    {item.entityType === 'category'
                      ? 'Categoria'
                      : item.entityType === 'product'
                        ? 'Produto'
                        : 'Movimento'}
                  </span>
                  {' · '}
                  {item.entityType === 'movement'
                    ? `${item.data.type} de ${item.data.quantity}`
                    : summarizeRemoteLabel(item.data.name, MAXIMUM_REMOTE_LABEL_LENGTH)}
                  {' · '}versao {item.version}
                  {item.deletedAt && (
                    <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                      Excluido
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function summarizeRemoteLabel(value: string, maximumLength: number): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (!normalized) return 'Sem nome';
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maximumLength - 1))}…`;
}
