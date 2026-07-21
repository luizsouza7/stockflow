import { supabaseConnection } from '../../lib/supabase';
import type { Category } from '../../types/Category';
import type { Movement } from '../../types/Movement';
import type { Product } from '../../types/Product';
import type { OutboxEntry } from '../../types/Sync';

export interface RemotePushResult {
  remoteVersion: number;
  productVersion?: number;
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
      return parseRemotePushResult(data, entry.entityType === 'movement');
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
    return {
      functionName: 'register_stock_movement',
      parameters: mapMovementToRemoteParameters(entry),
    };
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

export function mapMovementToRemoteParameters(
  entry: Readonly<OutboxEntry>,
): Record<string, unknown> {
  if (entry.entityType !== 'movement' || entry.operation !== 'movement.created') {
    throw new Error('Evento de movimentacao invalido para envio remoto.');
  }

  const movement = entry.payload as Movement;
  if (
    movement.isLegacy === true ||
    movement.previousQuantity === undefined ||
    movement.resultingQuantity === undefined
  ) {
    throw new Error(
      'Movimentacao legada sem snapshots nao e compativel com o push remoto seguro.',
    );
  }

  if (!Number.isSafeInteger(movement.quantity) || movement.quantity <= 0) {
    throw new Error('A movimentacao possui quantidade invalida para o push remoto seguro.');
  }

  if (
    !Number.isSafeInteger(movement.previousQuantity) ||
    movement.previousQuantity < 0 ||
    !Number.isSafeInteger(movement.resultingQuantity) ||
    movement.resultingQuantity < 0
  ) {
    throw new Error('A movimentacao possui snapshots invalidos para o push remoto seguro.');
  }

  return {
    p_business_id: entry.businessId,
    p_idempotency_key: entry.idempotencyKey,
    p_movement_id: movement.id,
    p_product_id: movement.productId,
    p_type: movement.type,
    p_quantity: movement.quantity,
    p_note: movement.note,
    p_occurred_at: movement.date,
    p_previous_quantity: movement.previousQuantity,
    p_resulting_quantity: movement.resultingQuantity,
    p_client_created_at: entry.createdAt,
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

function parseRemotePushResult(data: unknown, requiresProductVersion: boolean): RemotePushResult {
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

  if (
    requiresProductVersion &&
    (!('product_version' in value) ||
      !Number.isSafeInteger(value.product_version) ||
      Number(value.product_version) < 1)
  ) {
    throw new Error('O servidor nao confirmou a versao do produto apos a movimentacao.');
  }

  return {
    remoteVersion: Number(value.applied_version),
    productVersion: requiresProductVersion ? Number(value.product_version) : undefined,
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

  if (/STOCK_INSUFFICIENT/i.test(error.message)) {
    return new Error('O servidor recusou a saida porque o estoque remoto e insuficiente.');
  }

  if (/STOCK_PREVIOUS_QUANTITY_CONFLICT/i.test(error.message)) {
    return new Error(
      'O estoque remoto mudou desde o snapshot local; a movimentacao exige atencao futura.',
    );
  }

  if (/STOCK_RESULTING_QUANTITY_CONFLICT/i.test(error.message)) {
    return new Error(
      'O saldo resultante local diverge do calculo seguro do servidor; a movimentacao nao foi aplicada.',
    );
  }

  if (/REMOTE_PRODUCT_NOT_FOUND|REMOTE_PRODUCT_DELETED/i.test(error.message)) {
    return new Error('O produto remoto nao existe ou nao esta ativo neste estabelecimento.');
  }

  if (/IDEMPOTENCY_KEY_REUSED|IDEMPOTENT_RESULT_NOT_FOUND/i.test(error.message)) {
    return new Error(
      'A chave idempotente desta movimentacao divergiu do registro remoto; nenhuma repeticao foi aplicada.',
    );
  }

  if (/INVALID_MOVEMENT|SAFE_STOCK_SNAPSHOTS_REQUIRED|STOCK_QUANTITY_OVERFLOW/i.test(error.message)) {
    return new Error('O servidor recusou os dados desta movimentacao por seguranca.');
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
