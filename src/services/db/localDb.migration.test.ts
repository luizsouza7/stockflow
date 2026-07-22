import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { StockFlowDatabase } from './localDb';

const databaseNames: string[] = [];

function createVersionOneDatabase(name: string) {
  const database = new Dexie(name);
  database.version(1).stores({
    products: '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt',
    movements: '++id, productId, type, date, syncStatus',
  });
  return database;
}

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

function createVersionFourDatabase(name: string) {
  const database = new Dexie(name);
  database.version(4).stores({
    products:
      '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
    movements: '++id, productId, type, date, syncStatus',
  });
  return database;
}

function createVersionFiveDatabase(name: string) {
  const database = new Dexie(name);
  database.version(5).stores({
    products:
      '++id, name, code, categoryId, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
    movements: '++id, productId, type, date, syncStatus',
    categories: 'id, name, updatedAt, deletedAt, syncStatus',
  });
  return database;
}

function createVersionNineDatabase(name: string) {
  const database = new Dexie(name);
  database.version(9).stores({
    products:
      'id, name, code, categoryId, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
    movements: 'id, productId, type, date, syncStatus',
    categories: 'id, name, updatedAt, deletedAt, syncStatus',
  });
  return database;
}

function createVersionTenDatabase(name: string) {
  const database = new Dexie(name);
  database.version(10).stores({
    products:
      'id, name, code, categoryId, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
    movements: 'id, productId, type, date, syncStatus',
    categories: 'id, name, updatedAt, deletedAt, syncStatus',
    outbox:
      'id, [entityType+entityId], operation, status, createdAt, updatedAt, nextAttemptAt, &idempotencyKey, userId, businessId',
  });
  return database;
}

function schemaSignature(database: Dexie) {
  return database.tables
    .map((table) => ({
      name: table.name,
      primaryKey: table.schema.primKey.src,
      indexes: table.schema.indexes.map((index) => index.src).sort(),
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
}

describe('migracoes do banco local', () => {
  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it('v11 nao usa deleteDatabase, clear ou backfill de businessId', () => {
    const source = readFileSync(new URL('./localDb.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/deleteDatabase|\.clear\s*\(/);
    expect(source).not.toMatch(/businessId\s*[:=].*outbox|outbox.*businessId\s*[:=]/i);
  });

  it('migra dados historicos diretamente da versao 1 ate o schema atual v11', async () => {
    const databaseName = `stockflow-v1-to-v11-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const legacyDatabase = createVersionOneDatabase(databaseName);
    const createdAt = '2025-01-10T09:00:00.000Z';
    const updatedAt = '2025-01-11T10:30:00.000Z';

    await legacyDatabase.open();
    expect(legacyDatabase.verno).toBe(1);

    const legacyProductId = await legacyDatabase
      .table<Record<string, unknown>, number>('products')
      .add({
        name: 'Cafe historico',
        code: 'CAFE-V1',
        category: 'Bebidas',
        price: 19.9,
        currentQuantity: 7,
        minimumStock: 2,
        createdAt,
        updatedAt,
        syncStatus: 'pending',
      });
    await legacyDatabase.table('movements').add({
      productId: legacyProductId,
      type: 'entrada',
      quantity: 2,
      note: 'Carga historica',
      date: updatedAt,
      syncStatus: 'pending',
    });
    legacyDatabase.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();

    const products = await migratedDatabase.products.toArray();
    const movements = await migratedDatabase.movements.toArray();
    const categories = await migratedDatabase.categories.toArray();
    const product = products[0];
    const movement = movements[0];

    expect(migratedDatabase.verno).toBe(11);
    expect(migratedDatabase.tables.map((table) => table.name).sort()).toEqual([
      'categories',
      'movements',
      'outbox',
      'products',
    ]);
    expect(products).toHaveLength(1);
    expect(movements).toHaveLength(1);
    expect(categories).toHaveLength(1);
    expect(await migratedDatabase.outbox.count()).toBe(0);
    expect(product).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      name: 'Cafe historico',
      code: 'CAFE-V1',
      salePriceInCents: 1990,
      currentQuantity: 7,
      minimumStock: 2,
      createdAt,
      updatedAt,
      syncStatus: 'pending',
    });
    expect(product).not.toHaveProperty('price');
    expect(product).not.toHaveProperty('businessId');
    expect(categories[0]).toMatchObject({ id: product?.categoryId, name: 'Bebidas' });
    expect(categories[0]).not.toHaveProperty('businessId');
    expect(movement).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      productId: product?.id,
      type: 'entrada',
      quantity: 2,
      note: 'Carga historica',
      date: updatedAt,
      syncStatus: 'pending',
      isLegacy: true,
    });
    expect(movement).not.toHaveProperty('previousQuantity');
    expect(movement).not.toHaveProperty('resultingQuantity');
    expect(movement).not.toHaveProperty('businessId');

    migratedDatabase.close();
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
    const product = await migratedDatabase.products.where('code').equals('ARR-010').first();
    const movement = await migratedDatabase.movements.toCollection().first();

    expect(product).toMatchObject({
      id: expect.any(String),
      name: 'Arroz integral',
      code: 'ARR-010',
      salePriceInCents: 1234,
      currentQuantity: 7,
      minimumStock: 3,
      createdAt,
      updatedAt,
      deletedAt,
      syncStatus: 'pending',
    });
    expect(await migratedDatabase.movements.where('productId').equals(product?.id ?? '').count()).toBe(1);
    expect(movement).toMatchObject({
      productId: product?.id,
      quantity: 2,
      syncStatus: 'pending',
      isLegacy: true,
    });
    expect(movement).not.toHaveProperty('previousQuantity');
    expect(movement).not.toHaveProperty('resultingQuantity');
    expect(product?.salePriceInCents).toBe(1234);
    expect(product?.deletedAt).toBe(deletedAt);
    expect((await migratedDatabase.categories.get(product?.categoryId ?? ''))?.name).toBe('Graos');
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
    const product = await migratedDatabase.products.where('code').equals('CAFE-010').first();
    const movement = await migratedDatabase.movements.toCollection().first();

    expect(product).toMatchObject({
      salePriceInCents: 1590,
      currentQuantity: 4,
      deletedAt: now,
      syncStatus: 'error',
    });
    expect(movement).toMatchObject({
      productId: product?.id,
      quantity: 1,
      note: 'Registro anterior ao snapshot',
      syncStatus: 'error',
      isLegacy: true,
    });
    expect(movement).not.toHaveProperty('previousQuantity');
    expect(movement).not.toHaveProperty('resultingQuantity');
    migratedDatabase.close();
  });

  it('migra categorias textuais do schema v4 sem perder produtos ou movimentacoes', async () => {
    const databaseName = `stockflow-category-migration-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const versionFourDatabase = createVersionFourDatabase(databaseName);
    const createdAt = '2026-07-10T10:00:00.000Z';
    const updatedAt = '2026-07-11T11:00:00.000Z';
    const deletedAt = '2026-07-12T12:00:00.000Z';

    async function addLegacyProduct(
      name: string,
      category: string | undefined,
      overrides: Record<string, unknown> = {},
    ) {
      return versionFourDatabase
        .table<Record<string, unknown>, number>('products')
        .add({
          name,
          code: name.toUpperCase(),
          ...(category === undefined ? {} : { category }),
          salePriceInCents: 1990,
          currentQuantity: 10,
          minimumStock: 2,
          createdAt,
          updatedAt,
          syncStatus: 'pending',
          ...overrides,
        });
    }

    const firstBeverageId = await addLegacyProduct('Refrigerante', 'Bebidas');
    await addLegacyProduct('Suco', ' bebidas ');
    await addLegacyProduct('Agua', 'BEBIDAS');
    await addLegacyProduct('Arroz', '   ');
    await addLegacyProduct('Feijao', undefined);
    const deletedProductId = await addLegacyProduct('Detergente', 'Limpeza', {
      deletedAt,
      salePriceInCents: 725,
      currentQuantity: 4,
      minimumStock: 1,
      syncStatus: 'error',
    });
    await versionFourDatabase.table('movements').bulkAdd([
      {
        productId: firstBeverageId,
        type: 'entrada',
        quantity: 5,
        previousQuantity: 5,
        resultingQuantity: 10,
        isLegacy: false,
        note: 'Compra',
        date: updatedAt,
        syncStatus: 'pending',
      },
      {
        productId: deletedProductId,
        type: 'saida',
        quantity: 1,
        isLegacy: true,
        note: 'Historico legado',
        date: createdAt,
        syncStatus: 'error',
      },
    ]);
    versionFourDatabase.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();
    const categories = await migratedDatabase.categories.toArray();
    const products = await migratedDatabase.products.toArray();
    const productByName = new Map(products.map((product) => [product.name, product]));
    const movements = await migratedDatabase.movements.orderBy('date').toArray();

    expect(categories).toHaveLength(2);
    expect(categories.map((category) => category.name).sort()).toEqual(['Bebidas', 'Limpeza']);
    expect(categories.every((category) => /^[0-9a-f-]{36}$/i.test(category.id))).toBe(true);

    const beverageCategoryId = productByName.get('Refrigerante')?.categoryId;
    expect(beverageCategoryId).toBeTruthy();
    expect(productByName.get('Suco')?.categoryId).toBe(beverageCategoryId);
    expect(productByName.get('Agua')?.categoryId).toBe(beverageCategoryId);
    expect(productByName.get('Arroz')?.categoryId).toBeUndefined();
    expect(productByName.get('Feijao')?.categoryId).toBeUndefined();

    expect(productByName.get('Detergente')).toMatchObject({
      salePriceInCents: 725,
      currentQuantity: 4,
      minimumStock: 1,
      deletedAt,
      syncStatus: 'error',
    });
    expect(
      products.every(
        (product) => !Object.prototype.hasOwnProperty.call(product, 'category'),
      ),
    ).toBe(true);
    expect(movements[0]).toMatchObject({
      isLegacy: true,
      note: 'Historico legado',
      syncStatus: 'error',
    });
    expect(movements[1]).toMatchObject({
      previousQuantity: 5,
      resultingQuantity: 10,
      isLegacy: false,
      note: 'Compra',
    });
    migratedDatabase.close();
  });

  it('migra o schema v5 para UUID sem perder dados nem trocar relacionamentos', async () => {
    const databaseName = `stockflow-v5-uuid-migration-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const databaseV5 = createVersionFiveDatabase(databaseName);
    const activeCategoryId = '11111111-1111-4111-8111-111111111111';
    const deletedCategoryId = '22222222-2222-4222-8222-222222222222';
    const createdAt = '2026-06-01T10:00:00.000Z';
    const updatedAt = '2026-06-02T11:00:00.000Z';
    const deletedAt = '2026-06-03T12:00:00.000Z';

    await databaseV5.table('categories').bulkAdd([
      {
        id: activeCategoryId,
        name: 'Bebidas',
        createdAt,
        updatedAt,
        syncStatus: 'synced',
      },
      {
        id: deletedCategoryId,
        name: 'Antiga',
        createdAt,
        updatedAt,
        deletedAt,
        syncStatus: 'error',
      },
    ]);
    await databaseV5.table('products').bulkAdd([
      {
        id: 1,
        name: 'Cafe',
        code: 'CAFE',
        categoryId: activeCategoryId,
        salePriceInCents: 1590,
        currentQuantity: 12,
        minimumStock: 3,
        createdAt,
        updatedAt,
        syncStatus: 'synced',
      },
      {
        id: 2,
        name: 'Arroz',
        code: 'ARROZ',
        salePriceInCents: 2450,
        currentQuantity: 7,
        minimumStock: 2,
        createdAt,
        updatedAt,
        syncStatus: 'pending',
      },
      {
        id: 7,
        name: 'Produto excluido',
        code: 'EXCLUIDO',
        categoryId: activeCategoryId,
        salePriceInCents: 725,
        currentQuantity: 4,
        minimumStock: 1,
        createdAt,
        updatedAt,
        deletedAt,
        syncStatus: 'error',
      },
    ]);
    await databaseV5.table('movements').bulkAdd([
      {
        id: 10,
        productId: 1,
        type: 'entrada',
        quantity: 5,
        previousQuantity: 5,
        resultingQuantity: 10,
        isLegacy: false,
        note: 'Compra cafe',
        date: '2026-06-04T08:00:00.000Z',
        syncStatus: 'synced',
      },
      {
        id: 11,
        productId: 2,
        type: 'saida',
        quantity: 3,
        previousQuantity: 10,
        resultingQuantity: 7,
        isLegacy: false,
        note: 'Venda arroz',
        date: '2026-06-05T09:00:00.000Z',
        syncStatus: 'pending',
      },
      {
        id: 12,
        productId: 7,
        type: 'entrada',
        quantity: 1,
        previousQuantity: 3,
        resultingQuantity: 4,
        isLegacy: false,
        note: 'Historico excluido 1',
        date: '2026-06-06T10:00:00.000Z',
        syncStatus: 'error',
      },
      {
        id: 13,
        productId: 7,
        type: 'saida',
        quantity: 1,
        previousQuantity: 4,
        resultingQuantity: 3,
        isLegacy: false,
        note: 'Historico excluido 2',
        date: '2026-06-07T11:00:00.000Z',
        syncStatus: 'pending',
      },
      {
        id: 14,
        productId: 7,
        type: 'entrada',
        quantity: 1,
        isLegacy: true,
        note: 'Historico legado',
        date: '2026-06-08T12:00:00.000Z',
        syncStatus: 'synced',
      },
    ]);
    databaseV5.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();
    const products = await migratedDatabase.products.toArray();
    const movements = await migratedDatabase.movements.toArray();
    const categories = await migratedDatabase.categories.toArray();
    const productByCode = new Map(products.map((product) => [product.code, product]));
    const movementByNote = new Map(movements.map((movement) => [movement.note, movement]));
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(products).toHaveLength(3);
    expect(movements).toHaveLength(5);
    expect(categories).toHaveLength(2);
    expect(products.every((product) => uuidPattern.test(product.id))).toBe(true);
    expect(movements.every((movement) => uuidPattern.test(movement.id))).toBe(true);
    expect(movements.every((movement) => typeof movement.productId === 'string')).toBe(true);
    expect(new Set([...products.map(({ id }) => id), ...movements.map(({ id }) => id)]).size).toBe(8);

    const cafe = productByCode.get('CAFE');
    const arroz = productByCode.get('ARROZ');
    const deletedProduct = productByCode.get('EXCLUIDO');
    expect(cafe).toMatchObject({
      categoryId: activeCategoryId,
      salePriceInCents: 1590,
      currentQuantity: 12,
      minimumStock: 3,
      createdAt,
      updatedAt,
      syncStatus: 'synced',
    });
    expect(arroz).toMatchObject({ salePriceInCents: 2450, currentQuantity: 7, minimumStock: 2 });
    expect(deletedProduct).toMatchObject({ deletedAt, categoryId: activeCategoryId });
    expect(movementByNote.get('Compra cafe')).toMatchObject({
      productId: cafe?.id,
      previousQuantity: 5,
      resultingQuantity: 10,
      date: '2026-06-04T08:00:00.000Z',
      syncStatus: 'synced',
    });
    expect(movementByNote.get('Venda arroz')?.productId).toBe(arroz?.id);
    expect(movementByNote.get('Historico excluido 1')?.productId).toBe(deletedProduct?.id);
    expect(movementByNote.get('Historico excluido 2')?.productId).toBe(deletedProduct?.id);
    expect(movementByNote.get('Historico legado')).toMatchObject({
      productId: deletedProduct?.id,
      isLegacy: true,
      syncStatus: 'synced',
    });
    expect(movementByNote.get('Historico legado')).not.toHaveProperty('previousQuantity');
    expect(movementByNote.get('Historico legado')).not.toHaveProperty('resultingQuantity');
    expect(categories).toEqual([
      expect.objectContaining({ id: activeCategoryId, name: 'Bebidas', syncStatus: 'synced' }),
      expect.objectContaining({
        id: deletedCategoryId,
        name: 'Antiga',
        deletedAt,
        syncStatus: 'error',
      }),
    ]);
    migratedDatabase.close();

    const reopenedDatabase = new StockFlowDatabase(databaseName);
    await reopenedDatabase.open();
    const reopenedProducts = await reopenedDatabase.products.toArray();
    const reopenedMovements = await reopenedDatabase.movements.toArray();
    const reopenedProductByCode = new Map(
      reopenedProducts.map((product) => [product.code, product]),
    );
    const reopenedMovementByNote = new Map(
      reopenedMovements.map((movement) => [movement.note, movement]),
    );

    expect(reopenedDatabase.verno).toBe(11);
    expect(reopenedDatabase.tables.map((table) => table.name).sort()).toEqual([
      'categories',
      'movements',
      'outbox',
      'products',
    ]);
    expect(reopenedProductByCode.get('CAFE')?.id).toBe(cafe?.id);
    expect(reopenedProductByCode.get('ARROZ')?.id).toBe(arroz?.id);
    expect(reopenedProductByCode.get('EXCLUIDO')?.id).toBe(deletedProduct?.id);
    expect(reopenedMovementByNote.get('Compra cafe')?.id).toBe(
      movementByNote.get('Compra cafe')?.id,
    );
    expect(reopenedMovementByNote.get('Compra cafe')).toMatchObject({
      productId: cafe?.id,
      previousQuantity: 5,
      resultingQuantity: 10,
    });
    expect(await reopenedDatabase.categories.toArray()).toEqual(categories);
    reopenedDatabase.close();
  });

  it('aborta atomicamente a migration quando existe referencia orfa', async () => {
    const databaseName = `stockflow-orphan-migration-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const databaseV5 = createVersionFiveDatabase(databaseName);
    const now = '2026-06-01T10:00:00.000Z';
    const categoryId = '33333333-3333-4333-8333-333333333333';
    await databaseV5.table('categories').add({
      id: categoryId,
      name: 'Preservada',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'synced',
    });
    await databaseV5.table('products').add({
      id: 1,
      name: 'Cafe',
      code: 'CAFE',
      categoryId,
      salePriceInCents: 1000,
      currentQuantity: 5,
      minimumStock: 1,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await databaseV5.table('movements').add({
      id: 1,
      productId: 999,
      type: 'entrada',
      quantity: 1,
      isLegacy: true,
      note: 'Orfa',
      date: now,
      syncStatus: 'pending',
    });
    expect(databaseV5.verno).toBe(5);
    expect(await databaseV5.table('products').count()).toBe(1);
    expect(await databaseV5.table('movements').get(1)).toMatchObject({
      id: 1,
      productId: 999,
    });
    databaseV5.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await expect(migratedDatabase.open()).rejects.toThrow(
      'Movimentacao antiga 1 referencia produto inexistente 999.',
    );
    migratedDatabase.close();

    const unchangedV5 = createVersionFiveDatabase(databaseName);
    await unchangedV5.open();
    expect(unchangedV5.verno).toBe(5);
    expect(unchangedV5.tables.map((table) => table.name).sort()).toEqual([
      'categories',
      'movements',
      'products',
    ]);
    expect(await unchangedV5.table('products').count()).toBe(1);
    expect(await unchangedV5.table('movements').count()).toBe(1);
    expect(await unchangedV5.table('categories').count()).toBe(1);
    expect(await unchangedV5.table('products').get(1)).toMatchObject({
      id: 1,
      categoryId,
    });
    expect(await unchangedV5.table('movements').get(1)).toMatchObject({
      id: 1,
      productId: 999,
    });
    expect(await unchangedV5.table('categories').get(categoryId)).toMatchObject({
      id: categoryId,
      name: 'Preservada',
    });
    unchangedV5.close();
  });

  it('adiciona outbox vazia no upgrade v9 para v10 e preserva os dados existentes', async () => {
    const databaseName = `stockflow-v9-to-v10-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const versionNineDatabase = createVersionNineDatabase(databaseName);
    const categoryId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const movementId = crypto.randomUUID();
    const now = '2026-07-17T12:00:00.000Z';

    await versionNineDatabase.open();
    await versionNineDatabase.table('categories').add({
      id: categoryId,
      name: 'Preservada',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await versionNineDatabase.table('products').add({
      id: productId,
      name: 'Produto preservado',
      code: 'PRESERVADO',
      categoryId,
      salePriceInCents: 1234,
      currentQuantity: 5,
      minimumStock: 1,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await versionNineDatabase.table('movements').add({
      id: movementId,
      productId,
      type: 'entrada',
      quantity: 5,
      note: 'Inicial',
      date: now,
      previousQuantity: 0,
      resultingQuantity: 5,
      isLegacy: false,
      syncStatus: 'pending',
    });
    versionNineDatabase.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();

    expect(migratedDatabase.verno).toBe(11);
    expect(await migratedDatabase.categories.get(categoryId)).toMatchObject({ name: 'Preservada' });
    expect(await migratedDatabase.products.get(productId)).toMatchObject({
      salePriceInCents: 1234,
      currentQuantity: 5,
    });
    expect(await migratedDatabase.movements.get(movementId)).toMatchObject({
      productId,
      previousQuantity: 0,
      resultingQuantity: 5,
    });
    expect(await migratedDatabase.outbox.count()).toBe(0);
    expect(migratedDatabase.outbox.schema.primKey).toMatchObject({
      keyPath: 'id',
      auto: false,
    });
    expect(migratedDatabase.outbox.schema.indexes.map((index) => index.src).sort()).toEqual([
      '&idempotencyKey',
      '[entityType+entityId]',
      'businessId',
      'createdAt',
      'nextAttemptAt',
      'operation',
      'status',
      'updatedAt',
      'userId',
    ].sort());
    migratedDatabase.close();
  });

  it('preserva integralmente v10 no upgrade para v11 sem inferir businessId', async () => {
    const databaseName = `stockflow-v10-to-v11-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const databaseV10 = createVersionTenDatabase(databaseName);
    const businessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const categoryId = '11111111-1111-4111-8111-111111111111';
    const productId = '22222222-2222-4222-8222-222222222222';
    const movementId = '33333333-3333-4333-8333-333333333333';
    const outboxId = '44444444-4444-4444-8444-444444444444';
    const createdAt = '2026-07-20T10:00:00.000Z';
    const updatedAt = '2026-07-20T11:00:00.000Z';
    const deletedAt = '2026-07-20T12:00:00.000Z';
    const category = {
      id: categoryId,
      name: 'Legada',
      createdAt,
      updatedAt,
      deletedAt,
      syncStatus: 'error',
    };
    const product = {
      id: productId,
      name: 'Produto legado',
      code: 'LEG-1',
      categoryId,
      salePriceInCents: 2599,
      currentQuantity: 7,
      minimumStock: 3,
      createdAt,
      updatedAt,
      deletedAt,
      syncStatus: 'error',
    };
    const movement = {
      id: movementId,
      productId,
      type: 'entrada',
      quantity: 2,
      note: 'Historico',
      date: updatedAt,
      previousQuantity: 5,
      resultingQuantity: 7,
      isLegacy: false,
      syncStatus: 'error',
    };
    const outbox = {
      id: outboxId,
      entityType: 'product',
      entityId: productId,
      operation: 'product.updated',
      payload: product,
      status: 'error',
      attemptCount: 3,
      lastError: 'falha preservada',
      createdAt,
      updatedAt,
      nextAttemptAt: '2026-07-20T12:30:00.000Z',
      userId,
      businessId,
      idempotencyKey: 'evento-legado-associado',
      remoteVersion: 2,
    };

    await databaseV10.open();
    await databaseV10.table('categories').add(category);
    await databaseV10.table('products').add(product);
    await databaseV10.table('movements').add(movement);
    await databaseV10.table('outbox').add(outbox);
    databaseV10.close();

    const migratedDatabase = new StockFlowDatabase(databaseName);
    await migratedDatabase.open();

    expect(migratedDatabase.verno).toBe(11);
    expect(await migratedDatabase.categories.toArray()).toEqual([category]);
    expect(await migratedDatabase.products.toArray()).toEqual([product]);
    expect(await migratedDatabase.movements.toArray()).toEqual([movement]);
    expect(await migratedDatabase.outbox.toArray()).toEqual([outbox]);
    expect(await migratedDatabase.categories.where('businessId').equals(businessId).count()).toBe(0);
    expect(await migratedDatabase.products.where('businessId').equals(businessId).count()).toBe(0);
    expect(await migratedDatabase.movements.where('businessId').equals(businessId).count()).toBe(0);
    expect((await migratedDatabase.outbox.get(outboxId))?.businessId).toBe(businessId);
    migratedDatabase.close();
  });

  it('produz o mesmo schema final v11 em fresh install e upgrade direto da v5', async () => {
    const freshDatabaseName = `stockflow-fresh-schema-${crypto.randomUUID()}`;
    const migratedDatabaseName = `stockflow-migrated-schema-${crypto.randomUUID()}`;
    databaseNames.push(freshDatabaseName, migratedDatabaseName);
    const databaseV5 = createVersionFiveDatabase(migratedDatabaseName);
    await databaseV5.open();
    databaseV5.close();

    const freshDatabase = new StockFlowDatabase(freshDatabaseName);
    const migratedDatabase = new StockFlowDatabase(migratedDatabaseName);
    await freshDatabase.open();
    await migratedDatabase.open();

    expect(freshDatabase.verno).toBe(11);
    expect(migratedDatabase.verno).toBe(11);
    expect(schemaSignature(migratedDatabase)).toEqual(schemaSignature(freshDatabase));
    expect(schemaSignature(freshDatabase)).toEqual([
      {
        name: 'categories',
        primaryKey: 'id',
        indexes: ['businessId', 'deletedAt', 'name', 'syncStatus', 'updatedAt'],
      },
      {
        name: 'movements',
        primaryKey: 'id',
        indexes: ['businessId', 'date', 'productId', 'syncStatus', 'type'],
      },
      {
        name: 'outbox',
        primaryKey: 'id',
        indexes: [
          '&idempotencyKey',
          '[entityType+entityId]',
          'businessId',
          'createdAt',
          'nextAttemptAt',
          'operation',
          'status',
          'updatedAt',
          'userId',
        ].sort(),
      },
      {
        name: 'products',
        primaryKey: 'id',
        indexes: [
          'categoryId',
          'businessId',
          'currentQuantity',
          'deletedAt',
          'minimumStock',
          'name',
          'code',
          'syncStatus',
          'updatedAt',
        ].sort(),
      },
    ]);
    freshDatabase.close();
    migratedDatabase.close();
  });
});
