import { needsRestock } from '../domain/stockStatus';
import { productRepository } from '../repositories/productRepository';
import type { Product } from '../types/Product';

export const productService = {
  async listActive(): Promise<Product[]> {
    const products = await productRepository.findAllActive();
    return products.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async listProductsNeedingRestock(): Promise<Product[]> {
    const products = await productRepository.findAllActive();
    return products.filter(needsRestock);
  },

  async getById(id: number): Promise<Product | undefined> {
    return productRepository.findById(id);
  },

  async create(data: Omit<Product, 'id'>): Promise<number> {
    validateSalePriceInCents(data.salePriceInCents);
    return productRepository.create(data);
  },

  async update(id: number, data: Partial<Product>): Promise<number> {
    if (data.salePriceInCents !== undefined) {
      validateSalePriceInCents(data.salePriceInCents);
    }

    return productRepository.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });
  },

  async softDelete(id: number): Promise<void> {
    const changed = await productRepository.update(id, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    if (!changed) {
      throw new Error('Produto nao encontrado.');
    }
  },
};

function validateSalePriceInCents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('O preco deve ser armazenado em centavos inteiros e nao negativos.');
  }
}
