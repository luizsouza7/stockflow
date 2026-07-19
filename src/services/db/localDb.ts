import Dexie, { type Table } from 'dexie';
import type { LegacyMovement, Movement, TrackedMovement } from '../../types/Movement';
import type { Product } from '../../types/Product';
import type { Category } from '../../types/Category';
import { generateUuid } from '../../utils/id';
import type { OutboxEntry } from '../../types/Sync';

interface LegacyProductWithDecimalPrice {
  price?: unknown;
  salePriceInCents?: unknown;
}

interface MovementBeforeQuantitySnapshots {
  previousQuantity?: unknown;
  resultingQuantity?: unknown;
  isLegacy?: unknown;
}

interface ProductBeforeCategories {
  id?: number;
  category?: unknown;
  categoryId?: unknown;
}

type ProductV5 = Omit<Product, 'id'> & { id: number };
type MovementV5 = (
  | Omit<TrackedMovement, 'id' | 'productId'>
  | Omit<LegacyMovement, 'id' | 'productId'>
) & {
  id: number;
  productId: number;
};

const productSchemaV5 =
  '++id, name, code, categoryId, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt';
const movementSchemaV5 = '++id, productId, type, date, syncStatus';
const productSchemaWithUuid =
  'id, name, code, categoryId, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt';
const movementSchemaWithUuid = 'id, productId, type, date, syncStatus';
const productsMigrationTable = 'productsUuidMigration';
const movementsMigrationTable = 'movementsUuidMigration';

function normalizeLegacyCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function sanitizeLegacyCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export class StockFlowDatabase extends Dexie {
  products!: Table<Product, string>;
  movements!: Table<Movement, string>;
  categories!: Table<Category, string>;
  outbox!: Table<OutboxEntry, string>;

  constructor(databaseName = 'stockflow-local-db') {
    super(databaseName);

    this.version(1).stores({
      products: '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt',
      movements: '++id, productId, type, date, syncStatus',
    });

    this.version(2).stores({
      products:
        '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
      movements: '++id, productId, type, date, syncStatus',
    });

    this.version(3)
      .stores({
        products:
          '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
        movements: '++id, productId, type, date, syncStatus',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<LegacyProductWithDecimalPrice, number>('products')
          .toCollection()
          .modify((product) => {
            if (
              typeof product.salePriceInCents === 'number' &&
              Number.isSafeInteger(product.salePriceInCents) &&
              product.salePriceInCents >= 0
            ) {
              delete product.price;
              return;
            }

            if (
              typeof product.price !== 'number' ||
              !Number.isFinite(product.price) ||
              product.price < 0
            ) {
              throw new Error('Produto antigo possui preco invalido e nao pode ser migrado.');
            }

            const migratedPrice = Math.round(product.price * 100);

            if (!Number.isSafeInteger(migratedPrice)) {
              throw new Error('Produto antigo possui preco fora do intervalo seguro.');
            }

            product.salePriceInCents = migratedPrice;
            delete product.price;
          });
      });

    this.version(4)
      .stores({
        products:
          '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
        movements: '++id, productId, type, date, syncStatus',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<MovementBeforeQuantitySnapshots, number>('movements')
          .toCollection()
          .modify((movement) => {
            const hasValidSnapshot =
              Number.isInteger(movement.previousQuantity) &&
              Number.isInteger(movement.resultingQuantity) &&
              Number(movement.previousQuantity) >= 0 &&
              Number(movement.resultingQuantity) >= 0;

            if (hasValidSnapshot) {
              movement.isLegacy = false;
              return;
            }

            delete movement.previousQuantity;
            delete movement.resultingQuantity;
            movement.isLegacy = true;
          });
      });

    this.version(5)
      .stores({
        products:
          '++id, name, code, categoryId, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
        movements: '++id, productId, type, date, syncStatus',
        categories: 'id, name, updatedAt, deletedAt, syncStatus',
      })
      .upgrade(async (transaction) => {
        const products = await transaction
          .table<ProductBeforeCategories, number>('products')
          .toArray();
        const categoryByNormalizedName = new Map<string, Category>();
        const categoryIdByProductId = new Map<number, string | undefined>();
        const migrationTimestamp = new Date().toISOString();

        for (const product of products) {
          const legacyName =
            typeof product.category === 'string'
              ? sanitizeLegacyCategoryName(product.category)
              : '';

          if (!legacyName) {
            if (product.id !== undefined) {
              categoryIdByProductId.set(product.id, undefined);
            }
            continue;
          }

          const normalizedName = normalizeLegacyCategoryName(legacyName);
          let category = categoryByNormalizedName.get(normalizedName);

          if (!category) {
            category = {
              id: generateUuid(),
              name: legacyName,
              createdAt: migrationTimestamp,
              updatedAt: migrationTimestamp,
              syncStatus: 'pending',
            };
            categoryByNormalizedName.set(normalizedName, category);
          }

          if (product.id !== undefined) {
            categoryIdByProductId.set(product.id, category.id);
          }
        }

        await transaction
          .table<ProductBeforeCategories, number>('products')
          .toCollection()
          .modify((product) => {
            product.categoryId =
              product.id === undefined ? undefined : categoryIdByProductId.get(product.id);
            delete product.category;
          });

        if (categoryByNormalizedName.size > 0) {
          await transaction
            .table<Category, string>('categories')
            .bulkAdd([...categoryByNormalizedName.values()]);
        }
      });

    // IndexedDB nao permite alterar o keyPath de uma object store existente, e o
    // Dexie rejeita diretamente essa mudanca. As versoes 6 a 9 formam uma unica
    // migration atomica: copiam, removem, recriam e restauram as duas stores.
    this.version(6)
      .stores({
        products: productSchemaV5,
        movements: movementSchemaV5,
        categories: 'id, name, updatedAt, deletedAt, syncStatus',
        [productsMigrationTable]: productSchemaWithUuid,
        [movementsMigrationTable]: movementSchemaWithUuid,
      })
      .upgrade(async (transaction) => {
        const oldProducts = await transaction.table<ProductV5, number>('products').toArray();
        const oldMovements = await transaction.table<MovementV5, number>('movements').toArray();
        const productIdMap = new Map<number, string>();
        const usedUuids = new Set<string>();

        const migratedProducts = oldProducts.map((product): Product => {
          if (!Number.isSafeInteger(product.id)) {
            throw new Error('Produto antigo possui identificador numerico invalido.');
          }

          const newId = generateUuid();

          if (usedUuids.has(newId)) {
            throw new Error('Nao foi possivel gerar UUIDs unicos durante a migracao.');
          }

          usedUuids.add(newId);
          productIdMap.set(product.id, newId);
          return { ...product, id: newId };
        });

        const migratedMovements = oldMovements.map((movement): Movement => {
          const newProductId = productIdMap.get(movement.productId);

          if (!newProductId) {
            throw new Error(
              `Movimentacao antiga ${movement.id} referencia produto inexistente ${movement.productId}.`,
            );
          }

          const newId = generateUuid();

          if (usedUuids.has(newId)) {
            throw new Error('Nao foi possivel gerar UUIDs unicos durante a migracao.');
          }

          usedUuids.add(newId);
          return { ...movement, id: newId, productId: newProductId };
        });

        if (migratedProducts.length > 0) {
          await transaction
            .table<Product, string>(productsMigrationTable)
            .bulkAdd(migratedProducts);
        }

        if (migratedMovements.length > 0) {
          await transaction
            .table<Movement, string>(movementsMigrationTable)
            .bulkAdd(migratedMovements);
        }
      });

    this.version(7).stores({
      products: null,
      movements: null,
    });

    this.version(8)
      .stores({
        products: productSchemaWithUuid,
        movements: movementSchemaWithUuid,
      })
      .upgrade(async (transaction) => {
        const [products, movements] = await Promise.all([
          transaction.table<Product, string>(productsMigrationTable).toArray(),
          transaction.table<Movement, string>(movementsMigrationTable).toArray(),
        ]);

        if (products.length > 0) {
          await transaction.table<Product, string>('products').bulkAdd(products);
        }

        if (movements.length > 0) {
          await transaction.table<Movement, string>('movements').bulkAdd(movements);
        }
      });

    this.version(9).stores({
      [productsMigrationTable]: null,
      [movementsMigrationTable]: null,
    });

    this.version(10).stores({
      outbox:
        'id, [entityType+entityId], operation, status, createdAt, updatedAt, nextAttemptAt, &idempotencyKey, userId, businessId',
    });
  }
}

export const localDb = new StockFlowDatabase();
