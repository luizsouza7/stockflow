import Dexie, { type Table } from 'dexie';
import type { Movement } from '../../types/Movement';
import type { Product } from '../../types/Product';

class StockFlowDatabase extends Dexie {
  products!: Table<Product, number>;
  movements!: Table<Movement, number>;

  constructor() {
    super('stockflow-local-db');

    this.version(1).stores({
      products: '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt',
      movements: '++id, productId, type, date, syncStatus',
    });

    this.version(2).stores({
      products:
        '++id, name, code, category, currentQuantity, minimumStock, syncStatus, updatedAt, deletedAt',
      movements: '++id, productId, type, date, syncStatus',
    });
  }
}

export const localDb = new StockFlowDatabase();

export async function createProduct(data: Omit<Product, 'id'>): Promise<number> {
  return localDb.products.add(data);
}

export async function updateProduct(id: number, data: Partial<Product>): Promise<number> {
  return localDb.products.update(id, {
    ...data,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
  });
}

export async function deleteProduct(id: number): Promise<void> {
  const changed = await localDb.products.update(id, {
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
  });

  if (!changed) {
    throw new Error('Produto nao encontrado.');
  }
}

export async function registerMovement(movement: Omit<Movement, 'id'>): Promise<void> {
  if (!Number.isInteger(movement.quantity) || movement.quantity <= 0) {
    throw new Error('A quantidade deve ser um numero inteiro maior que zero.');
  }

  if (movement.type !== 'entrada' && movement.type !== 'saida') {
    throw new Error('Tipo de movimentacao invalido.');
  }

  await localDb.transaction('rw', localDb.products, localDb.movements, async () => {
    const product = await localDb.products.get(movement.productId);

    if (!product || !product.id || product.deletedAt) {
      throw new Error('Produto nao encontrado.');
    }

    const nextQuantity =
      movement.type === 'entrada'
        ? product.currentQuantity + movement.quantity
        : product.currentQuantity - movement.quantity;

    if (nextQuantity < 0) {
      throw new Error('A saida nao pode ser maior que a quantidade disponivel.');
    }

    await localDb.products.update(product.id, {
      currentQuantity: nextQuantity,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    await localDb.movements.add(movement);
  });
}
