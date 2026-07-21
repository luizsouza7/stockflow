// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { BusinessContextService } from '../services/businessContextService';
import type { ManualPushService } from '../services/sync/manualPushService';
import { ManualCloudPushPanel } from './ManualCloudPushPanel';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';

afterEach(cleanup);

describe('painel de push manual', () => {
  it('mostra Supabase ausente sem quebrar dados locais', () => {
    const context = createContext();
    context.isConfigured.mockReturnValue(false);
    renderPanel({ context });
    expect(screen.getByText(/Supabase nao esta configurado/)).toBeTruthy();
    expect(screen.getByText(/dados locais continuam neste dispositivo/)).toBeTruthy();
  });

  it('mostra offline e desabilita chamadas remotas', () => {
    const context = createContext();
    renderPanel({ context, isOnline: false });
    expect(screen.getByText(/Nenhuma tentativa remota sera feita/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Carregar meus estabelecimentos/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(context.listAvailable).not.toHaveBeenCalled();
  });

  it('carrega, valida e seleciona somente estabelecimento listado', async () => {
    const context = createContext();
    context.listAvailable.mockResolvedValue([{ id: BUSINESS_ID, name: 'Loja Central' }]);
    renderPanel({ context });

    fireEvent.click(screen.getByRole('button', { name: 'Carregar meus estabelecimentos' }));
    await screen.findByRole('option', { name: 'Loja Central' });
    fireEvent.click(screen.getByRole('button', { name: 'Usar estabelecimento' }));

    await waitFor(() => expect(context.select).toHaveBeenCalledWith(USER_ID, BUSINESS_ID));
    expect(await screen.findByText(/selecionado e validado/)).toBeTruthy();
  });

  it('mostra quantidades locais sem prometer sincronizacao completa', async () => {
    const push = createPushService({ unscoped: 2, selectedBusiness: 3 });
    renderPanel({ push });
    expect(await screen.findByText(/2 alteracao\(oes\).*sem estabelecimento/)).toBeTruthy();
    expect(screen.getByText(/3 alteracao\(oes\).*vinculada/)).toBeTruthy();
    expect(screen.queryByText(/Tudo sincronizado/i)).toBeNull();
  });

  it('associacao local e envio sao acoes separadas', async () => {
    const push = createPushService({ unscoped: 1, selectedBusiness: 1 });
    renderPanel({ push });
    await screen.findByText(/1 alteracao\(oes\).*sem estabelecimento/);

    fireEvent.click(screen.getByRole('button', { name: 'Associar pendencias locais' }));

    await waitFor(() => expect(push.bindLocalEvents).toHaveBeenCalledTimes(1));
    expect(push.push).not.toHaveBeenCalled();
    expect(await screen.findByText(/Nenhum dado foi enviado/)).toBeTruthy();
  });

  it('push ocorre somente pelo botao manual', async () => {
    const push = createPushService({ unscoped: 0, selectedBusiness: 1 });
    renderPanel({ push });
    await screen.findByText(/1 alteracao\(oes\).*vinculada/);
    expect(push.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar alteracoes compativeis' }));

    await waitFor(() => expect(push.push).toHaveBeenCalledTimes(1));
  });

  it('mostra loading e bloqueia double-submit', async () => {
    let complete: (() => void) | undefined;
    const push = createPushService({ unscoped: 0, selectedBusiness: 1 });
    push.push.mockReturnValue(new Promise((resolve) => {
      complete = () => resolve({
        status: 'completed',
        message: '1 alteracao compativel foi enviada. Pull ainda nao existe.',
        claimed: 1,
        succeeded: 1,
        failed: 0,
      });
    }));
    renderPanel({ push });
    const button = await screen.findByRole('button', { name: 'Enviar alteracoes compativeis' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(push.push).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeTruthy();
    complete?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar alteracoes compativeis' })).toBeTruthy());
  });

  it('mensagem de sucesso inclui movimentos rastreados e preserva limite de pull', async () => {
    const push = createPushService({ unscoped: 0, selectedBusiness: 1 });
    renderPanel({ push });
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar alteracoes compativeis' }));

    expect(await screen.findByText(/movimentacoes rastreadas sao aceitos; pull ainda nao existe/i)).toBeTruthy();
    expect(screen.queryByText(/sincronizado completamente|tudo sincronizado/i)).toBeNull();
  });

  it('explica limites de movimentos legados, pull e conflitos', () => {
    renderPanel({});
    expect(screen.getByText(/movimentacoes rastreadas compativeis/i)).toBeTruthy();
    expect(screen.getByText(/legadas sem snapshots permanecem bloqueadas/i)).toBeTruthy();
    expect(screen.getByText(/Pull e resolucao de conflitos ainda nao estao disponiveis/i)).toBeTruthy();
    expect(screen.getByText(/resolucao de conflitos ainda nao estao disponiveis/)).toBeTruthy();
  });

  it('mostra falha parcial amigavel sem prometer sincronizacao completa', async () => {
    const push = createPushService({ unscoped: 0, selectedBusiness: 1 });
    push.push.mockResolvedValue({
      status: 'completed',
      message: '0 enviada(s) e 1 mantida(s) com erro local e backoff. Movimentacoes legadas ou divergentes exigem atencao; pull ainda nao existe.',
      claimed: 1,
      succeeded: 0,
      failed: 1,
    });
    renderPanel({ push });
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar alteracoes compativeis' }));

    expect(await screen.findByText(/legadas ou divergentes exigem atencao/)).toBeTruthy();
    expect(screen.queryByText(/sincronizacao completa|tudo sincronizado/i)).toBeNull();
  });
});

function renderPanel({
  context = createContext(),
  push = createPushService({ unscoped: 0, selectedBusiness: 1 }),
  isOnline = true,
}: {
  context?: ReturnType<typeof createContext>;
  push?: ReturnType<typeof createPushService>;
  isOnline?: boolean;
}) {
  render(
    <ManualCloudPushPanel
      session={createSession()}
      isOnline={isOnline}
      contextService={context}
      pushService={push}
    />,
  );
}

function createContext() {
  return {
    isConfigured: vi.fn<BusinessContextService['isConfigured']>().mockReturnValue(true),
    listAvailable: vi.fn<BusinessContextService['listAvailable']>().mockResolvedValue([]),
    validateMembership: vi.fn<BusinessContextService['validateMembership']>().mockResolvedValue(true),
    select: vi.fn<BusinessContextService['select']>().mockResolvedValue(undefined),
    getSelected: vi.fn<BusinessContextService['getSelected']>().mockReturnValue(BUSINESS_ID),
    clearSelected: vi.fn<BusinessContextService['clearSelected']>(),
  };
}

function createPushService(summary: { unscoped: number; selectedBusiness: number }) {
  return {
    getLocalSummary: vi.fn<ManualPushService['getLocalSummary']>().mockResolvedValue(summary),
    bindLocalEvents: vi.fn<ManualPushService['bindLocalEvents']>().mockResolvedValue({
      status: 'completed',
      message: '1 alteracao local foi associada. Nenhum dado foi enviado.',
      bound: 1,
    }),
    push: vi.fn<ManualPushService['push']>().mockResolvedValue({
      status: 'completed',
      message: '1 alteracao compativel foi enviada. Categorias, produtos e movimentacoes rastreadas sao aceitos; pull ainda nao existe.',
      claimed: 1,
      succeeded: 1,
      failed: 0,
    }),
  };
}

function createSession(): Session {
  return {
    access_token: 'token-de-teste',
    refresh_token: 'refresh-de-teste',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'pessoa@stockflow.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-07-19T00:00:00.000Z',
    },
  };
}
