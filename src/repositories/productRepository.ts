import { localDb } from '../services/db/localDb';
import type { CreateProductInput, Product } from '../types/Product';
import {
  isEntityInBusiness,
  isUnscopedEntity,
  validateBusinessId,
} from '../domain/businessScope';

type ProductDetailsChanges = Partial<Omit<CreateProductInput, 'currentQuantity'>>;
type ProductStockChanges = Pick<
  Product,
  'currentQuantity' | 'updatedAt' | 'syncStatus'
>;

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

  async findAllUnscoped(): Promise<Product[]> {
    return localDb.products.filter(isUnscopedEntity).toArray();
  },

  async findAllActiveUnscoped(): Promise<Product[]> {
    return localDb.products.filter(
      (product) => isUnscopedEntity(product) && !product.deletedAt,
    ).toArray();
  },

  async findAllForBusiness(businessId: string): Promise<Product[]> {
    validateBusinessId(businessId);
    return localDb.products.where('businessId').equals(businessId).toArray();
  },

  async findAllActiveForBusiness(businessId: string): Promise<Product[]> {
    const products = await this.findAllForBusiness(businessId);
    return products.filter((product) => !product.deletedAt);
  },

  async findUnscopedById(id: string): Promise<Product | undefined> {
    const product = await localDb.products.get(id);
    return product && isUnscopedEntity(product) ? product : undefined;
  },

  async findByIdForBusiness(id: string, businessId: string): Promise<Product | undefined> {
    validateBusinessId(businessId);
    const product = await localDb.products.get(id);
    return product && isEntityInBusiness(product, businessId) ? product : undefined;
  },

  async create(product: Product): Promise<string> {
    return localDb.products.add(product);
  },

  async update(id: string, changes: ProductDetailsChanges): Promise<number> {
    return localDb.products.update(id, changes);
  },

  async updateStock(id: string, changes: ProductStockChanges): Promise<number> {
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
