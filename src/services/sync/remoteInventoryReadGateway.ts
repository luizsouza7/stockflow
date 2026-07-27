import { supabaseConnection } from '../../lib/supabase';
import type {
  RemoteCategoryPayload,
  RemoteInventoryCursor,
  RemoteInventoryEntityType,
  RemoteInventoryPage,
  RemoteInventoryPageItem,
  RemoteMovementPayload,
  RemoteProductPayload,
} from '../../types/RemoteInventory';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_RANKS: Record<RemoteInventoryEntityType, 1 | 2 | 3> = {
  category: 1,
  product: 2,
  movement: 3,
};
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;

interface InventoryOrderKey {
  sortTime: string;
  entityRank: 1 | 2 | 3;
  entityId: string;
}

export type RemoteInventoryReadErrorKind =
  | 'unconfigured'
  | 'authentication'
  | 'membership'
  | 'business'
  | 'invalid-cursor'
  | 'invalid-page-size'
  | 'invalid-remote-inventory'
  | 'page-too-large'
  | 'network'
  | 'invalid-response'
  | 'remote';

export class RemoteInventoryReadError extends Error {
  constructor(
    public readonly kind: RemoteInventoryReadErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RemoteInventoryReadError';
  }
}

interface RemoteCallResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface RemoteInventoryReadApi {
  getAuthenticatedUserId(): Promise<string | null>;
  call(parameters: Record<string, unknown>): Promise<RemoteCallResult>;
}

export interface RemoteInventoryReadGateway {
  isConfigured(): boolean;
  readPage(
    businessId: string,
    cursor?: RemoteInventoryCursor,
    pageSize?: number,
  ): Promise<RemoteInventoryPage>;
}

export function createRemoteInventoryReadGateway(
  api?: RemoteInventoryReadApi,
): RemoteInventoryReadGateway {
  return {
    isConfigured: () => api !== undefined,

    async readPage(businessId, cursor, pageSize = 50) {
      if (!api) {
        throw new RemoteInventoryReadError(
          'unconfigured',
          'Supabase nao esta configurado para a inspecao remota.',
        );
      }
      requireUuid(businessId, 'businessId');
      requirePageSize(pageSize);
      const validatedCursor =
        cursor === undefined ? undefined : validateRemoteInventoryCursor(cursor, businessId);

      let authenticatedUserId: string | null;
      try {
        authenticatedUserId = await api.getAuthenticatedUserId();
      } catch {
        throw new RemoteInventoryReadError(
          'network',
          'Nao foi possivel validar a sessao para a leitura remota.',
        );
      }
      if (!authenticatedUserId || !isUuid(authenticatedUserId)) {
        throw new RemoteInventoryReadError(
          'authentication',
          'Entre novamente antes de consultar o inventario remoto.',
        );
      }

      let result: RemoteCallResult;
      try {
        result = await api.call({
          p_business_id: businessId,
          p_cursor: validatedCursor ?? null,
          p_page_size: pageSize,
        });
      } catch {
        throw new RemoteInventoryReadError(
          'network',
          'Nao foi possivel acessar o inventario remoto agora.',
        );
      }

      if (result.error) throw mapRemoteError(result.error);
      const page = parseRemoteInventoryPage(result.data, businessId, validatedCursor);
      if (page.pageSize !== pageSize) invalidResponse();
      return page;
    },
  };
}

export function parseRemoteInventoryPage(
  value: unknown,
  expectedBusinessId: string,
  requestedCursor?: RemoteInventoryCursor,
): RemoteInventoryPage {
  requireUuid(expectedBusinessId, 'businessId');
  const record = requireExactRecord(value, [
    'items',
    'nextCursor',
    'hasMore',
    'watermark',
    'pageSize',
    'returnedCount',
  ]);
  if (!Array.isArray(record.items)) invalidResponse();
  if (typeof record.hasMore !== 'boolean') invalidResponse();
  const watermark = requireTimestamp(record.watermark);
  const pageSize = requireInteger(record.pageSize, 1, 200);
  const returnedCount = requireInteger(record.returnedCount, 0, pageSize);
  if (record.items.length !== returnedCount || record.items.length > pageSize) invalidResponse();

  const items = record.items.map((item) => parseItem(item, expectedBusinessId, watermark));
  const nextCursor =
    record.nextCursor === null
      ? null
      : validateRemoteInventoryCursor(record.nextCursor, expectedBusinessId);

  if (record.hasMore !== (nextCursor !== null)) invalidResponse();
  if (
    nextCursor &&
    compareTimestamps(nextCursor.watermark, watermark, 'invalid-response') !== 0
  ) {
    invalidResponse();
  }
  if (nextCursor && items.length === 0) invalidResponse();
  if (nextCursor && items.length > 0) {
    const last = items[items.length - 1];
    if (compareInventoryOrderKeys(nextCursor.after, itemOrderKey(last)) !== 0) {
      invalidResponse();
    }
  }

  const identities = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const identity = `${items[index].entityType}:${items[index].entityId}`;
    if (identities.has(identity)) invalidResponse();
    identities.add(identity);
    if (index > 0 && compareInventoryOrderKeys(
      itemOrderKey(items[index - 1]),
      itemOrderKey(items[index]),
    ) >= 0) {
      invalidResponse();
    }
  }

  if (requestedCursor) {
    if (
      compareTimestamps(watermark, requestedCursor.watermark, 'invalid-response') !== 0
    ) {
      invalidResponse();
    }
    for (const item of items) {
      if (compareInventoryOrderKeys(itemOrderKey(item), requestedCursor.after) <= 0) {
        invalidResponse();
      }
    }
  }

  return { items, nextCursor, hasMore: record.hasMore, watermark, pageSize, returnedCount };
}

export function validateRemoteInventoryCursor(
  value: unknown,
  expectedBusinessId?: string,
): RemoteInventoryCursor {
  const record = requireExactRecord(
    value,
    ['version', 'businessId', 'watermark', 'after'],
    'invalid-cursor',
  );
  if (record.version !== 1) {
    throw new RemoteInventoryReadError(
      'invalid-cursor',
      'A versao do cursor de paginacao nao e suportada.',
    );
  }
  const businessId = requireUuid(record.businessId, 'cursor.businessId');
  if (expectedBusinessId && businessId !== expectedBusinessId) {
    throw new RemoteInventoryReadError(
      'invalid-cursor',
      'O cursor pertence a outro estabelecimento.',
    );
  }
  const watermark = requireTimestamp(record.watermark, 'invalid-cursor');
  const after = requireExactRecord(
    record.after,
    ['sortTime', 'entityRank', 'entityId'],
    'invalid-cursor',
  );
  const sortTime = requireTimestamp(after.sortTime, 'invalid-cursor');
  const entityRank = requireEntityRank(after.entityRank);
  const entityId = requireUuid(after.entityId, 'cursor.after.entityId');
  if (compareTimestamps(sortTime, watermark, 'invalid-cursor') > 0) invalidCursor();

  return { version: 1, businessId, watermark, after: { sortTime, entityRank, entityId } };
}

function parseItem(
  value: unknown,
  businessId: string,
  watermark: string,
): RemoteInventoryPageItem {
  const record = requireExactRecord(value, [
    'entityType',
    'entityId',
    'businessId',
    'version',
    'sortTime',
    'deletedAt',
    'data',
  ]);
  if (!isEntityType(record.entityType)) invalidResponse();
  const entityType = record.entityType;
  const entityId = requireUuid(record.entityId, 'item.entityId');
  const itemBusinessId = requireUuid(record.businessId, 'item.businessId');
  const version = requireInteger(record.version, 1);
  const sortTime = requireTimestamp(record.sortTime);
  const deletedAt = requireNullableTimestamp(record.deletedAt);
  if (
    itemBusinessId !== businessId ||
    compareTimestamps(sortTime, watermark, 'invalid-response') > 0
  ) {
    invalidResponse();
  }

  if (entityType === 'category') {
    const data = parseCategory(record.data);
    validateEnvelope(data, entityId, itemBusinessId, version, deletedAt);
    validateSortTime(data, sortTime);
    return { entityType, entityId, businessId: itemBusinessId, version, sortTime, deletedAt, data };
  }
  if (entityType === 'product') {
    const data = parseProduct(record.data);
    validateEnvelope(data, entityId, itemBusinessId, version, deletedAt);
    validateSortTime(data, sortTime);
    return { entityType, entityId, businessId: itemBusinessId, version, sortTime, deletedAt, data };
  }
  const data = parseMovement(record.data);
  validateEnvelope(data, entityId, itemBusinessId, version, deletedAt);
  validateSortTime(data, sortTime);
  return { entityType, entityId, businessId: itemBusinessId, version, sortTime, deletedAt, data };
}

function parseCategory(value: unknown): RemoteCategoryPayload {
  const record = requireExactRecord(value, [
    'id', 'businessId', 'name', 'version', 'createdAt', 'updatedAt', 'deletedAt',
  ]);
  const name = requireString(record.name);
  if (!name.trim() || name.trim().length > 120) invalidResponse();
  return {
    id: requireUuid(record.id, 'category.id'),
    businessId: requireUuid(record.businessId, 'category.businessId'),
    name,
    version: requireInteger(record.version, 1),
    createdAt: requireTimestamp(record.createdAt),
    updatedAt: requireTimestamp(record.updatedAt),
    deletedAt: requireNullableTimestamp(record.deletedAt),
  };
}

function parseProduct(value: unknown): RemoteProductPayload {
  const record = requireExactRecord(value, [
    'id', 'businessId', 'name', 'code', 'categoryId', 'salePriceInCents',
    'currentQuantity', 'minimumStock', 'version', 'createdAt', 'updatedAt', 'deletedAt',
  ]);
  const name = requireString(record.name);
  if (!name.trim() || name.trim().length > 200) invalidResponse();
  return {
    id: requireUuid(record.id, 'product.id'),
    businessId: requireUuid(record.businessId, 'product.businessId'),
    name,
    code: requireString(record.code),
    categoryId:
      record.categoryId === null ? null : requireUuid(record.categoryId, 'product.categoryId'),
    salePriceInCents: requireInteger(record.salePriceInCents, 0),
    currentQuantity: requireInteger(record.currentQuantity, 0),
    minimumStock: requireInteger(record.minimumStock, 0),
    version: requireInteger(record.version, 1),
    createdAt: requireTimestamp(record.createdAt),
    updatedAt: requireTimestamp(record.updatedAt),
    deletedAt: requireNullableTimestamp(record.deletedAt),
  };
}

function parseMovement(value: unknown): RemoteMovementPayload {
  const record = requireExactRecord(value, [
    'id', 'businessId', 'productId', 'type', 'quantity', 'note', 'movementDate',
    'previousQuantity', 'resultingQuantity', 'isLegacy', 'version', 'createdAt',
    'updatedAt', 'deletedAt',
  ]);
  if (record.type !== 'entrada' && record.type !== 'saida') invalidResponse();
  if (typeof record.isLegacy !== 'boolean') invalidResponse();
  const quantity = requireInteger(record.quantity, 1);
  const previousQuantity =
    record.previousQuantity === null ? null : requireInteger(record.previousQuantity, 0);
  const resultingQuantity =
    record.resultingQuantity === null ? null : requireInteger(record.resultingQuantity, 0);
  if (
    (record.isLegacy && (previousQuantity !== null || resultingQuantity !== null)) ||
    (!record.isLegacy && (previousQuantity === null || resultingQuantity === null))
  ) {
    invalidResponse();
  }
  if (!record.isLegacy && previousQuantity !== null && resultingQuantity !== null) {
    if (record.type === 'entrada') {
      if (
        previousQuantity > Number.MAX_SAFE_INTEGER - quantity ||
        resultingQuantity !== previousQuantity + quantity
      ) {
        invalidResponse();
      }
    } else if (
      quantity > previousQuantity ||
      resultingQuantity !== previousQuantity - quantity
    ) {
      invalidResponse();
    }
  }
  return {
    id: requireUuid(record.id, 'movement.id'),
    businessId: requireUuid(record.businessId, 'movement.businessId'),
    productId: requireUuid(record.productId, 'movement.productId'),
    type: record.type,
    quantity,
    note: requireString(record.note),
    movementDate: requireTimestamp(record.movementDate),
    previousQuantity,
    resultingQuantity,
    isLegacy: record.isLegacy,
    version: requireInteger(record.version, 1),
    createdAt: requireTimestamp(record.createdAt),
    updatedAt: requireTimestamp(record.updatedAt),
    deletedAt: requireNullableTimestamp(record.deletedAt),
  };
}

function validateEnvelope(
  data: RemoteCategoryPayload | RemoteProductPayload | RemoteMovementPayload,
  entityId: string,
  businessId: string,
  version: number,
  deletedAt: string | null,
) {
  if (
    data.id !== entityId ||
    data.businessId !== businessId ||
    data.version !== version ||
    data.deletedAt !== deletedAt
  ) {
    invalidResponse();
  }
}

function validateSortTime(
  data: RemoteCategoryPayload | RemoteProductPayload | RemoteMovementPayload,
  sortTime: string,
) {
  const candidates = [
    data.createdAt,
    data.updatedAt,
    ...(data.deletedAt === null ? [] : [data.deletedAt]),
  ];
  let expected = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (compareTimestamps(candidate, expected, 'invalid-response') > 0) expected = candidate;
  }
  if (compareTimestamps(sortTime, expected, 'invalid-response') !== 0) invalidResponse();
}

function itemOrderKey(item: RemoteInventoryPageItem): InventoryOrderKey {
  return {
    sortTime: item.sortTime,
    entityRank: ENTITY_RANKS[item.entityType],
    entityId: item.entityId,
  };
}

function compareInventoryOrderKeys(left: InventoryOrderKey, right: InventoryOrderKey): number {
  return (
    compareTimestamps(left.sortTime, right.sortTime, 'invalid-response') ||
    left.entityRank - right.entityRank ||
    compareUuid(left.entityId, right.entityId)
  );
}

function compareUuid(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}

function mapRemoteError(error: { code?: string; message: string }): RemoteInventoryReadError {
  const message = error.message;
  if (/AUTHENTICATION_REQUIRED/i.test(message)) {
    return new RemoteInventoryReadError('authentication', 'Entre novamente antes da leitura remota.');
  }
  if (error.code === '42501' || /ACTIVE_MEMBERSHIP_REQUIRED/i.test(message)) {
    return new RemoteInventoryReadError(
      'membership',
      'Sua conta nao possui acesso ativo a este estabelecimento.',
    );
  }
  if (/BUSINESS_NOT_FOUND/i.test(message)) {
    return new RemoteInventoryReadError('business', 'O estabelecimento remoto nao foi encontrado.');
  }
  if (/INVALID_PAGE_SIZE/i.test(message)) {
    return new RemoteInventoryReadError('invalid-page-size', 'Use uma pagina entre 1 e 200 itens.');
  }
  if (/INVALID_REMOTE_INVENTORY_TIMESTAMP/i.test(message)) {
    return new RemoteInventoryReadError(
      'invalid-remote-inventory',
      'O inventário remoto contém timestamps inválidos e não pode ser inspecionado.',
    );
  }
  if (/REMOTE_PAGE_TOO_LARGE/i.test(message)) {
    return new RemoteInventoryReadError(
      'page-too-large',
      'A página remota excede o limite seguro. Tente uma quantidade menor de itens.',
    );
  }
  if (/INVALID_CURSOR|CURSOR_BUSINESS_MISMATCH|UNSUPPORTED_CURSOR_VERSION/i.test(message)) {
    return new RemoteInventoryReadError(
      'invalid-cursor',
      'A sessao de paginacao nao e valida. Reinicie a leitura.',
    );
  }
  if (isTransportError(error)) {
    return new RemoteInventoryReadError(
      'network',
      'Nao foi possivel acessar o inventario remoto agora.',
    );
  }
  return new RemoteInventoryReadError('remote', 'O servidor nao concluiu a leitura remota.');
}

function isTransportError(error: { code?: string; message: string }): boolean {
  return /FetchError|Failed to fetch|NetworkError|AbortError|timeout|connection reset|ECONNRESET|network request failed|load failed/i
    .test(error.message);
}

function requireExactRecord(
  value: unknown,
  keys: string[],
  errorKind: 'invalid-response' | 'invalid-cursor' = 'invalid-response',
): Record<string, unknown> {
  if (!isUnknownRecord(value)) {
    if (errorKind === 'invalid-cursor') invalidCursor();
    invalidResponse();
  }
  const record = value;
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || keys.some((key) => !(key in record))) {
    if (errorKind === 'invalid-cursor') invalidCursor();
    invalidResponse();
  }
  return record;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEntityType(value: unknown): value is RemoteInventoryEntityType {
  return value === 'category' || value === 'product' || value === 'movement';
}

function requireEntityRank(value: unknown): 1 | 2 | 3 {
  const rank = requireInteger(value, 1, 3, 'invalid-cursor');
  if (rank === 1 || rank === 2 || rank === 3) return rank;
  return invalidCursor();
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') invalidResponse();
  return value;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isUuid(value)) {
    if (field.startsWith('cursor.')) invalidCursor();
    invalidResponse();
  }
  return value;
}

function requireTimestamp(
  value: unknown,
  errorKind: 'invalid-response' | 'invalid-cursor' = 'invalid-response',
): string {
  if (
    typeof value !== 'string' ||
    parseTimestampMicros(value) === null
  ) {
    if (errorKind === 'invalid-cursor') invalidCursor();
    invalidResponse();
  }
  return value;
}

function compareTimestamps(
  left: string,
  right: string,
  errorKind: 'invalid-response' | 'invalid-cursor',
): number {
  const leftMicros = parseTimestampMicros(left);
  const rightMicros = parseTimestampMicros(right);
  if (leftMicros === null || rightMicros === null) {
    if (errorKind === 'invalid-cursor') invalidCursor();
    invalidResponse();
  }
  return leftMicros < rightMicros ? -1 : leftMicros > rightMicros ? 1 : 0;
}

function parseTimestampMicros(value: string): bigint | null {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? '';
  const offsetHour = match[10] ? Number(match[10]) : 0;
  const offsetMinute = match[11] ? Number(match[11]) : 0;
  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return null;
  }

  const offsetSign = match[9] === '-' ? -1 : 1;
  const offsetMillis = offsetSign * (offsetHour * 60 + offsetMinute) * 60_000;
  const epochMillis = local.getTime() - offsetMillis;
  if (!Number.isFinite(epochMillis)) return null;
  const fractionalMicros = BigInt(fraction.padEnd(6, '0') || '0');
  return BigInt(epochMillis) * 1_000n + fractionalMicros;
}

function requireNullableTimestamp(value: unknown): string | null {
  return value === null ? null : requireTimestamp(value);
}

function requireInteger(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
  errorKind: 'invalid-response' | 'invalid-cursor' = 'invalid-response',
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    if (errorKind === 'invalid-cursor') invalidCursor();
    invalidResponse();
  }
  return Number(value);
}

function requirePageSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new RemoteInventoryReadError('invalid-page-size', 'Use uma pagina entre 1 e 200 itens.');
  }
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function invalidCursor(): never {
  throw new RemoteInventoryReadError(
    'invalid-cursor',
    'O cursor de paginacao remoto e invalido.',
  );
}

function invalidResponse(): never {
  throw new RemoteInventoryReadError(
    'invalid-response',
    'O servidor retornou uma pagina de inventario invalida.',
  );
}

const client = supabaseConnection.client;
const remoteApi: RemoteInventoryReadApi | undefined = client
  ? {
      async getAuthenticatedUserId() {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return data.session?.user.id ?? null;
      },
      async call(parameters) {
        const { data, error } = await client.rpc('get_business_inventory_page', parameters);
        return { data, error: error ? { code: error.code, message: error.message } : null };
      },
    }
  : undefined;

export const remoteInventoryReadGateway = createRemoteInventoryReadGateway(remoteApi);
