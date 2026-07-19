// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataExport } from './DataExport';

const mocks = vi.hoisted(() => ({
  lifecycleState: { status: 'normal' } as { status: string },
  createJsonBackup: vi.fn(),
  createProductsCsv: vi.fn(),
  createMovementsCsv: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('../hooks/useDatabaseLifecycle', () => ({
  useDatabaseLifecycle: () => ({ state: mocks.lifecycleState }),
}));

vi.mock('../services/backupExportService', () => ({
  backupExportService: {
    createJsonBackup: mocks.createJsonBackup,
    createProductsCsv: mocks.createProductsCsv,
    createMovementsCsv: mocks.createMovementsCsv,
  },
}));

vi.mock('../utils/downloadFile', () => ({ downloadFile: mocks.downloadFile }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lifecycleState = { status: 'normal' };
});

afterEach(cleanup);

describe('pagina de dados e backup', () => {
  it('evita double-submit, mostra processamento e confirma o arquivo preparado', async () => {
    let resolveExport: ((file: object) => void) | undefined;
    mocks.createJsonBackup.mockReturnValue(
      new Promise((resolve) => {
        resolveExport = resolve;
      }),
    );
    render(<DataExport />);
    const button = screen.getByRole('button', { name: 'Exportar backup JSON' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.createJsonBackup).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Gerando backup...' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Exportar produtos em CSV' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveExport?.({
      content: '{}',
      fileName: 'stockflow-backup-2026-07-15.json',
      mimeType: 'application/json;charset=utf-8',
    });

    await waitFor(() => {
      expect(mocks.downloadFile).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status').textContent).toContain(
        'stockflow-backup-2026-07-15.json',
      );
    });
  });

  it('mostra erro amigavel sem expor o erro interno', async () => {
    mocks.createProductsCsv.mockRejectedValue(new Error('erro cru do Dexie'));
    render(<DataExport />);

    fireEvent.click(screen.getByRole('button', { name: 'Exportar produtos em CSV' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Nao foi possivel exportar os dados. Tente novamente.',
      );
    });
    expect(screen.queryByText(/Dexie/)).toBeNull();
    expect(mocks.downloadFile).not.toHaveBeenCalled();
  });

  it('bloqueia exportacoes em estado terminal sem tentar reabrir o banco', () => {
    mocks.lifecycleState = { status: 'reload-required' };
    render(<DataExport />);

    expect(screen.getAllByRole('button')).toHaveLength(3);
    screen
      .getAllByRole('button')
      .forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByRole('alert').textContent).toContain('aguarda uma recarga segura');
    expect(mocks.createJsonBackup).not.toHaveBeenCalled();
  });
});
