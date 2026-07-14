import { localDb } from '../services/db/localDb';
import type { CreateProductInput, Product } from '../types/Product';

export const productRepository = {
  async findAll(): Promise<Product[]> {
    return localDb.products.toArray();
  },

  async findAllActive(): Promise<Product[]> {
    const products = await localDb.products.toArray();
    return products.filter((product) => !product.deletedAt);
  },

  async findById(id: string): Promise<Product | undefined> {
    return localDb.products.get(id);
  },

  async create(product: Product): Promise<string> {
    return localDb.products.add(product);
  },

  async update(id: string, changes: Partial<CreateProductInput>): Promise<number> {
    return localDb.products.update(id, changes);
  },

  async findPending(): Promise<Product[]> {
    return localDb.products.where('syncStatus').equals('pending').toArray();
  },

  async countActiveByCategoryId(categoryId: string): Promise<number> {
    const products = await localDb.products.where('categoryId').equals(categoryId).toArray();
    return products.filter((product) => !product.deletedAt).length;
  },
};
