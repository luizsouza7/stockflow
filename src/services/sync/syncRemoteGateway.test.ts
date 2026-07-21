import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { OutboxEntry, SyncOperation } from '../../types/Sync';
import {
  createSyncRemoteGateway,
  mapCategoryToRemoteParameters,
  mapMovementToRemoteParameters,
  mapOutboxEntryToRemoteCall,
  mapProductToRemoteParameters,
  type SyncRemoteApi,
} from './syncRemoteGateway';

const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const MOVEMENT_ID = '88888888-8888-4888-8888-888888888888';

describe('mapeamento local para PostgreSQL', () => {
  it('mapeia categoria com UUID, business, timestamps e soft delete', () => {
    const parameters = mapCategoryToRemoteParameters(
      categoryEntry('category.deleted', '2026-07-19T11:00:00.000Z'),
      3,
    );

    expect(parameters).toEqual({
      p_business_id: BUSINESS_ID,
      p_idempotency_key: 'category-event',
      p_operation: 'category.deleted',
      p_entity_id: CATEGORY_ID,
      p_name: 'Bebidas',
      p_created_at: '2026-07-19T10:00:00.000Z',
      p_updated_at: '2026-07-19T11:00:00.000Z',
      p_deleted_at: '2026-07-19T11:00:00.000Z',
      p_expected_version: 3,
    });
    expect(parameters).not.toHaveProperty('syncStatus');
  });

  it('mapeia produto de camelCase para snake_case e preserva centavos', () => {
    const parameters = mapProductToRemoteParameters(productEntry('product.created'));

    expect(parameters).toMatchObject({
      p_business_id: BUSINESS_ID,
      p_entity_id: PRODUCT_ID,
      p_category_id: CATEGORY_ID,
      p_sale_price_in_cents: 1599,
      p_initial_quantity: 7,
      p_minimum_stock: 2,
      p_deleted_at: null,
      p_expected_version: null,
    });
    expect(parameters).not.toHaveProperty('salePriceInCents');
    expect(parameters).not.toHaveProperty('categoryId');
    expect(parameters).not.toHaveProperty('currentQuantity');
    expect(parameters).not.toHaveProperty('syncStatus');
  });

  it('envia category_id nulo quando o produto nao possui categoria', () => {
    const entry = productEntry('product.updated');
    entry.payload = { ...entry.payload, categoryId: undefined } as typeof entry.payload;

    expect(mapProductToRemoteParameters(entry, 1).p_category_id).toBeNull();
  });

  it('mapeia movement.created rastreado para a RPC atomica', () => {
    expect(mapOutboxEntryToRemoteCall(movementEntry())).toEqual({
      functionName: 'register_stock_movement',
      parameters: {
        p_business_id: BUSINESS_ID,
        p_idempotency_key: 'movement-event',
        p_movement_id: MOVEMENT_ID,
        p_product_id: PRODUCT_ID,
        p_type: 'saida',
        p_quantity: 2,
        p_note: 'Venda no balcao',
        p_occurred_at: '2026-07-19T11:00:00.000Z',
        p_previous_quantity: 7,
        p_resulting_quantity: 5,
        p_client_created_at: '2026-07-19T11:00:00.000Z',
      },
    });
  });

  it('bloqueia movimento legado antes da chamada remota sem inventar snapshots', () => {
    const entry = movementEntry();
    entry.payload = {
      id: MOVEMENT_ID,
      productId: PRODUCT_ID,
      type: 'entrada',
      quantity: 2,
      note: '',
      date: '2026-07-19T11:00:00.000Z',
      isLegacy: true,
      syncStatus: 'pending',
    };

    expect(() => mapMovementToRemoteParameters(entry)).toThrow(/legada sem snapshots/);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'bloqueia quantity invalida (%s) antes da chamada remota',
    (quantity) => {
      const entry = movementEntry();
      entry.payload = { ...entry.payload, quantity } as typeof entry.payload;
      expect(() => mapMovementToRemoteParameters(entry)).toThrow(/quantidade invalida/);
    },
  );

  it('bloqueia snapshot invalido antes da chamada remota', () => {
    const entry = movementEntry();
    entry.payload = { ...entry.payload, previousQuantity: -1 } as typeof entry.payload;
    expect(() => mapMovementToRemoteParameters(entry)).toThrow(/snapshots invalidos/);
  });
});

describe('gateway Supabase de push', () => {
  it.each<SyncOperation>([
    'category.created',
    'category.updated',
    'category.deleted',
  ])('%s chama a RPC segura de categorias', async (operation) => {
    const api = successfulApi();
    const gateway = createSyncRemoteGateway(api);

    await gateway.push(categoryEntry(operation), operation === 'category.created' ? undefined : 1);

    expect(api.call).toHaveBeenCalledWith(
      'push_category_outbox_event',
      expect.objectContaining({ p_operation: operation }),
    );
  });

  it.each<SyncOperation>([
    'product.created',
    'product.updated',
    'product.deleted',
  ])('%s chama a RPC segura de produtos', async (operation) => {
    const api = successfulApi();
    const gateway = createSyncRemoteGateway(api);

    await gateway.push(productEntry(operation), operation === 'product.created' ? undefined : 1);

    expect(api.call).toHaveBeenCalledWith(
      'push_product_outbox_event',
      expect.objectContaining({ p_operation: operation }),
    );
  });

  it('retorna versao e confirmacao idempotente do servidor', async () => {
    const gateway = createSyncRemoteGateway(successfulApi(4, true));
    await expect(gateway.push(categoryEntry('category.created'))).resolves.toEqual({
      remoteVersion: 4,
      wasDuplicate: true,
    });
  });

  it('movement.created chama a RPC e retorna productVersion', async () => {
    const api = successfulMovementApi(6, false);
    const gateway = createSyncRemoteGateway(api);

    await expect(gateway.push(movementEntry())).resolves.toEqual({
      remoteVersion: 6,
      productVersion: 6,
      wasDuplicate: false,
    });
    expect(api.call).toHaveBeenCalledWith(
      'register_stock_movement',
      expect.objectContaining({
        p_business_id: BUSINESS_ID,
        p_idempotency_key: 'movement-event',
        p_movement_id: MOVEMENT_ID,
        p_product_id: PRODUCT_ID,
      }),
    );
  });

  it('movimento legado falha antes de chamar a API remota', async () => {
    const api = successfulMovementApi();
    const gateway = createSyncRemoteGateway(api);
    const entry = movementEntry();
    entry.payload = {
      id: MOVEMENT_ID,
      productId: PRODUCT_ID,
      type: 'entrada',
      quantity: 1,
      note: '',
      date: entry.createdAt,
      isLegacy: true,
      syncStatus: 'pending',
    };

    await expect(gateway.push(entry)).rejects.toThrow(/legada sem snapshots/);
    expect(api.call).not.toHaveBeenCalled();
  });

  it('converte RLS permission denied em erro amigavel', async () => {
    const api = errorApi({ code: '42501', message: 'permission denied token=segredo' });
    const gateway = createSyncRemoteGateway(api);

    await expect(gateway.push(categoryEntry('category.created'))).rejects.toThrow(
      /falta de permissao/,
    );
  });

  it('nao repassa mensagem remota sensivel', async () => {
    const api = errorApi({ message: 'authorization bearer abc password=segredo' });
    const gateway = createSyncRemoteGateway(api);

    await expect(gateway.push(productEntry('product.created'))).rejects.toThrow(
      'Nao foi possivel enviar esta alteracao ao servidor agora.',
    );
  });

  it('trata divergencia de versao sem sobrescrever silenciosamente', async () => {
    const gateway = createSyncRemoteGateway(errorApi({ message: 'REMOTE_VERSION_CONFLICT' }));
    await expect(gateway.push(productEntry('product.updated'), 2)).rejects.toThrow(
      /tratamento de conflito em etapa futura/,
    );
  });

  it.each([
    ['STOCK_INSUFFICIENT', /estoque remoto e insuficiente/],
    ['STOCK_PREVIOUS_QUANTITY_CONFLICT', /estoque remoto mudou/],
    ['STOCK_RESULTING_QUANTITY_CONFLICT', /saldo resultante local diverge/],
    ['REMOTE_PRODUCT_NOT_FOUND', /produto remoto nao existe/],
    ['REMOTE_PRODUCT_DELETED', /produto remoto nao existe/],
    ['IDEMPOTENCY_KEY_REUSED payload=segredo', /chave idempotente/],
  ])('sanitiza falha de movimento %s', async (remoteMessage, friendlyMessage) => {
    const gateway = createSyncRemoteGateway(errorApi({ message: remoteMessage }));
    await expect(gateway.push(movementEntry())).rejects.toThrow(friendlyMessage);
  });

  it('rejeita resposta de movimento sem productVersion', async () => {
    const gateway = createSyncRemoteGateway(successfulApi(2));
    await expect(gateway.push(movementEntry())).rejects.toThrow(/versao do produto/);
  });

  it('nao possui credencial ou uso de service_role', () => {
    const source = readFileSync(new URL('./syncRemoteGateway.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/service_role|sb_secret_/i);
  });
});

function categoryEntry(
  operation: SyncOperation,
  deletedAt?: string,
): OutboxEntry {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    entityType: 'category',
    entityId: CATEGORY_ID,
    operation,
    payload: {
      id: CATEGORY_ID,
      name: 'Bebidas',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T11:00:00.000Z',
      deletedAt: deletedAt ?? (operation === 'category.deleted' ? '2026-07-19T11:00:00.000Z' : undefined),
      syncStatus: 'pending',
    },
    status: 'pending',
    attemptCount: 0,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T11:00:00.000Z',
    businessId: BUSINESS_ID,
    userId: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'category-event',
  };
}

function productEntry(operation: SyncOperation): OutboxEntry {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    entityType: 'product',
    entityId: PRODUCT_ID,
    operation,
    payload: {
      id: PRODUCT_ID,
      name: 'Cafe',
      code: 'CAFE-1',
      categoryId: CATEGORY_ID,
      salePriceInCents: 1599,
      currentQuantity: 7,
      minimumStock: 2,
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T11:00:00.000Z',
      deletedAt: operation === 'product.deleted' ? '2026-07-19T11:00:00.000Z' : undefined,
      syncStatus: 'pending',
    },
    status: 'pending',
    attemptCount: 0,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T11:00:00.000Z',
    businessId: BUSINESS_ID,
    userId: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'product-event',
  };
}

function movementEntry(): OutboxEntry {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    entityType: 'movement',
    entityId: MOVEMENT_ID,
    operation: 'movement.created',
    payload: {
      id: MOVEMENT_ID,
      productId: PRODUCT_ID,
      type: 'saida',
      quantity: 2,
      note: 'Venda no balcao',
      date: '2026-07-19T11:00:00.000Z',
      previousQuantity: 7,
      resultingQuantity: 5,
      isLegacy: false,
      syncStatus: 'pending',
    },
    status: 'pending',
    attemptCount: 0,
    createdAt: '2026-07-19T11:00:00.000Z',
    updatedAt: '2026-07-19T11:00:00.000Z',
    businessId: BUSINESS_ID,
    userId: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'movement-event',
  };
}

function successfulApi(version = 1, duplicate = false) {
  return {
    call: vi.fn<SyncRemoteApi['call']>().mockResolvedValue({
      data: [{ applied_version: version, was_duplicate: duplicate }],
      error: null,
    }),
  };
}

function successfulMovementApi(version = 1, duplicate = false) {
  return {
    call: vi.fn<SyncRemoteApi['call']>().mockResolvedValue({
      data: [{ applied_version: version, product_version: version, was_duplicate: duplicate }],
      error: null,
    }),
  };
}

function errorApi(error: { code?: string; message: string }) {
  return {
    call: vi.fn<SyncRemoteApi['call']>().mockResolvedValue({ data: null, error }),
  };
}
