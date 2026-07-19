import type { Category } from '../types/Category';
import type { Movement } from '../types/Movement';
import type { Product, SyncStatus } from '../types/Product';
import { localDb } from './db/localDb';

export const STOCKFLOW_BACKUP_FORMAT = 'stockflow-backup';
export const STOCKFLOW_BACKUP_FORMAT_VERSION = 1;
export const STOCKFLOW_DATABASE_SCHEMA_VERSION = 10;

export interface StockFlowBackup {
  format: typeof STOCKFLOW_BACKUP_FORMAT;
  version: typeof STOCKFLOW_BACKUP_FORMAT_VERSION;
  exportedAt: string;
  databaseSchemaVersion: typeof STOCKFLOW_DATABASE_SCHEMA_VERSION;
  data: {
    categories: Category[];
    products: Product[];
    movements: Movement[];
  };
}

export interface ExportFile {
  content: string;
  fileName: string;
  mimeType: string;
}

interface LocalDataSnapshot {
  categories: Category[];
  products: Product[];
  movements: Movement[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNC_STATUSES: readonly SyncStatus[] = ['pending', 'synced', 'error'];
const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const JSON_MIME_TYPE = 'application/json;charset=utf-8';

export const backupExportService = {
  async createJsonBackup(now = new Date()): Promise<ExportFile> {
    const exportedAt = toValidIsoDate(now, 'data de exportacao');
    const snapshot = await readConsistentSnapshot();
    const backup: StockFlowBackup = {
      format: STOCKFLOW_BACKUP_FORMAT,
      version: STOCKFLOW_BACKUP_FORMAT_VERSION,
      exportedAt,
      databaseSchemaVersion: STOCKFLOW_DATABASE_SCHEMA_VERSION,
      data: snapshot,
    };

    validateBackup(backup);
    const content = `${JSON.stringify(backup, null, 2)}\n`;
    validateBackup(JSON.parse(content) as unknown);

    return {
      content,
      fileName: `stockflow-backup-${exportedAt.slice(0, 10)}.json`,
      mimeType: JSON_MIME_TYPE,
    };
  },

  async createProductsCsv(now = new Date()): Promise<ExportFile> {
    const exportedAt = toValidIsoDate(now, 'data de exportacao');
    const snapshot = await readConsistentSnapshot();
    validateSnapshot(snapshot);
    const rows = snapshot.products.map((product) => [
      product.id,
      product.name,
      product.code,
      product.categoryId ?? '',
      product.currentQuantity,
      product.minimumStock,
      product.salePriceInCents,
      product.syncStatus,
      product.createdAt,
      product.updatedAt,
      product.deletedAt ?? '',
    ]);

    return {
      content: createCsv(
        [
          'id',
          'name',
          'code',
          'categoryId',
          'currentQuantity',
          'minimumStock',
          'salePriceInCents',
          'syncStatus',
          'createdAt',
          'updatedAt',
          'deletedAt',
        ],
        rows,
      ),
      fileName: `stockflow-produtos-${exportedAt.slice(0, 10)}.csv`,
      mimeType: CSV_MIME_TYPE,
    };
  },

  async createMovementsCsv(now = new Date()): Promise<ExportFile> {
    const exportedAt = toValidIsoDate(now, 'data de exportacao');
    const snapshot = await readConsistentSnapshot();
    validateSnapshot(snapshot);
    const rows = snapshot.movements.map((movement) => [
      movement.id,
      movement.productId,
      movement.type,
      movement.quantity,
      movement.note,
      movement.date,
      movement.syncStatus,
      movement.isLegacy === true,
      movement.isLegacy === true ? '' : movement.previousQuantity,
      movement.isLegacy === true ? '' : movement.resultingQuantity,
    ]);

    return {
      content: createCsv(
        [
          'id',
          'productId',
          'type',
          'quantity',
          'note',
          'date',
          'syncStatus',
          'isLegacy',
          'previousQuantity',
          'resultingQuantity',
        ],
        rows,
      ),
      fileName: `stockflow-movimentacoes-${exportedAt.slice(0, 10)}.csv`,
      mimeType: CSV_MIME_TYPE,
    };
  },
};

async function readConsistentSnapshot(): Promise<LocalDataSnapshot> {
  if (localDb.verno !== STOCKFLOW_DATABASE_SCHEMA_VERSION) {
    throw new Error('Versao do banco local incompativel com a exportacao.');
  }

  return localDb.transaction(
    'r',
    localDb.categories,
    localDb.products,
    localDb.movements,
    async () => {
      const [categories, products, movements] = await Promise.all([
        localDb.categories.toArray(),
        localDb.products.toArray(),
        localDb.movements.toArray(),
      ]);

      return {
        categories: categories.sort((a, b) => a.id.localeCompare(b.id)),
        products: products.sort((a, b) => a.id.localeCompare(b.id)),
        movements: movements.sort(
          (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
        ),
      };
    },
  );
}

export function validateBackup(value: unknown): asserts value is StockFlowBackup {
  assertPlainObject(value, 'backup');

  if (value.format !== STOCKFLOW_BACKUP_FORMAT) {
    throw new Error('Formato de backup invalido.');
  }

  if (value.version !== STOCKFLOW_BACKUP_FORMAT_VERSION) {
    throw new Error('Versao de backup nao suportada.');
  }

  assertIsoDate(value.exportedAt, 'exportedAt');

  if (value.databaseSchemaVersion !== STOCKFLOW_DATABASE_SCHEMA_VERSION) {
    throw new Error('Versao do banco local invalida no backup.');
  }

  assertPlainObject(value.data, 'data');
  validateSnapshot(value.data as unknown as LocalDataSnapshot);
}

function validateSnapshot(snapshot: LocalDataSnapshot): void {
  if (!Array.isArray(snapshot.categories)) throw new Error('Categorias invalidas no backup.');
  if (!Array.isArray(snapshot.products)) throw new Error('Produtos invalidos no backup.');
  if (!Array.isArray(snapshot.movements)) throw new Error('Movimentacoes invalidas no backup.');

  const categoryIds = validateUniqueIds(snapshot.categories, 'categoria');
  const productIds = validateUniqueIds(snapshot.products, 'produto');
  validateUniqueIds(snapshot.movements, 'movimentacao');

  snapshot.categories.forEach(validateCategory);
  snapshot.products.forEach((product) => {
    validateProduct(product);
    if (product.categoryId !== undefined && !categoryIds.has(product.categoryId)) {
      throw new Error('Produto referencia categoria inexistente.');
    }
  });
  snapshot.movements.forEach((movement) => {
    validateMovement(movement);
    if (!productIds.has(movement.productId)) {
      throw new Error('Movimentacao referencia produto inexistente.');
    }
  });
}

function validateCategory(value: Category): void {
  assertPlainObject(value, 'categoria');
  assertUuid(value.id, 'id da categoria');
  assertString(value.name, 'nome da categoria');
  assertIsoDate(value.createdAt, 'createdAt da categoria');
  assertIsoDate(value.updatedAt, 'updatedAt da categoria');
  assertOptionalIsoDate(value.deletedAt, 'deletedAt da categoria');
  assertSyncStatus(value.syncStatus);
}

function validateProduct(value: Product): void {
  assertPlainObject(value, 'produto');
  assertUuid(value.id, 'id do produto');
  assertString(value.name, 'nome do produto');
  assertString(value.code, 'codigo do produto');
  if (value.categoryId !== undefined) assertUuid(value.categoryId, 'categoryId do produto');
  assertNonNegativeInteger(value.currentQuantity, 'quantidade atual');
  assertNonNegativeInteger(value.minimumStock, 'estoque minimo');
  assertNonNegativeInteger(value.salePriceInCents, 'preco em centavos');
  assertIsoDate(value.createdAt, 'createdAt do produto');
  assertIsoDate(value.updatedAt, 'updatedAt do produto');
  assertOptionalIsoDate(value.deletedAt, 'deletedAt do produto');
  assertSyncStatus(value.syncStatus);
}

function validateMovement(value: Movement): void {
  assertPlainObject(value, 'movimentacao');
  assertUuid(value.id, 'id da movimentacao');
  assertUuid(value.productId, 'productId da movimentacao');
  if (value.type !== 'entrada' && value.type !== 'saida') {
    throw new Error('Tipo de movimentacao invalido.');
  }
  assertPositiveInteger(value.quantity, 'quantidade da movimentacao');
  assertString(value.note, 'observacao da movimentacao');
  assertIsoDate(value.date, 'data da movimentacao');
  assertSyncStatus(value.syncStatus);

  if (value.isLegacy === true) {
    if ('previousQuantity' in value || 'resultingQuantity' in value) {
      throw new Error('Movimentacao legada nao pode conter snapshots de estoque.');
    }
    return;
  }

  if (value.isLegacy !== undefined && value.isLegacy !== false) {
    throw new Error('Marcador de movimentacao legada invalido.');
  }
  assertNonNegativeInteger(value.previousQuantity, 'estoque anterior');
  assertNonNegativeInteger(value.resultingQuantity, 'estoque resultante');
}

function validateUniqueIds(values: Array<{ id: string }>, entity: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    assertPlainObject(value, entity);
    assertUuid(value.id, `id de ${entity}`);
    if (ids.has(value.id)) throw new Error(`Backup contem ${entity} duplicada.`);
    ids.add(value.id);
  }
  return ids;
}

function assertPlainObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} deve ser um objeto.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${field} possui estrutura invalida.`);
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${field} deve ser texto.`);
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${field} deve ser um UUID valido.`);
  }
}

function assertSyncStatus(value: unknown): asserts value is SyncStatus {
  if (!SYNC_STATUSES.includes(value as SyncStatus)) throw new Error('Status local invalido.');
}

function assertNonNegativeInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} deve ser um inteiro nao negativo.`);
  }
}

function assertPositiveInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} deve ser um inteiro positivo.`);
  }
}

function assertIsoDate(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} deve ser uma data valida.`);
  }
}

function assertOptionalIsoDate(value: unknown, field: string): void {
  if (value !== undefined) assertIsoDate(value, field);
}

function toValidIsoDate(value: Date, field: string): string {
  if (!Number.isFinite(value.getTime())) throw new Error(`${field} invalida.`);
  return value.toISOString();
}

function createCsv(headers: string[], rows: Array<Array<string | number | boolean>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function escapeCsvCell(value: string | number | boolean): string {
  let text = String(value);
  let contentStart = 0;

  while (contentStart < text.length) {
    const character = text[contentStart];
    const characterCode = text.charCodeAt(contentStart);
    const isLeadingWhitespaceOrControl =
      /\s/.test(character) || characterCode <= 0x1f || characterCode === 0x7f;

    if (!isLeadingWhitespaceOrControl) break;
    contentStart += 1;
  }

  if (contentStart < text.length && '=+-@'.includes(text[contentStart])) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
