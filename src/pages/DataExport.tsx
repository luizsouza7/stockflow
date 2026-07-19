import { useRef, useState } from 'react';
import { useDatabaseLifecycle } from '../hooks/useDatabaseLifecycle';
import {
  backupExportService,
  type ExportFile,
} from '../services/backupExportService';
import { downloadFile } from '../utils/downloadFile';

type ExportAction = 'backup' | 'products' | 'movements';

const EXPORT_ACTIONS: Record<
  ExportAction,
  { label: string; pendingLabel: string; createFile: () => Promise<ExportFile> }
> = {
  backup: {
    label: 'Exportar backup JSON',
    pendingLabel: 'Gerando backup...',
    createFile: () => backupExportService.createJsonBackup(),
  },
  products: {
    label: 'Exportar produtos em CSV',
    pendingLabel: 'Exportando produtos...',
    createFile: () => backupExportService.createProductsCsv(),
  },
  movements: {
    label: 'Exportar movimentacoes em CSV',
    pendingLabel: 'Exportando movimentacoes...',
    createFile: () => backupExportService.createMovementsCsv(),
  },
};

export function DataExport() {
  const { state: databaseLifecycleState } = useDatabaseLifecycle();
  const [activeAction, setActiveAction] = useState<ExportAction>();
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const exportInProgress = useRef(false);
  const isDatabaseAvailable = databaseLifecycleState.status === 'normal';

  async function handleExport(action: ExportAction) {
    if (exportInProgress.current) return;

    if (!isDatabaseAvailable) {
      setSuccess('');
      setError('Recarregue o StockFlow antes de exportar os dados locais.');
      return;
    }

    exportInProgress.current = true;
    setActiveAction(action);
    setSuccess('');
    setError('');

    try {
      const file = await EXPORT_ACTIONS[action].createFile();
      downloadFile(file);
      setSuccess(`Arquivo ${file.fileName} gerado com sucesso.`);
    } catch {
      setError('Nao foi possivel exportar os dados. Tente novamente.');
    } finally {
      exportInProgress.current = false;
      setActiveAction(undefined);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-950">Dados e backup</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Exporte uma copia dos dados armazenados neste dispositivo para guardar como backup.
          A exportacao nao apaga nem altera seus dados e funciona sem internet.
        </p>
      </section>

      {!isDatabaseAvailable && (
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          A exportacao esta indisponivel enquanto o armazenamento local aguarda uma recarga segura.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {success}
        </p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">Backup completo</h2>
        <p className="mt-2 text-sm text-slate-600">
          Inclui categorias, produtos e movimentacoes, inclusive registros excluidos logicamente
          e o historico disponivel. O arquivo e local: ele nao e enviado para a nuvem.
        </p>
        <button
          type="button"
          onClick={() => void handleExport('backup')}
          disabled={activeAction !== undefined || !isDatabaseAvailable}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {activeAction === 'backup' ? EXPORT_ACTIONS.backup.pendingLabel : EXPORT_ACTIONS.backup.label}
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">Planilhas CSV</h2>
        <p className="mt-2 text-sm text-slate-600">
          Gere arquivos separados para consultar produtos ou movimentacoes em uma planilha.
          Para preservar todos os dados e relacionamentos, prefira tambem guardar o backup JSON.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {(['products', 'movements'] as const).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => void handleExport(action)}
              disabled={activeAction !== undefined || !isDatabaseAvailable}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-brand-700 bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {activeAction === action
                ? EXPORT_ACTIONS[action].pendingLabel
                : EXPORT_ACTIONS[action].label}
            </button>
          ))}
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
        <strong>Guarde os arquivos com cuidado.</strong> Eles contem dados do seu negocio
        armazenados neste dispositivo. Esta funcao nao cria backup automatico, sincronizacao ou
        recuperacao em nuvem.
      </aside>
    </div>
  );
}

