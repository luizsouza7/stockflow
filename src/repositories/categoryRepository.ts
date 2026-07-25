import { localDb } from '../services/db/localDb';
import type { Category } from '../types/Category';
import {
  isEntityInBusiness,
  isUnscopedEntity,
  validateBusinessId,
  type DataScopeReference,
} from '../domain/businessScope';

type CategoryChanges = Partial<Omit<Category, 'id' | 'businessId'>>;

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

  async findAllUnscoped(): Promise<Category[]> {
    return localDb.categories.filter(isUnscopedEntity).toArray();
  },

  async findAllActiveUnscoped(): Promise<Category[]> {
    return localDb.categories.filter(
      (category) => isUnscopedEntity(category) && !category.deletedAt,
    ).toArray();
  },

  async findAllForBusiness(businessId: string): Promise<Category[]> {
    validateBusinessId(businessId);
    return localDb.categories.where('businessId').equals(businessId).toArray();
  },

  async findAllActiveForBusiness(businessId: string): Promise<Category[]> {
    const categories = await this.findAllForBusiness(businessId);
    return categories.filter((category) => !category.deletedAt);
  },

  async findAllForScope(scope: DataScopeReference): Promise<Category[]> {
    return scope.kind === 'local'
      ? this.findAllUnscoped()
      : this.findAllForBusiness(scope.businessId);
  },

  async findAllActiveForScope(scope: DataScopeReference): Promise<Category[]> {
    return scope.kind === 'local'
      ? this.findAllActiveUnscoped()
      : this.findAllActiveForBusiness(scope.businessId);
  },

  async findUnscopedById(id: string): Promise<Category | undefined> {
    const category = await localDb.categories.get(id);
    return category && isUnscopedEntity(category) ? category : undefined;
  },

  async findByIdForBusiness(id: string, businessId: string): Promise<Category | undefined> {
    validateBusinessId(businessId);
    const category = await localDb.categories.get(id);
    return category && isEntityInBusiness(category, businessId) ? category : undefined;
  },

  async findByIdForScope(
    id: string,
    scope: DataScopeReference,
  ): Promise<Category | undefined> {
    return scope.kind === 'local'
      ? this.findUnscopedById(id)
      : this.findByIdForBusiness(id, scope.businessId);
  },

  async create(category: Category): Promise<string> {
    return localDb.categories.add(category);
  },

  async update(id: string, changes: CategoryChanges): Promise<number> {
    return localDb.categories.update(id, changes);
  },
};
