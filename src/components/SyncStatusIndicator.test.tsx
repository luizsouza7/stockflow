// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import type { SyncStatusSummary } from '../types/Sync';
import type { DatabaseLifecycleState } from '../services/db/databaseLifecycle';

afterEach(cleanup);

function summary({
  pending = 0,
  processing = 0,
  error = 0,
  conflict = 0,
}: Partial<SyncStatusSummary> = {}): SyncStatusSummary {
  return {
    pending,
    processing,
    error,
    conflict,
    totalAwaitingAction: pending + processing + error + conflict,
  };
}

function renderIndicator({
  pending = 0,
  processing = 0,
  error = 0,
  conflict = 0,
  isOnline = true,
  lifecycle = 'normal',
}: {
  pending?: number;
  processing?: number;
  error?: number;
  conflict?: number;
  isOnline?: boolean;
  lifecycle?: DatabaseLifecycleState['status'];
} = {}) {
  const service = {
    getStatusSummary: vi
      .fn()
      .mockResolvedValue(summary({ pending, processing, error, conflict })),
  };
  render(
    <SyncStatusIndicator
      isOnline={isOnline}
      databaseLifecycleStatus={lifecycle}
      service={service}
    />,
  );
  return service;
}

describe('indicador local de sincronizacao futura', () => {
  it('mostra a quantidade de alteracoes pendentes', async () => {
    renderIndicator({ pending: 4 });
    expect(await screen.findByText(/4 alteracoes aguardando processamento futuro/)).toBeTruthy();
  });

  it('mostra processing com texto amigavel e local', async () => {
    renderIndicator({ processing: 2 });
    expect(await screen.findByText(/2 alteracoes em processamento local/)).toBeTruthy();
  });

  it('mostra error como espera por nova tentativa local', async () => {
    renderIndicator({ error: 1 });
    expect(await screen.findByText(/1 alteracao com erro aguardando nova tentativa local/)).toBeTruthy();
  });

  it('mostra conflict previsto sem prometer resolucao', async () => {
    renderIndicator({ conflict: 1 });
    expect(await screen.findByText(/1 alteracao marcada como conflito/)).toBeTruthy();
  });

  it('mantem mensagem honesta sem depender de login ou Supabase configurado', async () => {
    renderIndicator({ pending: 1 });
    expect(await screen.findByText(/dados continuam apenas neste dispositivo/)).toBeTruthy();
    expect(screen.queryByText(/salvo na nuvem|sincronizado na nuvem/i)).toBeNull();
  });

  it('continua funcionando offline', async () => {
    renderIndicator({ pending: 2, isOnline: false });
    expect(await screen.findByText(/Sem internet; o uso local continua disponivel/)).toBeTruthy();
  });

  it('mostra estado adequado quando a outbox esta vazia', async () => {
    renderIndicator();
    expect(await screen.findByText(/Nenhuma alteracao local pendente/)).toBeTruthy();
    expect(screen.getByText(/Sincronizacao remota ainda nao esta disponivel/)).toBeTruthy();
    expect(screen.queryByText(/Tudo sincronizado/i)).toBeNull();
  });

  it('nao consulta o banco quando o lifecycle exige reload', async () => {
    const service = renderIndicator({ lifecycle: 'reload-required' });
    expect(screen.getByText(/Recarregue a pagina antes de consultar/)).toBeTruthy();
    await waitFor(() => expect(service.getStatusSummary).not.toHaveBeenCalled());
  });
});
