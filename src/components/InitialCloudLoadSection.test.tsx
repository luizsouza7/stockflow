// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  InitialCloudLoadPreview,
  InitialCloudLoadService,
} from '../services/sync/initialCloudLoadService';
import { InitialCloudLoadSection } from './InitialCloudLoadSection';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';

afterEach(cleanup);

describe('secao de carga inicial na Conta', () => {
  it('exibe estabelecimento e explica snapshot sem sync completa', () => {
    renderSection();
    expect(screen.getByText(/Preparar dados iniciais na nuvem/)).toBeTruthy();
    expect(screen.getByText(/Estabelecimento: Loja Central/)).toBeTruthy();
    expect(screen.getByText(/nao libera pull, cursor, conflitos reais ou sincronizacao automatica/)).toBeTruthy();
  });

  it('preview mostra contagens, soft deletes e movimentos nao enviados', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar carga inicial' }));
    expect(await screen.findByText(/Categorias: 2 \(1 ativas; 1 excluidas\)/)).toBeTruthy();
    expect(screen.getByText(/Produtos: 3 \(2 ativos; 1 excluidos\)/)).toBeTruthy();
    expect(screen.getByText(/Movimentos historicos que permanecerao locais: 4/)).toBeTruthy();
    expect(screen.getByText(/Situacao remota: vazio e elegivel/)).toBeTruthy();
  });

  it('exige checkbox explicito antes da execucao', async () => {
    const service = createService();
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar carga inicial' }));
    const execute = await screen.findByRole('button', { name: 'Preparar estado atual na nuvem' });
    expect((execute as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect((execute as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(execute);
    await waitFor(() => expect(service.execute).toHaveBeenCalledTimes(1));
  });

  it('bloqueia botao quando remoto nao esta vazio', async () => {
    const service = createService({
      ...readyPreview(),
      eligible: false,
      remoteState: 'contains-data',
      remote: { ...readyPreview().remote, products: 1 },
      blockers: [{ code: 'remote-not-empty', message: 'O remoto contem dados.' }],
    });
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar carga inicial' }));
    const execute = await screen.findByRole('button', { name: 'Preparar estado atual na nuvem' });
    expect((execute as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('explica que outbox pendente compativel sera reservada e absorvida', async () => {
    const service = createService({
      ...readyPreview(),
      eligible: true,
      blockingOutbox: 0,
      reservableOutbox: 1,
      reservableEventIds: ['evento-pendente'],
    });
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar carga inicial' }));
    expect(await screen.findByText(/Eventos que serao reservados e absorvidos pelo snapshot: 1/)).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('mostra resumo de sucesso e reafirma pull bloqueado', async () => {
    const service = createService();
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar carga inicial' }));
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Preparar estado atual na nuvem' }));
    expect(await screen.findByText(/Categorias: 2; produtos: 3. O pull continua bloqueado/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    const execute = screen.getByRole('button', {
      name: 'Preparar estado atual na nuvem',
    }) as HTMLButtonElement;
    expect(execute.disabled).toBe(true);
    fireEvent.click(execute);
    expect(service.execute).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/continuar a operacao reservada/i)).toBeNull();
  });

  it('mantem previa recuperavel quando remoto confirmou e baseline local falhou', async () => {
    const preview = readyPreview();
    const recoveryPreview = {
      ...preview,
      reservationOperationId: 'inventory-bootstrap:key',
      remoteCommitConfirmed: true,
      confirmedRemoteResult: {
        categories: 2,
        products: 3,
        wasDuplicate: false,
      },
    };
    const service = createService(preview);
    service.execute = vi.fn(async () => ({
      status: 'blocked' as const,
      message: 'A carga remota foi confirmada, mas a baseline local falhou.',
      recoveryPreview,
    }));
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar carga inicial' }));
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Preparar estado atual na nuvem' }));

    expect(await screen.findByText(/baseline local pendente/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar carga reservada' })).toBeTruthy();
    expect(screen.getByText(/mesma chave e o mesmo snapshot/)).toBeTruthy();
  });

  it('invalida resultado ao trocar contexto', async () => {
    const { rerender } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar carga inicial' }));
    await screen.findByText(/Situacao remota/);
    rerender(element(createService(), '33333333-3333-4333-8333-333333333333'));
    expect(screen.queryByText(/Situacao remota/)).toBeNull();
  });

  it('respeita lock compartilhado e offline', () => {
    render(element(createService(), BUSINESS_ID, true, true));
    expect((screen.getByRole('button', { name: 'Revisar carga inicial' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(element(createService(), BUSINESS_ID, false, false));
    expect((screen.getByRole('button', { name: 'Revisar carga inicial' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

function readyPreview(): InitialCloudLoadPreview {
  return {
    userId: USER_ID,
    businessId: BUSINESS_ID,
    businessName: 'Loja Central',
    categories: 2,
    activeCategories: 1,
    deletedCategories: 1,
    products: 3,
    activeProducts: 2,
    deletedProducts: 1,
    historicalMovements: 4,
    totalCurrentQuantity: 20,
    blockingOutbox: 0,
    reservableOutbox: 0,
    blockers: [],
    warnings: ['Movimentos historicos permanecerao somente neste dispositivo.'],
    remoteState: 'empty',
    remote: {
      categories: 0,
      products: 0,
      movements: 0,
      syncOperations: 0,
      bootstrapCompleted: false,
    },
    payloadText: '{"categories":[],"products":[]}',
    payloadHash: 'a'.repeat(64),
    localSignature: 'b'.repeat(64),
    idempotencyKey: 'inventory-bootstrap:key',
    reservationStateText: '{}',
    reservableEventIds: [],
    eligible: true,
  };
}

function createService(preview = readyPreview()): InitialCloudLoadService {
  return {
    preview: vi.fn(async () => ({
      status: preview.eligible ? 'ready' as const : 'blocked' as const,
      message: preview.eligible ? 'Previa concluida.' : 'Carga bloqueada.',
      preview,
    })),
    execute: vi.fn(async () => ({
      status: 'completed' as const,
      message: 'Estado preparado.',
      result: { categories: 2, products: 3, wasDuplicate: false },
    })),
  };
}

function element(
  service = createService(),
  businessId = BUSINESS_ID,
  isOnline = true,
  isBusy = false,
) {
  return (
    <InitialCloudLoadSection
      userId={USER_ID}
      businessId={businessId}
      businessName="Loja Central"
      isOnline={isOnline}
      isBusy={isBusy}
      activeAction={null}
      runCloudAction={async (_action, callback) => callback()}
      service={service}
    />
  );
}

function renderSection(service = createService()) {
  return render(element(service));
}
