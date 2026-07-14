import {
  normalizeCategoryNameForComparison,
  validateCategoryName,
} from '../domain/category';
import { categoryRepository } from '../repositories/categoryRepository';
import { productRepository } from '../repositories/productRepository';
import type { Category } from '../types/Category';
import { generateUuid } from '../utils/id';

export const categoryService = {
  async listActive(): Promise<Category[]> {
    const categories = await categoryRepository.findAllActive();
    return categories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async getById(id: string): Promise<Category | undefined> {
    return categoryRepository.findById(id);
  },

  async create(name: string): Promise<string> {
    const sanitizedName = validateCategoryName(name);
    await ensureUniqueActiveName(sanitizedName);
    const now = new Date().toISOString();

    return categoryRepository.create({
      id: generateUuid(),
      name: sanitizedName,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
  },

  async update(id: string, name: string): Promise<void> {
    const category = await categoryRepository.findById(id);

    if (!category || category.deletedAt) {
      throw new Error('Categoria nao encontrada.');
    }

    const sanitizedName = validateCategoryName(name);
    await ensureUniqueActiveName(sanitizedName, id);
    await categoryRepository.update(id, {
      name: sanitizedName,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
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

    await categoryRepository.update(id, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });
  },
};

async function ensureUniqueActiveName(name: string, ignoredId?: string): Promise<void> {
  const normalizedName = normalizeCategoryNameForComparison(name);
  const categories = await categoryRepository.findAllActive();
  const duplicate = categories.some(
    (category) =>
      category.id !== ignoredId &&
      normalizeCategoryNameForComparison(category.name) === normalizedName,
  );

  if (duplicate) {
    throw new Error('Ja existe uma categoria ativa com este nome.');
  }
}
