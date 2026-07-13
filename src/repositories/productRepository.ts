import { localDb } from '../services/db/localDb';
import type { Product } from '../types/Product';

export const productRepository = {
  async findAll(): Promise<Product[]> {
    return localDb.products.toArray();
  },

  async findAllActive(): Promise<Product[]> {
    const products = await localDb.products.toArray();
    return products.filter((product) => !product.deletedAt);
  },

  async findById(id: number): Promise<Product | undefined> {
    return localDb.products.get(id);
  },

  async create(product: Omit<Product, 'id'>): Promise<number> {
    return localDb.products.add(product);
  },

  async update(id: number, changes: Partial<Product>): Promise<number> {
    return localDb.products.update(id, changes);
  },

  async findPending(): Promise<Product[]> {
    return localDb.products.where('syncStatus').equals('pending').toArray();
  },
};
