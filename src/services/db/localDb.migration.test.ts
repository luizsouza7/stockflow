import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { StockFlowDatabase } from './localDb';

const databaseNames: string[] = [];

function createVersionTwoDatabase(name: string) {
  const database = new Dexie(name);
  database.version(1).stores({
    products: '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt',
    movements: '++id, productId, type, date, syncStatus',
  });
  database.version(2).stores({
    products:
      '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
    movements: '++id, productId, type, date, syncStatus',
  });
  return database;
}

function createVersionThreeDatabase(name: string) {
  const database = new Dexie(name);
  database.version(3).stores({
    products:
      '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
    movements: '++id, productId, type, date, syncStatus',
  });
  return database;
}

describe('migracoes do banco local', () => {
  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it.each([
    [19.9, 1990],
    [10, 1000],
    [0, 0],
  ])('converte o preco decimal %s para %i centavos', async (legacyPrice, expectedCents) => {
    const databaseName = `stockflow-migration-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const legacyDatabase = createVersionTwoDatabase(databaseName);
    const now = new Date().toISOString();

    await legacyDatabase.table('products').add({
      name: 'Cafe',
      code: 'CAFE-001',
      category: 'Alimentos',
      price: legacyPrice,
      currentQuantity: 8,
      minimumStock: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
      syncStatus: 'error',
    });
    await legacyDatabase.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();
    const product = await migratedDatabase.products.toCollection().first();

    expect(product?.salePriceInCents).toBe(expectedCents);
    expect(product).not.toHaveProperty('price');
    migratedDatabase.close();
  });

  it('preserva todos os demais campos e o historico durante a migracao', async () => {
    const databaseName = `stockflow-migration-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const legacyDatabase = createVersionTwoDatabase(databaseName);
    const createdAt = '2026-07-01T10:00:00.000Z';
    const updatedAt = '2026-07-02T11:00:00.000Z';
    const deletedAt = '2026-07-03T12:00:00.000Z';
    const productId = await legacyDatabase.table<Record<string, unknown>, number>('products').add({
      name: 'Arroz integral',
      code: 'ARR-010',
      category: 'Graos',
      price: 12.34,
      currentQuantity: 7,
      minimumStock: 3,
      createdAt,
      updatedAt,
      deletedAt,
      syncStatus: 'pending',
    });
    await legacyDatabase.table('movements').add({
      productId,
      type: 'entrada',
      quantity: 2,
      note: 'Compra',
      date: updatedAt,
      syncStatus: 'pending',
    });
    legacyDatabase.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();
    const product = await migratedDatabase.products.get(productId);
    const movement = await migratedDatabase.movements.where('productId').equals(productId).first();

    expect(product).toMatchObject({
      id: productId,
      name: 'Arroz integral',
      code: 'ARR-010',
      category: 'Graos',
      salePriceInCents: 1234,
      currentQuantity: 7,
      minimumStock: 3,
      createdAt,
      updatedAt,
      deletedAt,
      syncStatus: 'pending',
    });
    expect(await migratedDatabase.movements.where('productId').equals(productId).count()).toBe(1);
    expect(movement).toMatchObject({
      productId,
      quantity: 2,
      syncStatus: 'pending',
      isLegacy: true,
    });
    expect(movement).not.toHaveProperty('previousQuantity');
    expect(movement).not.toHaveProperty('resultingQuantity');
    expect(product?.salePriceInCents).toBe(1234);
    expect(product?.deletedAt).toBe(deletedAt);
    migratedDatabase.close();
  });

  it('migra diretamente uma movimentacao v3 como legado no schema v4', async () => {
    const databaseName = `stockflow-movement-migration-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const versionThreeDatabase = createVersionThreeDatabase(databaseName);
    const now = '2026-07-12T10:00:00.000Z';
    const productId = await versionThreeDatabase
      .table<Record<string, unknown>, number>('products')
      .add({
        name: 'Cafe',
        code: 'CAFE-010',
        category: 'Alimentos',
        salePriceInCents: 1590,
        currentQuantity: 4,
        minimumStock: 2,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
        syncStatus: 'error',
      });
    await versionThreeDatabase.table('movements').add({
      productId,
      type: 'saida',
      quantity: 1,
      note: 'Registro anterior ao snapshot',
      date: now,
      syncStatus: 'error',
    });
    versionThreeDatabase.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();
    const product = await migratedDatabase.products.get(productId);
    const movement = await migratedDatabase.movements.toCollection().first();

    expect(product).toMatchObject({
      salePriceInCents: 1590,
      currentQuantity: 4,
      deletedAt: now,
      syncStatus: 'error',
    });
    expect(movement).toMatchObject({
      productId,
      quantity: 1,
      note: 'Registro anterior ao snapshot',
      syncStatus: 'error',
      isLegacy: true,
    });
    expect(movement).not.toHaveProperty('previousQuantity');
    expect(movement).not.toHaveProperty('resultingQuantity');
    migratedDatabase.close();
  });
});
