import { describe, expect, it, vi } from 'vitest';
import type { RemoteInventoryCursor } from '../../types/RemoteInventory';
import {
  createRemoteInventoryReadGateway,
  RemoteInventoryReadError,
  validateRemoteInventoryCursor,
  type RemoteInventoryReadApi,
} from './remoteInventoryReadGateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_BUSINESS_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const MOVEMENT_ID = '66666666-6666-4666-8666-666666666666';
const TIME = '2026-07-26T20:00:00.000Z';
const WATERMARK = '2026-07-26T21:00:00.000Z';
const OTHER_WATERMARK = '2026-07-26T21:00:00.000001Z';
const WATERMARK_OFFSET = '2026-07-26T21:00:00.000+00:00';

describe('gateway da leitura remota paginada', () => {
  it('envia a primeira pagina sem cursor e preserva payloads reais', async () => {
    const api = createApi(pageResponse([categoryItem(), productItem(), movementItem()], null, 3));
    const gateway = createRemoteInventoryReadGateway(api);

    const page = await gateway.readPage(BUSINESS_ID, undefined, 3);

    expect(api.call).toHaveBeenCalledWith({
      p_business_id: BUSINESS_ID,
      p_cursor: null,
      p_page_size: 3,
    });
    expect(page.items[1].entityType).toBe('product');
    if (page.items[1].entityType === 'product') {
      expect(page.items[1].data.salePriceInCents).toBe(1299);
    }
    expect(page.items[2].entityType).toBe('movement');
    if (page.items[2].entityType === 'movement') {
      expect(page.items[2].data).toMatchObject({
        previousQuantity: 10,
        resultingQuantity: 7,
        quantity: 3,
        note: 'Venda',
      });
    }
  });

  it('envia na proxima pagina exatamente o cursor retornado', async () => {
    const cursor = makeCursor('movement', MOVEMENT_ID);
    const api = createApi(pageResponse([], null));
    const gateway = createRemoteInventoryReadGateway(api);

    await gateway.readPage(BUSINESS_ID, cursor, 50);

    expect(api.call).toHaveBeenCalledWith({
      p_business_id: BUSINESS_ID,
      p_cursor: cursor,
      p_page_size: 50,
    });
  });

  it('aceita pagina final com hasMore false e cursor nulo', async () => {
    const gateway = createRemoteInventoryReadGateway(createApi(pageResponse([categoryItem()], null)));
    await expect(gateway.readPage(BUSINESS_ID)).resolves.toMatchObject({
      hasMore: false,
      nextCursor: null,
      returnedCount: 1,
    });
  });

  it('rejeita cursor de outro business, versao desconhecida e pageSize fora do limite', async () => {
    const gateway = createRemoteInventoryReadGateway(createApi(pageResponse([], null)));
    expect(() => validateRemoteInventoryCursor(makeCursor('category', CATEGORY_ID), OTHER_BUSINESS_ID))
      .toThrow(/outro estabelecimento/i);
    expect(() =>
      validateRemoteInventoryCursor({ ...makeCursor('category', CATEGORY_ID), version: 2 }),
    ).toThrow(/nao e suportada/i);
    await expect(gateway.readPage(BUSINESS_ID, undefined, 0)).rejects.toMatchObject({
      kind: 'invalid-page-size',
    });
    await expect(gateway.readPage(BUSINESS_ID, undefined, 201)).rejects.toMatchObject({
      kind: 'invalid-page-size',
    });
  });

  it('preserva desempate por rank quando timestamps coincidem', async () => {
    const cursor = makeCursor('product', PRODUCT_ID);
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([categoryItem(), productItem()], cursor, 2)),
    );
    const page = await gateway.readPage(BUSINESS_ID, undefined, 2);
    expect(page.items.map(({ entityType }) => entityType)).toEqual(['category', 'product']);
    expect(page.nextCursor?.after).toEqual({
      sortTime: TIME,
      entityRank: 2,
      entityId: PRODUCT_ID,
    });
  });

  it('rejeita repeticao ou ordem nao estrita na mesma pagina', async () => {
    const duplicate = pageResponse([categoryItem(), categoryItem()], null, 2);
    const gateway = createRemoteInventoryReadGateway(createApi(duplicate));
    await expect(gateway.readPage(BUSINESS_ID, undefined, 2)).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('inclui soft delete e nao exige registro em sync_operations', async () => {
    const deleted = categoryItem();
    deleted.deletedAt = TIME;
    deleted.data.deletedAt = TIME;
    const gateway = createRemoteInventoryReadGateway(createApi(pageResponse([deleted], null)));
    const page = await gateway.readPage(BUSINESS_ID);
    expect(page.items[0].deletedAt).toBe(TIME);
    expect(page.items[0]).not.toHaveProperty('syncOperation');
  });

  it('nao inventa movimentos ausentes da resposta remota', async () => {
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([categoryItem(), productItem()], null)),
    );
    const page = await gateway.readPage(BUSINESS_ID);
    expect(page.items.some(({ entityType }) => entityType === 'movement')).toBe(false);
  });

  it('aceita empates validos e uma pagina correta estritamente depois do cursor', async () => {
    const secondCategoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const secondCategory = categoryItem();
    secondCategory.entityId = secondCategoryId;
    secondCategory.data.id = secondCategoryId;
    const firstCursor = makeCursor('category', secondCategoryId);
    const api = createApi(pageResponse([categoryItem(), secondCategory], firstCursor, 2));
    api.call
      .mockResolvedValueOnce({
        data: pageResponse([categoryItem(), secondCategory], firstCursor, 2),
        error: null,
      })
      .mockResolvedValueOnce({
        data: pageResponse([productItem()], null, 2),
        error: null,
      });
    const gateway = createRemoteInventoryReadGateway(api);

    const first = await gateway.readPage(BUSINESS_ID, undefined, 2);
    const second = await gateway.readPage(BUSINESS_ID, first.nextCursor!, 2);

    expect(first.items.map(({ entityId }) => entityId)).toEqual([CATEGORY_ID, secondCategoryId]);
    expect(second.items.map(({ entityId }) => entityId)).toEqual([PRODUCT_ID]);
  });

  it('rejeita segunda pagina que repete exatamente a chave anterior', async () => {
    await expectSecondPageRejected(pageResponse([categoryItem()], null, 1));
  });

  it('rejeita segunda pagina que comeca antes da chave anterior', async () => {
    const earlierId = '11111111-1111-4111-8111-111111111111';
    const earlier = categoryItem();
    earlier.entityId = earlierId;
    earlier.data.id = earlierId;
    await expectSecondPageRejected(pageResponse([earlier], null, 1));
  });

  it('rejeita segunda pagina cujo watermark mudou silenciosamente', async () => {
    const changed = pageResponse([], null, 1);
    changed.watermark = OTHER_WATERMARK;
    await expectSecondPageRejected(changed);
  });

  it('aceita cursor Z e resposta com watermark equivalente +00:00', async () => {
    const response = pageResponse([], null);
    response.watermark = WATERMARK_OFFSET;
    const gateway = createRemoteInventoryReadGateway(createApi(response));
    await expect(gateway.readPage(BUSINESS_ID, makeCursor('category', CATEGORY_ID)))
      .resolves.toMatchObject({ watermark: WATERMARK_OFFSET });
  });

  it('aceita cursor +00:00 e resposta com watermark equivalente Z', async () => {
    const cursor = {
      ...makeCursor('category', CATEGORY_ID),
      watermark: WATERMARK_OFFSET,
    };
    const gateway = createRemoteInventoryReadGateway(createApi(pageResponse([], null)));
    await expect(gateway.readPage(BUSINESS_ID, cursor))
      .resolves.toMatchObject({ watermark: WATERMARK });
  });

  it('rejeita diferenca real de um microssegundo no watermark', async () => {
    const response = pageResponse([], null);
    response.watermark = OTHER_WATERMARK;
    const gateway = createRemoteInventoryReadGateway(createApi(response));
    await expect(gateway.readPage(BUSINESS_ID, makeCursor('category', CATEGORY_ID)))
      .rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('aceita nextCursor com representacao diferente do mesmo instante', async () => {
    const nextCursor = {
      ...makeCursor('category', CATEGORY_ID),
      watermark: WATERMARK_OFFSET,
    };
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([categoryItem()], nextCursor)),
    );
    await expect(gateway.readPage(BUSINESS_ID)).resolves.toMatchObject({
      hasMore: true,
      nextCursor: { watermark: WATERMARK_OFFSET },
    });
  });

  it('rejeita timestamp posterior seguido de anterior, inclusive em microssegundos', async () => {
    const later = categoryItemAt('2026-07-26T20:00:00.000002Z', CATEGORY_ID);
    const earlier = categoryItemAt(
      '2026-07-26T20:00:00.000001Z',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([later, earlier], null, 2)),
    );
    await expect(gateway.readPage(BUSINESS_ID, undefined, 2)).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejeita timestamp igual seguido de rank anterior', async () => {
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([productItem(), categoryItem()], null, 2)),
    );
    await expect(gateway.readPage(BUSINESS_ID, undefined, 2)).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejeita timestamp e rank iguais seguidos de UUID anterior', async () => {
    const later = categoryItemAt(TIME, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([later, categoryItem()], null, 2)),
    );
    await expect(gateway.readPage(BUSINESS_ID, undefined, 2)).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejeita resposta malformada antes de entrega-la ao chamador', async () => {
    const malformed = pageResponse([productItem()], null);
    malformed.returnedCount = 2;
    const gateway = createRemoteInventoryReadGateway(createApi(malformed));
    await expect(gateway.readPage(BUSINESS_ID)).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('classifica erro lancado por api.call como network', async () => {
    const networkApi = createApi(pageResponse([], null));
    networkApi.call.mockRejectedValue(new Error('socket com detalhes internos'));
    await expect(createRemoteInventoryReadGateway(networkApi).readPage(BUSINESS_ID))
      .rejects.toEqual(expect.objectContaining({
        kind: 'network',
        message: 'Nao foi possivel acessar o inventario remoto agora.',
      }));
  });

  it.each([
    ['', 'TypeError: Failed to fetch'],
    ['', 'AbortError: operation aborted'],
    ['', 'request timeout'],
    ['', 'connection reset by peer'],
    ['PGRST000', 'FetchError: network request failed'],
  ])('classifica transporte PostgREST code=%s message=%s como network', async (code, message) => {
    const api = createApi(pageResponse([], null));
    api.call.mockResolvedValue({ data: null, error: { code, message } });
    await expect(createRemoteInventoryReadGateway(api).readPage(BUSINESS_ID))
      .rejects.toMatchObject({ kind: 'network' });
  });

  it('preserva membership e cursor conhecidos como erros remotos tipados', async () => {
    const membershipApi = createApi(pageResponse([], null));
    membershipApi.call.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'ACTIVE_MEMBERSHIP_REQUIRED detalhes' },
    });
    await expect(createRemoteInventoryReadGateway(membershipApi).readPage(BUSINESS_ID))
      .rejects.toEqual(expect.objectContaining({
        kind: 'membership',
        message: 'Sua conta nao possui acesso ativo a este estabelecimento.',
      }));

    const cursorApi = createApi(pageResponse([], null));
    cursorApi.call.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'INVALID_CURSOR' },
    });
    await expect(createRemoteInventoryReadGateway(cursorApi).readPage(BUSINESS_ID))
      .rejects.toMatchObject({ kind: 'invalid-cursor' });
  });

  it('mantem erro remoto desconhecido sem caracteristica de transporte como remote', async () => {
    const api = createApi(pageResponse([], null));
    api.call.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'UNKNOWN_REMOTE_FAILURE' },
    });
    await expect(createRemoteInventoryReadGateway(api).readPage(BUSINESS_ID))
      .rejects.toMatchObject({ kind: 'remote' });
  });

  it.each([
    [
      'INVALID_REMOTE_INVENTORY_TIMESTAMP',
      'invalid-remote-inventory',
      'O inventário remoto contém timestamps inválidos e não pode ser inspecionado.',
    ],
    [
      'REMOTE_PAGE_TOO_LARGE',
      'page-too-large',
      'A página remota excede o limite seguro. Tente uma quantidade menor de itens.',
    ],
  ])('mapeia %s com mensagem sanitizada', async (remoteCode, kind, friendlyMessage) => {
    const api = createApi(pageResponse([], null));
    api.call.mockResolvedValue({
      data: null,
      error: { code: '22023', message: remoteCode },
    });
    await expect(createRemoteInventoryReadGateway(api).readPage(BUSINESS_ID))
      .rejects.toEqual(expect.objectContaining({ kind, message: friendlyMessage }));
  });

  it.each([
    ['entrada correta', movementItem({ type: 'entrada', previousQuantity: 10, quantity: 3, resultingQuantity: 13 }), true],
    ['saida correta', movementItem(), true],
    ['entrada divergente', movementItem({ type: 'entrada', previousQuantity: 10, quantity: 3, resultingQuantity: 12 }), false],
    ['saida divergente', movementItem({ previousQuantity: 10, quantity: 3, resultingQuantity: 8 }), false],
    ['saida superior ao estoque', movementItem({ previousQuantity: 10, quantity: 11, resultingQuantity: 0 }), false],
    ['overflow de entrada', movementItem({
      type: 'entrada',
      previousQuantity: Number.MAX_SAFE_INTEGER,
      quantity: 1,
      resultingQuantity: Number.MAX_SAFE_INTEGER,
    }), false],
    ['legado sem snapshots', movementItem({
      isLegacy: true,
      previousQuantity: null,
      resultingQuantity: null,
    }), true],
    ['legado com snapshots', movementItem({ isLegacy: true }), false],
  ])('valida snapshots: %s', async (_case, movement, isValid) => {
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([movement], null)),
    );
    const result = gateway.readPage(BUSINESS_ID);
    if (isValid) await expect(result).resolves.toMatchObject({ returnedCount: 1 });
    else await expect(result).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it.each([
    ['updatedAt posterior', { updatedAt: OTHER_WATERMARK, deletedAt: null }, false],
    ['deletedAt posterior', { updatedAt: TIME, deletedAt: OTHER_WATERMARK }, false],
    ['sortTime correto', { updatedAt: TIME, deletedAt: null }, true],
  ])('valida coerencia de sortTime: %s', async (_case, timestamps, isValid) => {
    const item = categoryItem();
    item.data.updatedAt = timestamps.updatedAt;
    item.data.deletedAt = timestamps.deletedAt;
    item.deletedAt = timestamps.deletedAt;
    const gateway = createRemoteInventoryReadGateway(
      createApi(pageResponse([item], null)),
    );
    const result = gateway.readPage(BUSINESS_ID);
    if (isValid) await expect(result).resolves.toMatchObject({ returnedCount: 1 });
    else await expect(result).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('exige sessao autenticada antes da RPC', async () => {
    const api = createApi(pageResponse([], null));
    api.getAuthenticatedUserId.mockResolvedValue(null);
    await expect(createRemoteInventoryReadGateway(api).readPage(BUSINESS_ID))
      .rejects.toBeInstanceOf(RemoteInventoryReadError);
    expect(api.call).not.toHaveBeenCalled();
  });
});

function createApi(data: unknown) {
  return {
    getAuthenticatedUserId:
      vi.fn<RemoteInventoryReadApi['getAuthenticatedUserId']>().mockResolvedValue(USER_ID),
    call: vi.fn<RemoteInventoryReadApi['call']>().mockResolvedValue({ data, error: null }),
  };
}

function pageResponse(
  items: object[],
  nextCursor: RemoteInventoryCursor | null,
  pageSize = 50,
) {
  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    watermark: WATERMARK,
    pageSize,
    returnedCount: items.length,
  };
}

function categoryItem() {
  return {
    entityType: 'category',
    entityId: CATEGORY_ID,
    businessId: BUSINESS_ID,
    version: 1,
    sortTime: TIME,
    deletedAt: null as string | null,
    data: {
      id: CATEGORY_ID,
      businessId: BUSINESS_ID,
      name: 'Bebidas',
      version: 1,
      createdAt: TIME,
      updatedAt: TIME,
      deletedAt: null as string | null,
    },
  };
}

function productItem() {
  return {
    entityType: 'product',
    entityId: PRODUCT_ID,
    businessId: BUSINESS_ID,
    version: 2,
    sortTime: TIME,
    deletedAt: null,
    data: {
      id: PRODUCT_ID,
      businessId: BUSINESS_ID,
      name: 'Cafe',
      code: 'CAF-1',
      categoryId: CATEGORY_ID,
      salePriceInCents: 1299,
      currentQuantity: 7,
      minimumStock: 2,
      version: 2,
      createdAt: TIME,
      updatedAt: TIME,
      deletedAt: null,
    },
  };
}

function movementItem(overrides: Partial<{
  type: 'entrada' | 'saida';
  quantity: number;
  previousQuantity: number | null;
  resultingQuantity: number | null;
  isLegacy: boolean;
}> = {}) {
  const movement = {
    type: 'saida' as 'entrada' | 'saida',
    quantity: 3,
    previousQuantity: 10 as number | null,
    resultingQuantity: 7 as number | null,
    isLegacy: false,
    ...overrides,
  };
  return {
    entityType: 'movement',
    entityId: MOVEMENT_ID,
    businessId: BUSINESS_ID,
    version: 1,
    sortTime: TIME,
    deletedAt: null,
    data: {
      id: MOVEMENT_ID,
      businessId: BUSINESS_ID,
      productId: PRODUCT_ID,
      type: movement.type,
      quantity: movement.quantity,
      note: 'Venda',
      movementDate: TIME,
      previousQuantity: movement.previousQuantity,
      resultingQuantity: movement.resultingQuantity,
      isLegacy: movement.isLegacy,
      version: 1,
      createdAt: TIME,
      updatedAt: TIME,
      deletedAt: null,
    },
  };
}

function categoryItemAt(sortTime: string, entityId: string) {
  const item = categoryItem();
  item.entityId = entityId;
  item.sortTime = sortTime;
  item.data.id = entityId;
  item.data.createdAt = sortTime;
  item.data.updatedAt = sortTime;
  return item;
}

async function expectSecondPageRejected(secondResponse: ReturnType<typeof pageResponse>) {
  const cursor = makeCursor('category', CATEGORY_ID);
  const api = createApi(pageResponse([categoryItem()], cursor, 1));
  api.call
    .mockResolvedValueOnce({ data: pageResponse([categoryItem()], cursor, 1), error: null })
    .mockResolvedValueOnce({ data: secondResponse, error: null });
  const gateway = createRemoteInventoryReadGateway(api);
  const first = await gateway.readPage(BUSINESS_ID, undefined, 1);
  await expect(gateway.readPage(BUSINESS_ID, first.nextCursor!, 1))
    .rejects.toMatchObject({ kind: 'invalid-response' });
}

function makeCursor(
  entityType: 'category' | 'product' | 'movement',
  entityId: string,
): RemoteInventoryCursor {
  return {
    version: 1,
    businessId: BUSINESS_ID,
    watermark: WATERMARK,
    after: {
      sortTime: TIME,
      entityRank: entityType === 'category' ? 1 : entityType === 'product' ? 2 : 3,
      entityId,
    },
  };
}
