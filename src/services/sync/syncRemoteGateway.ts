import { supabaseConnection } from '../../lib/supabase';
import type { Category } from '../../types/Category';
import type { Product } from '../../types/Product';
import type { OutboxEntry } from '../../types/Sync';

export interface RemotePushResult {
  remoteVersion: number;
  wasDuplicate: boolean;
}

interface RemoteCallResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface SyncRemoteApi {
  call(functionName: string, parameters: Record<string, unknown>): Promise<RemoteCallResult>;
}

export interface SyncRemoteGateway {
  isConfigured(): boolean;
  push(entry: Readonly<OutboxEntry>, expectedVersion?: number): Promise<RemotePushResult>;
}

export function createSyncRemoteGateway(api?: SyncRemoteApi): SyncRemoteGateway {
  return {
    isConfigured: () => api !== undefined,

    async push(entry, expectedVersion) {
      if (!api) throw new Error('Supabase nao esta configurado para envio remoto.');
      const { functionName, parameters } = mapOutboxEntryToRemoteCall(entry, expectedVersion);
      const { data, error } = await api.call(functionName, parameters);

      if (error) throw toFriendlyRemoteError(error);
      return parseRemotePushResult(data);
    },
  };
}

export function mapOutboxEntryToRemoteCall(
  entry: Readonly<OutboxEntry>,
  expectedVersion?: number,
): { functionName: string; parameters: Record<string, unknown> } {
  if (!entry.businessId) {
    throw new Error('A alteracao local ainda nao esta vinculada a um estabelecimento.');
  }

  if (entry.entityType === 'movement') {
    throw new Error(
      'Movimentacoes aguardam uma RPC atomica de estoque e nao sao enviadas nesta etapa.',
    );
  }

  if (entry.entityType === 'category') {
    return {
      functionName: 'push_category_outbox_event',
      parameters: mapCategoryToRemoteParameters(entry, expectedVersion),
    };
  }

  return {
    functionName: 'push_product_outbox_event',
    parameters: mapProductToRemoteParameters(entry, expectedVersion),
  };
}

export function mapCategoryToRemoteParameters(
  entry: Readonly<OutboxEntry>,
  expectedVersion?: number,
): Record<string, unknown> {
  if (entry.entityType !== 'category' || !entry.operation.startsWith('category.')) {
    throw new Error('Evento de categoria invalido para envio remoto.');
  }

  const category = entry.payload as Category;
  if (entry.operation === 'category.deleted' && !category.deletedAt) {
    throw new Error('Evento de exclusao de categoria nao possui deletedAt valido.');
  }
  return {
    p_business_id: entry.businessId,
    p_idempotency_key: entry.idempotencyKey,
    p_operation: entry.operation,
    p_entity_id: category.id,
    p_name: category.name,
    p_created_at: category.createdAt,
    p_updated_at: category.updatedAt,
    p_deleted_at: category.deletedAt ?? null,
    p_expected_version: expectedVersion ?? null,
  };
}

export function mapProductToRemoteParameters(
  entry: Readonly<OutboxEntry>,
  expectedVersion?: number,
): Record<string, unknown> {
  if (entry.entityType !== 'product' || !entry.operation.startsWith('product.')) {
    throw new Error('Evento de produto invalido para envio remoto.');
  }

  const product = entry.payload as Product;
  if (entry.operation === 'product.deleted' && !product.deletedAt) {
    throw new Error('Evento de exclusao de produto nao possui deletedAt valido.');
  }
  return {
    p_business_id: entry.businessId,
    p_idempotency_key: entry.idempotencyKey,
    p_operation: entry.operation,
    p_entity_id: product.id,
    p_name: product.name,
    p_code: product.code,
    p_category_id: product.categoryId ?? null,
    p_sale_price_in_cents: product.salePriceInCents,
    p_initial_quantity: product.currentQuantity,
    p_minimum_stock: product.minimumStock,
    p_created_at: product.createdAt,
    p_updated_at: product.updatedAt,
    p_deleted_at: product.deletedAt ?? null,
    p_expected_version: expectedVersion ?? null,
  };
}

function parseRemotePushResult(data: unknown): RemotePushResult {
  const value = Array.isArray(data) ? data[0] : data;

  if (
    typeof value !== 'object' ||
    value === null ||
    !('applied_version' in value) ||
    !Number.isSafeInteger(value.applied_version) ||
    Number(value.applied_version) < 1
  ) {
    throw new Error('O servidor nao confirmou uma versao valida para a alteracao.');
  }

  return {
    remoteVersion: Number(value.applied_version),
    wasDuplicate: 'was_duplicate' in value && value.was_duplicate === true,
  };
}

function toFriendlyRemoteError(error: { code?: string; message: string }): Error {
  if (error.code === '42501' || /permission denied|row-level security|membership/i.test(error.message)) {
    return new Error('O servidor recusou o envio por falta de permissao no estabelecimento.');
  }

  if (/REMOTE_VERSION_CONFLICT|REMOTE_ENTITY_NOT_FOUND/i.test(error.message)) {
    return new Error(
      'A versao remota divergiu; esta alteracao exige tratamento de conflito em etapa futura.',
    );
  }

  if (/BASE_VERSION_REQUIRED/i.test(error.message)) {
    return new Error('A alteracao local nao possui uma versao remota segura para atualizacao.');
  }

  return new Error('Nao foi possivel enviar esta alteracao ao servidor agora.');
}

const client = supabaseConnection.client;
const remoteApi: SyncRemoteApi | undefined = client
  ? {
      async call(functionName, parameters) {
        const { data, error } = await client.rpc(functionName, parameters);
        return {
          data,
          error: error ? { code: error.code, message: error.message } : null,
        };
      },
    }
  : undefined;

export const syncRemoteGateway = createSyncRemoteGateway(remoteApi);
