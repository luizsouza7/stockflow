import Dexie, { type Table } from 'dexie';
import type { Movement } from '../../types/Movement';
import type { Product } from '../../types/Product';

interface LegacyProductWithDecimalPrice {
  price?: unknown;
  salePriceInCents?: unknown;
}

interface MovementBeforeQuantitySnapshots {
  previousQuantity?: unknown;
  resultingQuantity?: unknown;
  isLegacy?: unknown;
}

export class StockFlowDatabase extends Dexie {
  products!: Table<Product, number>;
  movements!: Table<Movement, number>;

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
  }
}

export const localDb = new StockFlowDatabase();
