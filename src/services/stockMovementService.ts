import { calculateStockSnapshot } from '../domain/stockMovement';
import { movementRepository } from '../repositories/movementRepository';
import { productRepository } from '../repositories/productRepository';
import { localDb } from './db/localDb';
import type { MovementWithProduct, RegisterMovementInput, TrackedMovement } from '../types/Movement';
import { generateUuid } from '../utils/id';
import { outboxService } from './outboxService';

export const stockMovementService = {
  async register(movement: RegisterMovementInput): Promise<void> {
    await localDb.transaction(
      'rw',
      localDb.products,
      localDb.movements,
      localDb.outbox,
      async () => {
      const product = await productRepository.findById(movement.productId);

      if (!product || product.deletedAt) {
        throw new Error('Produto nao encontrado.');
      }

      const snapshot = calculateStockSnapshot(
        product.currentQuantity,
        movement.type,
        movement.quantity,
      );

      const now = new Date().toISOString();
      await productRepository.updateStock(product.id, {
        currentQuantity: snapshot.resultingQuantity,
        updatedAt: now,
        syncStatus: 'pending',
      });

      const persistedMovement: TrackedMovement = {
        id: generateUuid(),
        ...(product.businessId ? { businessId: product.businessId } : {}),
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity,
        note: movement.note,
        date: movement.date,
        ...snapshot,
        isLegacy: false,
        syncStatus: 'pending',
      };
      await movementRepository.create(persistedMovement);
      await outboxService.enqueue({
        entityType: 'movement',
        entityId: persistedMovement.id,
        operation: 'movement.created',
        payload: persistedMovement,
        occurredAt: now,
      });
      },
    );
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
