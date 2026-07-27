// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { localDb } from '../services/db/localDb';
import type { RemoteInventoryPage } from '../types/RemoteInventory';
import type { RemoteInventoryReadService } from '../services/sync/remoteInventoryReadService';
import { RemoteInventoryReadError } from '../services/sync/remoteInventoryReadGateway';
import { RemoteInventoryInspectionSection } from './RemoteInventoryInspectionSection';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '77777777-7777-4777-8777-777777777777';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BUSINESS_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const TIME = '2026-07-26T20:00:00.000Z';
const WATERMARK = '2026-07-26T21:00:00.000Z';

describe('inspecao remota paginada', () => {
  beforeEach(async () => {
    localDb.close();
    await localDb.delete();
    await localDb.open();
  });

  afterEach(() => cleanup());

  afterAll(async () => {
    localDb.close();
    await localDb.delete();
  });

  it('mostra aviso somente leitura e nao oferece aplicar, importar ou mesclar', () => {
    renderSection();
    expect(screen.getByText('Esta leitura nao altera os dados deste dispositivo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ler primeira pagina' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Carregar proxima pagina' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reiniciar leitura' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /aplicar|importar|mesclar|substituir/i })).toBeNull();
  });

  it('oferece pageSize 50 por padrao e as opcoes proporcionais', () => {
    renderSection();
    const selector = screen.getByRole('combobox', { name: 'Itens por página' }) as HTMLSelectElement;
    expect(selector.value).toBe('50');
    expect(Array.from(selector.options, (option) => option.value)).toEqual([
      '10',
      '25',
      '50',
      '100',
      '200',
    ]);
    expect(screen.getByText('Tamanho selecionado: 50 itens.')).toBeTruthy();
  });

  it('primeira pagina usa o pageSize selecionado e mostra o tamanho retornado', async () => {
    const service = createService();
    service.readFirstRemoteInventoryPage.mockResolvedValue(emptyPage(25));
    renderSection(service);
    fireEvent.change(screen.getByRole('combobox', { name: 'Itens por página' }), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));

    await waitFor(() => expect(service.readFirstRemoteInventoryPage).toHaveBeenCalledWith({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      pageSize: 25,
    }));
    expect(screen.getByText('Tamanho retornado da pagina').nextElementSibling?.textContent)
      .toBe('25');
  });

  it('primeira pagina chama service sem cursor e mostra resumo, tipo e soft delete', async () => {
    const service = createService();
    service.readFirstRemoteInventoryPage.mockResolvedValue(pageWithDeletedCategory());
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));

    await waitFor(() => expect(service.readFirstRemoteInventoryPage).toHaveBeenCalledWith({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      pageSize: 50,
    }));
    expect(await screen.findByText(/Categorias: 1.*Produtos: 0.*Movimentos: 0.*Excluidos: 1/)).toBeTruthy();
    expect(
      screen.getByText((_content, element) =>
        element?.tagName === 'LI' &&
        /Categoria.*Bebidas.*versao 2/.test(element.textContent ?? ''),
      ),
    ).toBeTruthy();
    expect(screen.getByText('Excluido')).toBeTruthy();
    expect(screen.getByText(WATERMARK)).toBeTruthy();
  });

  it('proxima pagina usa o cursor retornado e fica desabilitada no final', async () => {
    const service = createService();
    const first = pageWithDeletedCategory(true);
    service.readFirstRemoteInventoryPage.mockResolvedValue(first);
    service.readNextRemoteInventoryPage.mockResolvedValue(emptyPage());
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    const next = await screen.findByRole('button', { name: 'Carregar proxima pagina' });
    expect((next as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(next);

    await waitFor(() => expect(service.readNextRemoteInventoryPage).toHaveBeenCalledWith({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      pageSize: 50,
      cursor: first.nextCursor,
    }));
    expect((screen.getByRole('button', { name: 'Carregar proxima pagina' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('proxima pagina usa o pageSize selecionado', async () => {
    const service = createService();
    const first = pageWithDeletedCategory(true);
    service.readFirstRemoteInventoryPage.mockResolvedValue(first);
    service.readNextRemoteInventoryPage.mockResolvedValue(emptyPage(25));
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    await screen.findByText(WATERMARK);
    fireEvent.change(screen.getByRole('combobox', { name: 'Itens por página' }), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar proxima pagina' }));

    await waitFor(() => expect(service.readNextRemoteInventoryPage).toHaveBeenCalledWith({
      userId: USER_ID,
      businessId: BUSINESS_ID,
      pageSize: 25,
      cursor: first.nextCursor,
    }));
  });

  it('reiniciar limpa pagina, watermark e cursor em memoria', async () => {
    const service = createService();
    service.readFirstRemoteInventoryPage.mockResolvedValue(pageWithDeletedCategory());
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    expect(await screen.findByText(WATERMARK)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar leitura' }));
    expect(screen.queryByText(WATERMARK)).toBeNull();
    expect(screen.queryByText(/Categorias: 1/)).toBeNull();
  });

  it('loading bloqueia clique duplicado', async () => {
    const pending = deferred<RemoteInventoryPage>();
    const service = createService();
    service.readFirstRemoteInventoryPage.mockReturnValue(pending.promise);
    renderSection(service);
    const first = screen.getByRole('button', { name: 'Ler primeira pagina' });
    fireEvent.click(first);
    fireEvent.click(first);
    expect(service.readFirstRemoteInventoryPage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/em andamento/i);
    expect((screen.getByRole('combobox', { name: 'Itens por página' }) as HTMLSelectElement).disabled)
      .toBe(true);
    await act(async () => {
      pending.resolve(emptyPage());
      await pending.promise;
    });
  });

  it('nao chama o service com pageSize invalido', () => {
    const service = createService();
    renderSection(service);
    fireEvent.change(screen.getByRole('combobox', { name: 'Itens por página' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    expect(service.readFirstRemoteInventoryPage).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('entre 1 e 200');
  });

  it('permite repetir a primeira pagina com tamanho menor apos page-too-large', async () => {
    const service = createService();
    service.readFirstRemoteInventoryPage
      .mockRejectedValueOnce(pageTooLargeError())
      .mockResolvedValueOnce(emptyPage(25));
    renderSection(service);

    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    expect((await screen.findByRole('alert')).textContent).toContain('quantidade menor');
    fireEvent.change(screen.getByRole('combobox', { name: 'Itens por página' }), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));

    await waitFor(() => expect(service.readFirstRemoteInventoryPage).toHaveBeenNthCalledWith(2, {
      userId: USER_ID,
      businessId: BUSINESS_ID,
      pageSize: 25,
    }));
  });

  it('preserva pagina e cursor ao repetir a proxima pagina com tamanho menor', async () => {
    const service = createService();
    const first = pageWithDeletedCategory(true);
    service.readFirstRemoteInventoryPage.mockResolvedValue(first);
    service.readNextRemoteInventoryPage
      .mockRejectedValueOnce(pageTooLargeError())
      .mockResolvedValueOnce(emptyPage(25));
    renderSection(service);

    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    await screen.findByText(WATERMARK);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar proxima pagina' }));
    expect((await screen.findByRole('alert')).textContent).toContain('quantidade menor');
    expect(screen.getByText(/Categorias: 1/)).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Itens por página' }), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar proxima pagina' }));

    await waitFor(() => expect(service.readNextRemoteInventoryPage).toHaveBeenNthCalledWith(2, {
      userId: USER_ID,
      businessId: BUSINESS_ID,
      pageSize: 25,
      cursor: first.nextCursor,
    }));
    expect(service.readNextRemoteInventoryPage.mock.calls[0]?.[0].cursor).toEqual(first.nextCursor);
  });

  it('apresenta erro sanitizado', async () => {
    const service = createService();
    service.readFirstRemoteInventoryPage.mockRejectedValue(
      new RemoteInventoryReadError('network', 'Nao foi possivel acessar o inventario remoto agora.'),
    );
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Nao foi possivel acessar o inventario remoto agora.',
    );
  });

  it('mudanca de business limpa a sessao e ignora resposta antiga', async () => {
    const pending = deferred<RemoteInventoryPage>();
    const service = createService();
    service.readFirstRemoteInventoryPage.mockReturnValue(pending.promise);
    const view = renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    view.rerender(
      <RemoteInventoryInspectionSection
        userId={USER_ID}
        businessId={OTHER_BUSINESS_ID}
        isOnline
        service={service}
      />,
    );
    await act(async () => {
      pending.resolve(pageWithDeletedCategory());
      await pending.promise;
    });
    expect(screen.queryByText(WATERMARK)).toBeNull();
    expect((screen.getByRole('combobox', { name: 'Itens por página' }) as HTMLSelectElement).value)
      .toBe('50');
  });

  it('mudanca de usuario limpa uma pagina ja carregada', async () => {
    const service = createService();
    service.readFirstRemoteInventoryPage.mockResolvedValue(pageWithDeletedCategory());
    const view = renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    expect(await screen.findByText(WATERMARK)).toBeTruthy();
    view.rerender(
      <RemoteInventoryInspectionSection
        userId={OTHER_USER_ID}
        businessId={BUSINESS_ID}
        isOnline
        service={service}
      />,
    );
    await waitFor(() => expect(screen.queryByText(WATERMARK)).toBeNull());
  });

  it('renderizacao e leitura nao alteram IndexedDB', async () => {
    const category = {
      id: CATEGORY_ID,
      businessId: BUSINESS_ID,
      name: 'Categoria local',
      createdAt: TIME,
      updatedAt: TIME,
      syncStatus: 'pending' as const,
    };
    await localDb.categories.add(category);
    const service = createService();
    service.readFirstRemoteInventoryPage.mockResolvedValue(pageWithDeletedCategory());
    renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));
    await screen.findByText(WATERMARK);
    expect(await localDb.categories.toArray()).toEqual([category]);
    expect(await localDb.products.count()).toBe(0);
    expect(await localDb.movements.count()).toBe(0);
    expect(await localDb.outbox.count()).toBe(0);
    expect(await localDb.initialCloudLoads.count()).toBe(0);
    expect(localDb.verno).toBe(12);
    expect(localDb.tables.map((table) => table.name).sort()).toEqual([
      'categories',
      'initialCloudLoads',
      'movements',
      'outbox',
      'products',
    ]);
  });

  it('nao renderiza espacos externos gigantes nem modifica o payload remoto', async () => {
    const service = createService();
    const remotePage = pageWithDeletedCategory(false, ` ${' '.repeat(1_000_000)}Nome seguro${' '.repeat(1_000_000)} `);
    const remoteItem = remotePage.items[0];
    if (!remoteItem || remoteItem.entityType !== 'category') throw new Error('Fixture invalido.');
    const originalName = remoteItem.data.name;
    service.readFirstRemoteInventoryPage.mockResolvedValue(remotePage);
    const view = renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));

    expect(await screen.findByText((_content, element) =>
      element?.tagName === 'LI' && /Categoria.*Nome seguro.*versao 2/.test(element.textContent ?? ''),
    )).toBeTruthy();
    expect(view.container.textContent?.length).toBeLessThan(5_000);
    expect(remoteItem.data.name).toBe(originalName);
  });

  it('resume nome longo com reticencias sem expor o valor bruto em atributos', async () => {
    const service = createService();
    const longName = 'A'.repeat(200);
    const remotePage = pageWithDeletedCategory(false, longName);
    const remoteItem = remotePage.items[0];
    if (!remoteItem || remoteItem.entityType !== 'category') throw new Error('Fixture invalido.');
    service.readFirstRemoteInventoryPage.mockResolvedValue(remotePage);
    const view = renderSection(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler primeira pagina' }));

    const summarized = `${'A'.repeat(119)}…`;
    expect(await screen.findByText((_content, element) =>
      element?.tagName === 'LI' && (element.textContent ?? '').includes(summarized),
    )).toBeTruthy();
    expect(view.container.textContent).not.toContain(longName);
    expect(view.container.querySelector(`[title="${longName}"], [aria-label="${longName}"]`)).toBeNull();
    expect(remoteItem.data.name).toBe(longName);
  });
});

function renderSection(service = createService()) {
  return render(
    <RemoteInventoryInspectionSection
      userId={USER_ID}
      businessId={BUSINESS_ID}
      isOnline
      service={service}
    />,
  );
}

function createService() {
  return {
    readFirstRemoteInventoryPage:
      vi.fn<RemoteInventoryReadService['readFirstRemoteInventoryPage']>()
        .mockResolvedValue(emptyPage()),
    readNextRemoteInventoryPage:
      vi.fn<RemoteInventoryReadService['readNextRemoteInventoryPage']>()
        .mockResolvedValue(emptyPage()),
  };
}

function emptyPage(pageSize = 50): RemoteInventoryPage {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    watermark: WATERMARK,
    pageSize,
    returnedCount: 0,
  };
}

function pageWithDeletedCategory(hasMore = false, name = 'Bebidas'): RemoteInventoryPage {
  const cursor = hasMore
    ? {
        version: 1 as const,
        businessId: BUSINESS_ID,
        watermark: WATERMARK,
        after: { sortTime: TIME, entityRank: 1 as const, entityId: CATEGORY_ID },
      }
    : null;
  return {
    items: [{
      entityType: 'category',
      entityId: CATEGORY_ID,
      businessId: BUSINESS_ID,
      version: 2,
      sortTime: TIME,
      deletedAt: TIME,
      data: {
        id: CATEGORY_ID,
        businessId: BUSINESS_ID,
        name,
        version: 2,
        createdAt: TIME,
        updatedAt: TIME,
        deletedAt: TIME,
      },
    }],
    nextCursor: cursor,
    hasMore,
    watermark: WATERMARK,
    pageSize: 50,
    returnedCount: 1,
  };
}

function pageTooLargeError() {
  return new RemoteInventoryReadError(
    'page-too-large',
    'A pagina remota excede o limite seguro. Tente uma quantidade menor de itens.',
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
