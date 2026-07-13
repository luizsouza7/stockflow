import type { MovementWithProduct } from '../../types/Movement';
import { localDb } from './localDb';

export async function getActiveProducts() {
  const products = await localDb.products.toArray();
  return products.filter((product) => !product.deletedAt);
}

export async function getMovementsWithProducts(): Promise<MovementWithProduct[]> {
  const movements = await localDb.movements.orderBy('date').reverse().toArray();
  const products = await localDb.products.toArray();
  const productById = new Map(products.map((product) => [product.id, product]));

  return movements.map((movement) => {
    const product = productById.get(movement.productId);

    return {
      ...movement,
      productName: product?.name ?? 'Produto removido',
      productCode: product?.code ?? '-',
    };
  });
}
