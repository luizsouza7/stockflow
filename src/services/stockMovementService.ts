import { calculateStockSnapshot } from '../domain/stockMovement';
import { movementRepository } from '../repositories/movementRepository';
import { productRepository } from '../repositories/productRepository';
import { localDb } from './db/localDb';
import type { MovementWithProduct, RegisterMovementInput } from '../types/Movement';
import { generateUuid } from '../utils/id';

export const stockMovementService = {
  async register(movement: RegisterMovementInput): Promise<void> {
    await localDb.transaction('rw', localDb.products, localDb.movements, async () => {
      const product = await productRepository.findById(movement.productId);

      if (!product || product.deletedAt) {
        throw new Error('Produto nao encontrado.');
      }

      const snapshot = calculateStockSnapshot(
        product.currentQuantity,
        movement.type,
        movement.quantity,
      );

      await productRepository.update(product.id, {
        currentQuantity: snapshot.resultingQuantity,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      await movementRepository.create({
        id: generateUuid(),
        ...movement,
        ...snapshot,
        isLegacy: false,
      });
    });
  },

  async listHistory(): Promise<MovementWithProduct[]> {
    const [movements, products] = await Promise.all([
      movementRepository.findAllNewestFirst(),
      productRepository.findAll(),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));

    return movements.map((movement) => ({
      ...movement,
      productName: productById.get(movement.productId)?.name ?? 'Produto removido',
      productCode: productById.get(movement.productId)?.code ?? '-',
    }));
  },
};
