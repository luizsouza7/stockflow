import Dexie, { type Table } from 'dexie';
import type { Movement } from '../../types/Movement';
import type { Product } from '../../types/Product';
import type { Category } from '../../types/Category';
import { generateUuid } from '../../utils/id';

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

function normalizeLegacyCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function sanitizeLegacyCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export class StockFlowDatabase extends Dexie {
  products!: Table<Product, number>;
  movements!: Table<Movement, number>;
  categories!: Table<Category, string>;

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
  }
}

export const localDb = new StockFlowDatabase();
