import { localDb } from '../services/db/localDb';
import type { Movement } from '../types/Movement';

export const movementRepository = {
  async findAllNewestFirst(): Promise<Movement[]> {
    return localDb.movements.orderBy('date').reverse().toArray();
  },

  async create(movement: Movement): Promise<number> {
    return localDb.movements.add(movement);
  },

  async findPending(): Promise<Movement[]> {
    return localDb.movements.where('syncStatus').equals('pending').toArray();
  },
};
