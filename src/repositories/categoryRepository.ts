import { localDb } from '../services/db/localDb';
import type { Category } from '../types/Category';

export const categoryRepository = {
  async findAll(): Promise<Category[]> {
    return localDb.categories.toArray();
  },

  async findAllActive(): Promise<Category[]> {
    const categories = await localDb.categories.toArray();
    return categories.filter((category) => !category.deletedAt);
  },

  async findById(id: string): Promise<Category | undefined> {
    return localDb.categories.get(id);
  },

  async create(category: Category): Promise<string> {
    return localDb.categories.add(category);
  },

  async update(id: string, changes: Partial<Category>): Promise<number> {
    return localDb.categories.update(id, changes);
  },
};
