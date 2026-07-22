import { localDb } from '../services/db/localDb';
import type { Movement } from '../types/Movement';
import {
  isUnscopedEntity,
  validateBusinessId,
} from '../domain/businessScope';

export const movementRepository = {
  async findAllNewestFirst(): Promise<Movement[]> {
    return localDb.movements.orderBy('date').reverse().toArray();
  },

  async create(movement: Movement): Promise<string> {
    return localDb.movements.add(movement);
  },

  async findAllUnscopedNewestFirst(): Promise<Movement[]> {
    const movements = await localDb.movements.filter(isUnscopedEntity).toArray();
    return movements.sort((left, right) =>
      right.date.localeCompare(left.date) || right.id.localeCompare(left.id),
    );
  },

  async findAllForBusinessNewestFirst(businessId: string): Promise<Movement[]> {
    validateBusinessId(businessId);
    const movements = await localDb.movements.where('businessId').equals(businessId).toArray();
    return movements.sort((left, right) =>
      right.date.localeCompare(left.date) || right.id.localeCompare(left.id),
    );
  },

  async findPending(): Promise<Movement[]> {
    return localDb.movements.where('syncStatus').equals('pending').toArray();
  },
};
