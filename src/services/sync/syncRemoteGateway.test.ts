import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { OutboxEntry, SyncOperation } from '../../types/Sync';
import {
  createSyncRemoteGateway,
  mapCategoryToRemoteParameters,
  mapOutboxEntryToRemoteCall,
  mapProductToRemoteParameters,
  type SyncRemoteApi,
} from './syncRemoteGateway';

const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

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

  it('bloqueia movement.created antes de mapear chamada remota', () => {
    const movement = {
      ...productEntry('product.created'),
      entityType: 'movement',
      operation: 'movement.created',
    } as OutboxEntry;

    expect(() => mapOutboxEntryToRemoteCall(movement)).toThrow(/RPC atomica/);
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

function successfulApi(version = 1, duplicate = false) {
  return {
    call: vi.fn<SyncRemoteApi['call']>().mockResolvedValue({
      data: [{ applied_version: version, was_duplicate: duplicate }],
      error: null,
    }),
  };
}

function errorApi(error: { code?: string; message: string }) {
  return {
    call: vi.fn<SyncRemoteApi['call']>().mockResolvedValue({ data: null, error }),
  };
}
