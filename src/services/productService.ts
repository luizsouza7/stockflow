import { needsRestock } from '../domain/stockStatus';
import { productRepository } from '../repositories/productRepository';
import type { CreateProductInput, Product } from '../types/Product';
import type { ProductWithCategory } from '../types/Product';
import { categoryRepository } from '../repositories/categoryRepository';
import { generateUuid } from '../utils/id';

export const productService = {
  async listActive(): Promise<ProductWithCategory[]> {
    const [products, categories] = await Promise.all([
      productRepository.findAllActive(),
      categoryRepository.findAll(),
    ]);
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    return products
      .map((product) => ({
        ...product,
        categoryName: resolveCategoryName(product.categoryId, categoryById),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async listProductsNeedingRestock(): Promise<ProductWithCategory[]> {
    const products = await this.listActive();
    return products.filter(needsRestock);
  },

  async getById(id: string): Promise<Product | undefined> {
    return productRepository.findById(id);
  },

  async create(data: CreateProductInput): Promise<string> {
    validateSalePriceInCents(data.salePriceInCents);
    await validateCategoryAssociation(data.categoryId);
    return productRepository.create({ ...data, id: generateUuid() });
  },

  async update(id: string, data: Partial<CreateProductInput>): Promise<number> {
    if (data.salePriceInCents !== undefined) {
      validateSalePriceInCents(data.salePriceInCents);
    }

    if ('categoryId' in data) {
      await validateCategoryAssociation(data.categoryId);
    }

    return productRepository.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    });
  },

  async softDelete(id: string): Promise<void> {
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

function resolveCategoryName(
  categoryId: string | undefined,
  categoryById: Map<string, { name: string; deletedAt?: string }>,
): string {
  if (!categoryId) {
    return 'Sem categoria';
  }

  const category = categoryById.get(categoryId);

  if (!category) {
    return 'Categoria indisponivel';
  }

  return category.deletedAt ? `${category.name} (excluida)` : category.name;
}

async function validateCategoryAssociation(categoryId: string | undefined): Promise<void> {
  if (!categoryId) {
    return;
  }

  const category = await categoryRepository.findById(categoryId);

  if (!category || category.deletedAt) {
    throw new Error('Selecione uma categoria ativa valida.');
  }
}

function validateSalePriceInCents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('O preco deve ser armazenado em centavos inteiros e nao negativos.');
  }
}
