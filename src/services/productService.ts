import { needsRestock } from '../domain/stockStatus';
import { productRepository } from '../repositories/productRepository';
import type { CreateProductInput, Product } from '../types/Product';
import type { ProductWithCategory } from '../types/Product';
import { categoryRepository } from '../repositories/categoryRepository';
import { generateUuid } from '../utils/id';
import type { UpdateProductInput } from '../types/Product';
import {
  normalizeProductCodeForComparison,
  sanitizeProductCode,
} from '../domain/productCode';
import { localDb } from './db/localDb';
import { outboxService } from './outboxService';

export type ProductEditingLookup =
  | { status: 'active'; product: Product }
  | { status: 'deleted' }
  | { status: 'not-found' };

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

  async getForEditing(id: string): Promise<ProductEditingLookup> {
    const product = await productRepository.findById(id);

    if (!product) {
      return { status: 'not-found' };
    }

    if (product.deletedAt) {
      return { status: 'deleted' };
    }

    return { status: 'active', product };
  },

  async create(data: CreateProductInput): Promise<string> {
    const name = sanitizeProductName(data.name);
    validateMinimumStock(data.minimumStock);
    validateSalePriceInCents(data.salePriceInCents);
    validateInitialQuantity(data.currentQuantity);
    await validateCategoryAssociation(data.categoryId);
    const code = sanitizeProductCode(data.code);
    await ensureUniqueActiveCode(code);
    const product: Product = {
      ...data,
      id: generateUuid(),
      name,
      code,
      syncStatus: 'pending',
    };

    return localDb.transaction('rw', localDb.products, localDb.outbox, async () => {
      const id = await productRepository.create(product);
      await outboxService.enqueue({
        entityType: 'product',
        entityId: id,
        operation: 'product.created',
        payload: product,
        occurredAt: product.updatedAt,
      });
      return id;
    });
  },

  async update(id: string, data: UpdateProductInput): Promise<number> {
    const product = await productRepository.findById(id);

    if (!product || product.deletedAt) {
      throw new Error('Produto nao encontrado.');
    }

    if (data.salePriceInCents !== undefined) {
      validateSalePriceInCents(data.salePriceInCents);
    }

    if (data.minimumStock !== undefined) {
      validateMinimumStock(data.minimumStock);
    }

    if ('categoryId' in data) {
      await validateCategoryAssociation(data.categoryId);
    }

    const changes: Partial<CreateProductInput> = {
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    if (data.name !== undefined) changes.name = sanitizeProductName(data.name);
    if (data.categoryId !== undefined) changes.categoryId = data.categoryId;
    if ('categoryId' in data && data.categoryId === undefined) changes.categoryId = undefined;
    if (data.salePriceInCents !== undefined) changes.salePriceInCents = data.salePriceInCents;
    if (data.minimumStock !== undefined) changes.minimumStock = data.minimumStock;

    if (data.code !== undefined) {
      const code = sanitizeProductCode(data.code);
      await ensureUniqueActiveCode(code, product.code);
      changes.code = code;
    }

    return localDb.transaction('rw', localDb.products, localDb.outbox, async () => {
      const changed = await productRepository.update(id, changes);
      if (!changed) return changed;
      const updatedProduct = await productRepository.findById(id);
      if (!updatedProduct) throw new Error('Produto nao encontrado.');
      await outboxService.enqueue({
        entityType: 'product',
        entityId: id,
        operation: 'product.updated',
        payload: updatedProduct,
        occurredAt: updatedProduct.updatedAt,
      });
      return changed;
    });
  },

  async softDelete(id: string): Promise<void> {
    const now = new Date().toISOString();
    const changed = await localDb.transaction(
      'rw',
      localDb.products,
      localDb.outbox,
      async () => {
        const updated = await productRepository.update(id, {
          deletedAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
        if (!updated) return updated;
        const deletedProduct = await productRepository.findById(id);
        if (!deletedProduct) throw new Error('Produto nao encontrado.');
        await outboxService.enqueue({
          entityType: 'product',
          entityId: id,
          operation: 'product.deleted',
          payload: deletedProduct,
          occurredAt: now,
        });
        return updated;
      },
    );

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

function sanitizeProductName(value: string): string {
  const name = value.trim();

  if (!name) {
    throw new Error('Informe o nome do produto.');
  }

  return name;
}

function validateMinimumStock(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('O estoque minimo deve ser um numero inteiro nao negativo.');
  }
}

function validateInitialQuantity(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('A quantidade inicial deve ser um numero inteiro nao negativo.');
  }
}

async function ensureUniqueActiveCode(code: string, currentCode?: string): Promise<void> {
  const normalizedCode = normalizeProductCodeForComparison(code);

  if (
    !normalizedCode ||
    (currentCode !== undefined &&
      normalizedCode === normalizeProductCodeForComparison(currentCode))
  ) {
    return;
  }

  const activeProducts = await productRepository.findAllActive();
  const duplicate = activeProducts.some(
    (product) => normalizeProductCodeForComparison(product.code) === normalizedCode,
  );

  if (duplicate) {
    throw new Error('Ja existe um produto ativo com este codigo.');
  }
}
