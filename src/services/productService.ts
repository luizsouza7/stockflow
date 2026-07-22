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
import {
  assertSameBusinessScope,
  validateBusinessId,
} from '../domain/businessScope';

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
    return createInScope(data);
  },

  async createScoped(data: CreateProductInput, businessId: string): Promise<string> {
    validateBusinessId(businessId);
    return createInScope(data, businessId);
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
      await validateCategoryAssociation(data.categoryId, product.businessId);
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
      await ensureUniqueActiveCode(code, product.businessId, product.code);
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

async function createInScope(
  data: CreateProductInput,
  businessId?: string,
): Promise<string> {
  const name = sanitizeProductName(data.name);
  validateMinimumStock(data.minimumStock);
  validateSalePriceInCents(data.salePriceInCents);
  validateInitialQuantity(data.currentQuantity);
  await validateCategoryAssociation(data.categoryId, businessId);
  const code = sanitizeProductCode(data.code);
  await ensureUniqueActiveCode(code, businessId);
  const product: Product = {
    id: generateUuid(),
    ...(businessId ? { businessId } : {}),
    name,
    code,
    categoryId: data.categoryId,
    salePriceInCents: data.salePriceInCents,
    currentQuantity: data.currentQuantity,
    minimumStock: data.minimumStock,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ...(data.deletedAt ? { deletedAt: data.deletedAt } : {}),
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
}

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

async function validateCategoryAssociation(
  categoryId: string | undefined,
  businessId: string | undefined,
): Promise<void> {
  if (!categoryId) {
    return;
  }

  const category = await categoryRepository.findById(categoryId);

  if (!category || category.deletedAt) {
    throw new Error('Selecione uma categoria ativa valida.');
  }

  assertSameBusinessScope(
    { businessId },
    category,
    'A categoria selecionada pertence a outro escopo local.',
  );
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

async function ensureUniqueActiveCode(
  code: string,
  businessId: string | undefined,
  currentCode?: string,
): Promise<void> {
  const normalizedCode = normalizeProductCodeForComparison(code);

  if (
    !normalizedCode ||
    (currentCode !== undefined &&
      normalizedCode === normalizeProductCodeForComparison(currentCode))
  ) {
    return;
  }

  const activeProducts = businessId
    ? await productRepository.findAllActiveForBusiness(businessId)
    : await productRepository.findAllActiveUnscoped();
  const duplicate = activeProducts.some(
    (product) => normalizeProductCodeForComparison(product.code) === normalizedCode,
  );

  if (duplicate) {
    throw new Error('Ja existe um produto ativo com este codigo.');
  }
}
