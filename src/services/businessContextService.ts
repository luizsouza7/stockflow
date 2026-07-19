import { supabaseConnection } from '../lib/supabase';

export interface BusinessSummary {
  id: string;
  name: string;
}

interface BusinessContextApi {
  listAvailable(): Promise<{ data: unknown; error: { message: string } | null }>;
  validateMembership(
    userId: string,
    businessId: string,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface BusinessSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BusinessContextService {
  isConfigured(): boolean;
  listAvailable(): Promise<BusinessSummary[]>;
  validateMembership(userId: string, businessId: string): Promise<boolean>;
  select(userId: string, businessId: string): Promise<void>;
  getSelected(userId: string): string | undefined;
  clearSelected(userId: string): void;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_PREFIX = 'stockflow:selected-business:';

export function createBusinessContextService(
  api?: BusinessContextApi,
  storage: BusinessSelectionStorage = getDefaultStorage(),
): BusinessContextService {
  return {
    isConfigured: () => api !== undefined,

    async listAvailable() {
      if (!api) throw new Error('Supabase nao esta configurado para listar estabelecimentos.');
      const { data, error } = await api.listAvailable();

      if (error) throw new Error('Nao foi possivel consultar seus estabelecimentos agora.');
      if (!Array.isArray(data)) throw new Error('O servidor retornou estabelecimentos invalidos.');

      return data.map(toBusinessSummary).sort((left, right) =>
        left.name.localeCompare(right.name, 'pt-BR'),
      );
    },

    async validateMembership(userId, businessId) {
      if (!api || !isUuid(userId) || !isUuid(businessId)) return false;
      const { data, error } = await api.validateMembership(userId, businessId);

      if (error) throw new Error('Nao foi possivel validar o estabelecimento selecionado.');
      return isMembershipRecord(data, businessId);
    },

    async select(userId, businessId) {
      if (!(await this.validateMembership(userId, businessId))) {
        throw new Error('Selecione um estabelecimento ativo vinculado a sua conta.');
      }

      storage.setItem(storageKey(userId), businessId);
    },

    getSelected(userId) {
      if (!isUuid(userId)) return undefined;
      const selected = storage.getItem(storageKey(userId)) ?? '';
      return isUuid(selected) ? selected : undefined;
    },

    clearSelected(userId) {
      if (isUuid(userId)) storage.removeItem(storageKey(userId));
    },
  };
}

function toBusinessSummary(value: unknown): BusinessSummary {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    !('name' in value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isUuid(value.id) ||
    !value.name.trim()
  ) {
    throw new Error('O servidor retornou um estabelecimento invalido.');
  }

  return { id: value.id, name: value.name.trim() };
}

function isMembershipRecord(value: unknown, businessId: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'business_id' in value &&
    value.business_id === businessId
  );
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function getDefaultStorage(): BusinessSelectionStorage {
  if ('localStorage' in globalThis) return globalThis.localStorage;

  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const client = supabaseConnection.client;
const businessContextApi: BusinessContextApi | undefined = client
  ? {
      async listAvailable() {
        const { data, error } = await client
          .from('businesses')
          .select('id, name')
          .is('deleted_at', null)
          .order('name');
        return { data, error };
      },
      async validateMembership(userId, businessId) {
        const { data, error } = await client
          .from('business_members')
          .select('business_id')
          .eq('user_id', userId)
          .eq('business_id', businessId)
          .is('deleted_at', null)
          .maybeSingle();
        return { data, error };
      },
    }
  : undefined;

export const businessContextService = createBusinessContextService(businessContextApi);
