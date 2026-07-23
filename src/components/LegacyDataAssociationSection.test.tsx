// @vitest-environment jsdom

import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  LegacyDataAssociationService,
  LegacyAssociationPreviewResult,
} from '../services/sync/legacyDataAssociationService';
import {
  LegacyDataAssociationSection,
  type LegacyAssociationAction,
} from './LegacyDataAssociationSection';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BUSINESS_ID = '33333333-3333-4333-8333-333333333333';

afterEach(cleanup);

describe('secao de associacao integral do legado', () => {
  it('mostra destino sem UUID e nunca executa associacao automaticamente', () => {
    const service = createService();
    renderSection({ service, businessName: 'Loja Central' });
    expect(screen.getByText(/Destino: Loja Central/)).toBeTruthy();
    expect(screen.queryByText(BUSINESS_ID)).toBeNull();
    expect(service.preview).not.toHaveBeenCalled();
    expect(service.associate).not.toHaveBeenCalled();
  });

  it('mostra todas as contagens da preview', async () => {
    const service = createService();
    renderSection({ service });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    expect(await screen.findByText('Categorias legadas: 2')).toBeTruthy();
    expect(screen.getByText('Produtos legados: 3')).toBeTruthy();
    expect(screen.getByText('Movimentações legadas: 4')).toBeTruthy();
    expect(screen.getByText('Eventos relacionados: 5')).toBeTruthy();
    expect(screen.getByText('Eventos totalmente sem contexto: 2')).toBeTruthy();
    expect(screen.getByText('Eventos já scoped para o destino: 3')).toBeTruthy();
    expect(screen.getByText('Bloqueadores: 0')).toBeTruthy();
  });

  it('exige checkbox antes de habilitar confirmacao', async () => {
    renderSection({ service: createService() });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    const checkbox = await screen.findByRole('checkbox');
    const button = screen.getByRole('button', { name: 'Associar dados ao estabelecimento' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(checkbox);
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('bloqueador aparece e impede confirmacao', async () => {
    const service = createService();
    service.preview.mockResolvedValue(blockedPreview());
    renderSection({ service });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    expect(await screen.findByText(/movimentação órfã/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect((screen.getByRole('button', { name: 'Associar dados ao estabelecimento' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('usa loading proprio e bloqueia double-submit', async () => {
    const pending = deferred<Awaited<ReturnType<LegacyDataAssociationService['associate']>>>();
    const service = createService();
    service.associate.mockReturnValue(pending.promise);
    renderSection({ service });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    const button = screen.getByRole('button', { name: 'Associar dados ao estabelecimento' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(service.associate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Associando dados...' })).toBeTruthy();
    expect(screen.queryByText('Enviando...')).toBeNull();

    pending.resolve(completedAssociation());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Associando dados...' })).toBeNull());
  });

  it('sucesso mostra resumo e confirma que nenhum dado foi enviado', async () => {
    const service = createService();
    renderSection({ service });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Associar dados ao estabelecimento' }));
    expect(await screen.findByText(/Categorias: 2; produtos: 3; movimentações: 4/)).toBeTruthy();
    expect(screen.getByText(/Nenhum dado foi enviado/)).toBeTruthy();
  });

  it('erro mostra mensagem amigavel sem sucesso parcial', async () => {
    const service = createService();
    service.associate.mockRejectedValue(new Error('falha sensivel'));
    renderSection({ service });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Associar dados ao estabelecimento' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nenhuma alteração parcial/);
  });

  it('nova preview invalida a anterior e uma falha nao permite usar o token antigo', async () => {
    const service = createService();
    service.preview
      .mockResolvedValueOnce(readyPreview())
      .mockRejectedValueOnce(new Error('falha local'));
    renderSection({ service });

    const previewButton = screen.getByRole('button', { name: 'Revisar dados locais antigos' });
    fireEvent.click(previewButton);
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(
      (screen.getByRole('button', { name: 'Associar dados ao estabelecimento' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(previewButton);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Categorias legadas: 2')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Associar dados ao estabelecimento' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(service.associate).not.toHaveBeenCalled();
  });

  it('troca de business limpa preview, confirmacao e mensagem', async () => {
    const service = createService();
    const view = renderSection({ service });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    view.rerender(<Harness service={service} businessId={OTHER_BUSINESS_ID} />);
    await waitFor(() => expect(screen.queryByText('Categorias legadas: 2')).toBeNull());
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('mudanca de conectividade descarta resultado antigo', async () => {
    const pending = deferred<LegacyAssociationPreviewResult>();
    const service = createService();
    service.preview.mockReturnValue(pending.promise);
    const view = renderSection({ service });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar dados locais antigos' }));
    view.rerender(<Harness service={service} isOnline={false} />);
    pending.resolve(readyPreview());
    await act(async () => pending.promise);
    expect(screen.queryByText('Categorias legadas: 2')).toBeNull();
  });

  it('desabilita preview e associacao offline ou sem business', () => {
    const service = createService();
    const view = render(<Harness service={service} businessId="" />);
    expect((screen.getByRole('button', { name: 'Revisar dados locais antigos' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<Harness service={service} isOnline={false} />);
    expect((screen.getByRole('button', { name: 'Revisar dados locais antigos' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

function Harness({
  service,
  businessId = BUSINESS_ID,
  businessName = 'Loja Central',
  isOnline = true,
}: {
  service: ReturnType<typeof createService>;
  businessId?: string;
  businessName?: string;
  isOnline?: boolean;
}) {
  const [activeAction, setActiveAction] = useState<LegacyAssociationAction | null>(null);
  const actionInProgress = useRef(false);

  async function runCloudAction(
    actionName: LegacyAssociationAction,
    action: () => Promise<void>,
  ) {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setActiveAction(actionName);
    try {
      await action();
    } finally {
      actionInProgress.current = false;
      setActiveAction(null);
    }
  }

  return (
    <LegacyDataAssociationSection
      userId={USER_ID}
      businessId={businessId}
      businessName={businessName}
      isOnline={isOnline}
      isBusy={activeAction !== null}
      activeAction={activeAction}
      runCloudAction={runCloudAction}
      service={service}
    />
  );
}

function renderSection({
  service,
  businessName,
}: {
  service: ReturnType<typeof createService>;
  businessName?: string;
}) {
  return render(<Harness service={service} businessName={businessName} />);
}

function createService() {
  return {
    preview: vi.fn<LegacyDataAssociationService['preview']>().mockResolvedValue(readyPreview()),
    associate: vi.fn<LegacyDataAssociationService['associate']>().mockResolvedValue(completedAssociation()),
  };
}

function readyPreview(): LegacyAssociationPreviewResult {
  return {
    status: 'ready',
    message: 'Prévia concluída.',
    preview: {
      categories: 2,
      products: 3,
      movements: 4,
      relatedOutbox: 5,
      fullyUnscopedOutbox: 2,
      selectedBusinessOutbox: 3,
      blockers: [],
      snapshotToken: 'snapshot-token',
    },
  };
}

function blockedPreview(): LegacyAssociationPreviewResult {
  return {
    status: 'blocked',
    message: 'Associação bloqueada.',
    preview: {
      ...readyPreview().preview!,
      blockers: [{ code: 'movement-product-missing', message: 'Existe movimentação órfã.' }],
    },
  };
}

function completedAssociation() {
  return {
    status: 'completed' as const,
    message: '9 registros locais foram associados. Nenhum dado foi enviado para a nuvem.',
    associated: { categories: 2, products: 3, movements: 4, outboxUpdated: 5 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
