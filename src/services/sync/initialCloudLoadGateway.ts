import { supabaseConnection } from '../../lib/supabase';

interface RemoteCallResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface InitialCloudLoadRemoteApi {
  call(functionName: string, parameters: Record<string, unknown>): Promise<RemoteCallResult>;
}

export interface InitialCloudLoadRemoteState {
  categories: number;
  products: number;
  movements: number;
  syncOperations: number;
  bootstrapCompleted: boolean;
}

export interface InitialCloudLoadRemoteResult {
  categories: number;
  products: number;
  wasDuplicate: boolean;
}

export interface InitialCloudLoadGateway {
  isConfigured(): boolean;
  getRemoteState(businessId: string): Promise<InitialCloudLoadRemoteState>;
  initialize(input: {
    businessId: string;
    idempotencyKey: string;
    payloadText: string;
    payloadHash: string;
  }): Promise<InitialCloudLoadRemoteResult>;
}

export class InitialCloudLoadRejectedError extends Error {
  readonly remoteCommitImpossible = true;
}

export function createInitialCloudLoadGateway(
  api?: InitialCloudLoadRemoteApi,
): InitialCloudLoadGateway {
  return {
    isConfigured: () => api !== undefined,

    async getRemoteState(businessId) {
      if (!api) throw new Error('Supabase nao esta configurado para a carga inicial.');
      const { data, error } = await api.call('get_business_inventory_initialization_state', {
        p_business_id: businessId,
      });
      if (error) throw toFriendlyInitialLoadError(error);
      return parseRemoteState(data);
    },

    async initialize(input) {
      if (!api) throw new Error('Supabase nao esta configurado para a carga inicial.');
      const { data, error } = await api.call('initialize_business_inventory', {
        p_business_id: input.businessId,
        p_idempotency_key: input.idempotencyKey,
        p_payload_text: input.payloadText,
        p_payload_hash: input.payloadHash,
      });
      if (error) throw toFriendlyInitialLoadError(error);
      return parseInitializationResult(data);
    },
  };
}

function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function readCount(value: object, key: string): number {
  if (!(key in value) || !Number.isSafeInteger(value[key as keyof typeof value])) {
    throw new Error('O servidor retornou um resumo invalido da carga inicial.');
  }
  const count = Number(value[key as keyof typeof value]);
  if (count < 0) throw new Error('O servidor retornou um resumo invalido da carga inicial.');
  return count;
}

function parseRemoteState(data: unknown): InitialCloudLoadRemoteState {
  const value = firstRow(data);
  if (typeof value !== 'object' || value === null) {
    throw new Error('O servidor retornou um estado remoto invalido.');
  }
  return {
    categories: readCount(value, 'category_count'),
    products: readCount(value, 'product_count'),
    movements: readCount(value, 'movement_count'),
    syncOperations: readCount(value, 'sync_operation_count'),
    bootstrapCompleted:
      'bootstrap_completed' in value && value.bootstrap_completed === true,
  };
}

function parseInitializationResult(data: unknown): InitialCloudLoadRemoteResult {
  const value = firstRow(data);
  if (typeof value !== 'object' || value === null) {
    throw new Error('O servidor nao confirmou a carga inicial.');
  }
  return {
    categories: readCount(value, 'category_count'),
    products: readCount(value, 'product_count'),
    wasDuplicate: 'was_duplicate' in value && value.was_duplicate === true,
  };
}

function toFriendlyInitialLoadError(error: {
  code?: string;
  message: string;
}): Error {
  if (error.code === '42501' || /AUTHENTICATION_REQUIRED|ACTIVE_MEMBERSHIP_REQUIRED|permission denied|row-level security/i.test(error.message)) {
    return new InitialCloudLoadRejectedError('O servidor recusou a carga por falta de sessao ou permissao no estabelecimento.');
  }
  if (/REMOTE_INVENTORY_NOT_EMPTY|REMOTE_SYNC_HISTORY_EXISTS|BOOTSTRAP_ALREADY_COMPLETED/i.test(error.message)) {
    return new InitialCloudLoadRejectedError('O estabelecimento remoto deixou de estar vazio e compativel. Nenhum dado foi sobrescrito.');
  }
  if (/IDEMPOTENCY_KEY_REUSED/i.test(error.message)) {
    return new InitialCloudLoadRejectedError('A chave desta carga inicial ja foi usada com outro snapshot.');
  }
  if (/PAYLOAD_TOO_LARGE|TOO_MANY_CATEGORIES|TOO_MANY_PRODUCTS|PAYLOAD_HASH_MISMATCH|INVALID_BOOTSTRAP_PAYLOAD|INVALID_CATEGORY|INVALID_PRODUCT|DUPLICATE_ACTIVE_PRODUCT_CODE/i.test(error.message)) {
    return new InitialCloudLoadRejectedError('O servidor recusou o snapshot inicial por seguranca ou limite de tamanho. Nenhuma insercao parcial foi mantida.');
  }
  return new Error(
    'Nao foi possivel confirmar o resultado remoto da carga inicial. A operacao local permanece reservada para retry idempotente.',
  );
}

const client = supabaseConnection.client;
const remoteApi: InitialCloudLoadRemoteApi | undefined = client
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

export const initialCloudLoadGateway = createInitialCloudLoadGateway(remoteApi);
