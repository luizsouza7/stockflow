import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Category } from '../types/Category';
import type { Movement } from '../types/Movement';
import type { Product } from '../types/Product';
import {
  backupExportService,
  STOCKFLOW_BACKUP_FORMAT,
  STOCKFLOW_BACKUP_FORMAT_VERSION,
  STOCKFLOW_DATABASE_SCHEMA_VERSION,
  validateBackup,
} from './backupExportService';
import { localDb } from './db/localDb';

const category: Category = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Bebidas',
  createdAt: '2026-07-10T10:00:00.000Z',
  updatedAt: '2026-07-11T10:00:00.000Z',
  deletedAt: '2026-07-12T10:00:00.000Z',
  syncStatus: 'pending',
};

const activeProduct: Product = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Cafe, premium',
  code: 'CAFE-01',
  categoryId: category.id,
  salePriceInCents: 1990,
  currentQuantity: 8,
  minimumStock: 2,
  createdAt: '2026-07-10T11:00:00.000Z',
  updatedAt: '2026-07-11T11:00:00.000Z',
  syncStatus: 'pending',
};

const deletedProduct: Product = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Acucar',
  code: '',
  salePriceInCents: 750,
  currentQuantity: 0,
  minimumStock: 1,
  createdAt: '2026-07-09T11:00:00.000Z',
  updatedAt: '2026-07-12T11:00:00.000Z',
  deletedAt: '2026-07-12T11:00:00.000Z',
  syncStatus: 'synced',
};

const trackedMovement: Movement = {
  id: '44444444-4444-4444-8444-444444444444',
  productId: activeProduct.id,
  type: 'entrada',
  quantity: 3,
  note: 'Compra mensal',
  date: '2026-07-11T12:00:00.000Z',
  previousQuantity: 5,
  resultingQuantity: 8,
  isLegacy: false,
  syncStatus: 'pending',
};

const legacyMovement: Movement = {
  id: '55555555-5555-4555-8555-555555555555',
  productId: deletedProduct.id,
  type: 'saida',
  quantity: 1,
  note: '',
  date: '2026-07-09T12:00:00.000Z',
  isLegacy: true,
  syncStatus: 'synced',
};

beforeEach(async () => {
  localDb.close();
  await localDb.delete();
  await localDb.open();
  await localDb.categories.add(category);
  await localDb.products.bulkAdd([activeProduct, deletedProduct]);
  await localDb.movements.bulkAdd([trackedMovement, legacyMovement]);
});

afterAll(async () => {
  localDb.close();
  await localDb.delete();
});

describe('backup local JSON', () => {
  it('gera formato proprio v1 com schema Dexie v10 e nome previsivel', async () => {
    const file = await backupExportService.createJsonBackup(
      new Date('2026-07-15T15:30:00.000Z'),
    );
    const backup = JSON.parse(file.content);

    expect(file).toMatchObject({
      fileName: 'stockflow-backup-2026-07-15.json',
      mimeType: 'application/json;charset=utf-8',
    });
    expect(backup).toMatchObject({
      format: STOCKFLOW_BACKUP_FORMAT,
      version: STOCKFLOW_BACKUP_FORMAT_VERSION,
      exportedAt: '2026-07-15T15:30:00.000Z',
      databaseSchemaVersion: STOCKFLOW_DATABASE_SCHEMA_VERSION,
    });
    expect(localDb.verno).toBe(10);
  });

  it('preserva categorias, produtos ativos, soft deletes, campos opcionais e relacionamentos', async () => {
    const file = await backupExportService.createJsonBackup();
    const backup = JSON.parse(file.content);

    expect(backup.data.categories).toEqual([category]);
    expect(backup.data.products).toEqual([activeProduct, deletedProduct]);
    expect(backup.data.products[0].categoryId).toBe(category.id);
    expect(backup.data.products[1]).not.toHaveProperty('categoryId');
    expect(backup.data.products[1].deletedAt).toBe(deletedProduct.deletedAt);
    expect(backup.data.products.map((product: Product) => product.id)).toEqual([
      activeProduct.id,
      deletedProduct.id,
    ]);
  });

  it('preserva movimentos rastreados e mantem movimentos legados sem snapshots inventados', async () => {
    const file = await backupExportService.createJsonBackup();
    const backup = JSON.parse(file.content);
    const [legacy, tracked] = backup.data.movements;

    expect(legacy).toEqual(legacyMovement);
    expect(legacy).not.toHaveProperty('previousQuantity');
    expect(legacy).not.toHaveProperty('resultingQuantity');
    expect(tracked).toEqual(trackedMovement);
    expect(tracked).toMatchObject({
      productId: activeProduct.id,
      previousQuantity: 5,
      resultingQuantity: 8,
    });
  });

  it('nao altera, perde ou duplica registros durante a exportacao', async () => {
    const before = await readAllTables();

    await backupExportService.createJsonBackup();

    expect(await readAllTables()).toEqual(before);
  });

  it('rejeita corrupcao numerica antes de serializar NaN silenciosamente', async () => {
    await localDb.products.update(activeProduct.id, { salePriceInCents: Number.NaN });

    await expect(backupExportService.createJsonBackup()).rejects.toThrow(
      'preco em centavos deve ser um inteiro nao negativo.',
    );
  });

  it('rejeita relacao orfa em vez de gerar backup aparentemente valido', async () => {
    await localDb.categories.delete(category.id);

    await expect(backupExportService.createJsonBackup()).rejects.toThrow(
      'Produto referencia categoria inexistente.',
    );
  });

  it('valida formato, versao, arrays, UUIDs, datas e snapshots legados', () => {
    expect(() => validateBackup({})).toThrow('Formato de backup invalido.');
    expect(() =>
      validateBackup({
        format: STOCKFLOW_BACKUP_FORMAT,
        version: 2,
        exportedAt: '2026-07-15T00:00:00.000Z',
        databaseSchemaVersion: 9,
        data: { categories: [], products: [], movements: [] },
      }),
    ).toThrow('Versao de backup nao suportada.');

    const invalidLegacy = {
      format: STOCKFLOW_BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-07-15T00:00:00.000Z',
      databaseSchemaVersion: STOCKFLOW_DATABASE_SCHEMA_VERSION,
      data: {
        categories: [category],
        products: [activeProduct],
        movements: [{ ...legacyMovement, productId: activeProduct.id, previousQuantity: 1 }],
      },
    };
    expect(() => validateBackup(invalidLegacy)).toThrow(
      'Movimentacao legada nao pode conter snapshots de estoque.',
    );
  });
});

describe('exportacao CSV', () => {
  it('exporta produtos com centavos inteiros, UUIDs, categoria e soft delete', async () => {
    const file = await backupExportService.createProductsCsv(
      new Date('2026-07-15T10:00:00.000Z'),
    );

    expect(file.fileName).toBe('stockflow-produtos-2026-07-15.csv');
    expect(file.content).toContain('"salePriceInCents"');
    expect(file.content).toContain(`"${activeProduct.id}"`);
    expect(file.content).toContain(`"${category.id}"`);
    expect(file.content).toContain('"1990"');
    expect(file.content).toContain(`"${deletedProduct.deletedAt}"`);
  });

  it('exporta movimentos preservando snapshots e deixando snapshots legados vazios', async () => {
    const file = await backupExportService.createMovementsCsv(
      new Date('2026-07-15T10:00:00.000Z'),
    );
    const legacyRow = file.content
      .split('\r\n')
      .find((row) => row.includes(legacyMovement.id));

    expect(file.fileName).toBe('stockflow-movimentacoes-2026-07-15.csv');
    expect(file.content).toContain(`"${trackedMovement.productId}"`);
    expect(file.content).toContain('"5","8"');
    expect(legacyRow).toContain('"true","",""');
  });

  it.each([
    ['formula com igual', '=1+1'],
    ['formula com mais', '+1+1'],
    ['formula com menos', '-1+1'],
    ['formula com arroba', '@cmd'],
    ['formula precedida por tabulacao', '\t=1+1'],
    ['formula precedida por quebra de linha', '\n=1+1'],
    ['formula precedida por retorno de carro', '\r=1+1'],
    ['formula precedida por espacos', '   =1+1'],
    ['formula com mais precedida por espacos', '   +1+1'],
    ['formula com menos precedida por espacos', '   -1+1'],
    ['formula com arroba precedida por espacos', '   @cmd'],
  ])('neutraliza %s sem remover o conteudo original', async (_description, note) => {
    await localDb.movements.update(trackedMovement.id, { note });

    const file = await backupExportService.createMovementsCsv();

    expect(file.content).toContain(`"'${note}"`);
  });

  it('nao adiciona apostrofo a texto normal', async () => {
    await localDb.movements.update(trackedMovement.id, { note: 'Observacao normal' });

    const file = await backupExportService.createMovementsCsv();

    expect(file.content).toContain('"Observacao normal"');
    expect(file.content).not.toContain('"\'Observacao normal"');
  });

  it('preserva virgulas, escapa aspas e mantem quebras de linha dentro da celula', async () => {
    const note = 'Item, "especial"\nsegunda linha';
    await localDb.movements.update(trackedMovement.id, { note });

    const file = await backupExportService.createMovementsCsv();

    expect(file.content).toContain('"Item, ""especial""\nsegunda linha"');
  });
});

async function readAllTables() {
  return {
    categories: await localDb.categories.toArray(),
    products: await localDb.products.toArray(),
    movements: await localDb.movements.toArray(),
  };
}
