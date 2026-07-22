import {
  normalizeCategoryNameForComparison,
  validateCategoryName,
} from '../domain/category';
import { categoryRepository } from '../repositories/categoryRepository';
import { productRepository } from '../repositories/productRepository';
import type { Category } from '../types/Category';
import { generateUuid } from '../utils/id';
import { localDb } from './db/localDb';
import { outboxService } from './outboxService';
import { validateBusinessId } from '../domain/businessScope';

type CategoryChanges = Partial<Omit<Category, 'id' | 'businessId'>>;

export const categoryService = {
  async listActive(): Promise<Category[]> {
    const categories = await categoryRepository.findAllActive();
    return categories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async getById(id: string): Promise<Category | undefined> {
    return categoryRepository.findById(id);
  },

  async create(name: string): Promise<string> {
    return createInScope(name);
  },

  async createScoped(name: string, businessId: string): Promise<string> {
    validateBusinessId(businessId);
    return createInScope(name, businessId);
  },

  async update(id: string, name: string): Promise<void> {
    const category = await categoryRepository.findById(id);

    if (!category || category.deletedAt) {
      throw new Error('Categoria nao encontrada.');
    }

    const sanitizedName = validateCategoryName(name);
    await ensureUniqueActiveName(sanitizedName, category.businessId, id);
    const now = new Date().toISOString();
    const changes: CategoryChanges = {
      name: sanitizedName,
      updatedAt: now,
      syncStatus: 'pending',
    };

    await localDb.transaction('rw', localDb.categories, localDb.outbox, async () => {
      const changed = await categoryRepository.update(id, changes);
      if (!changed) throw new Error('Categoria nao encontrada.');
      const updatedCategory = await categoryRepository.findById(id);
      if (!updatedCategory) throw new Error('Categoria nao encontrada.');
      await outboxService.enqueue({
        entityType: 'category',
        entityId: id,
        operation: 'category.updated',
        payload: updatedCategory,
        occurredAt: now,
      });
    });
  },

  async softDelete(id: string): Promise<void> {
    const category = await categoryRepository.findById(id);

    if (!category || category.deletedAt) {
      throw new Error('Categoria nao encontrada.');
    }

    const productsUsingCategory = await productRepository.countActiveByCategoryId(id);

    if (productsUsingCategory > 0) {
      throw new Error(
        `Nao e possivel excluir esta categoria porque ela esta sendo utilizada por ${productsUsingCategory} produto(s) ativo(s).`,
      );
    }

    const now = new Date().toISOString();

    await localDb.transaction('rw', localDb.categories, localDb.outbox, async () => {
      const changed = await categoryRepository.update(id, {
        deletedAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      if (!changed) throw new Error('Categoria nao encontrada.');
      const deletedCategory = await categoryRepository.findById(id);
      if (!deletedCategory) throw new Error('Categoria nao encontrada.');
      await outboxService.enqueue({
        entityType: 'category',
        entityId: id,
        operation: 'category.deleted',
        payload: deletedCategory,
        occurredAt: now,
      });
    });
  },
};

async function createInScope(name: string, businessId?: string): Promise<string> {
  const sanitizedName = validateCategoryName(name);
  await ensureUniqueActiveName(sanitizedName, businessId);
  const now = new Date().toISOString();

  const category: Category = {
    id: generateUuid(),
    ...(businessId ? { businessId } : {}),
    name: sanitizedName,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  return localDb.transaction('rw', localDb.categories, localDb.outbox, async () => {
    const id = await categoryRepository.create(category);
    await outboxService.enqueue({
      entityType: 'category',
      entityId: id,
      operation: 'category.created',
      payload: category,
      occurredAt: now,
    });
    return id;
  });
}

async function ensureUniqueActiveName(
  name: string,
  businessId: string | undefined,
  ignoredId?: string,
): Promise<void> {
  const normalizedName = normalizeCategoryNameForComparison(name);
  const categories = businessId
    ? await categoryRepository.findAllActiveForBusiness(businessId)
    : await categoryRepository.findAllActiveUnscoped();
  const duplicate = categories.some(
    (category) =>
      category.id !== ignoredId &&
      normalizeCategoryNameForComparison(category.name) === normalizedName,
  );

  if (duplicate) {
    throw new Error('Ja existe uma categoria ativa com este nome.');
  }
}
