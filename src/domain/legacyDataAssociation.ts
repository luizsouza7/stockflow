import type { Category } from '../types/Category';
import type { Movement } from '../types/Movement';
import type { Product } from '../types/Product';
import type { OutboxEntry } from '../types/Sync';

export interface LegacyAssociationSnapshot {
  categories: Category[];
  products: Product[];
  movements: Movement[];
  outbox: OutboxEntry[];
}

export interface LegacyAssociationBlocker {
  code:
    | 'product-category-missing'
    | 'product-category-scope'
    | 'movement-product-missing'
    | 'movement-product-scope'
    | 'outbox-business'
    | 'outbox-user'
    | 'outbox-processing'
    | 'outbox-incomplete-context';
  message: string;
}

export interface LegacyAssociationAnalysis {
  categories: number;
  products: number;
  movements: number;
  relatedOutbox: number;
  fullyUnscopedOutbox: number;
  selectedBusinessOutbox: number;
  blockers: LegacyAssociationBlocker[];
  snapshotToken: string;
  legacyEntityKeys: Set<string>;
}

export function analyzeLegacyAssociation(
  snapshot: LegacyAssociationSnapshot,
  userId: string,
  businessId: string,
): LegacyAssociationAnalysis {
  const categories = snapshot.categories.filter(({ businessId }) => businessId === undefined);
  const products = snapshot.products.filter(({ businessId }) => businessId === undefined);
  const movements = snapshot.movements.filter(({ businessId }) => businessId === undefined);
  const categoryById = new Map(snapshot.categories.map((category) => [category.id, category]));
  const productById = new Map(snapshot.products.map((product) => [product.id, product]));
  const blockers: LegacyAssociationBlocker[] = [];

  for (const product of snapshot.products) {
    if (!product.categoryId) continue;
    const category = categoryById.get(product.categoryId);
    if (!category) {
      blockers.push({
        code: 'product-category-missing',
        message: 'Existe produto que referencia uma categoria local inexistente.',
      });
      continue;
    }

    const resultingProductScope = product.businessId ?? businessId;
    const resultingCategoryScope = category.businessId ?? businessId;
    const unscopedProductPointsToScopedCategory =
      product.businessId === undefined && category.businessId !== undefined;
    if (
      unscopedProductPointsToScopedCategory ||
      resultingProductScope !== resultingCategoryScope
    ) {
      blockers.push({
        code: 'product-category-scope',
        message: 'Existe produto e categoria em escopos incompatíveis para a associação integral.',
      });
    }
  }

  for (const movement of snapshot.movements) {
    const product = productById.get(movement.productId);
    if (!product) {
      blockers.push({
        code: 'movement-product-missing',
        message: 'Existe movimentação órfã, sem o produto local correspondente.',
      });
      continue;
    }

    const resultingMovementScope = movement.businessId ?? businessId;
    const resultingProductScope = product.businessId ?? businessId;
    const unscopedMovementPointsToScopedProduct =
      movement.businessId === undefined && product.businessId !== undefined;
    if (
      unscopedMovementPointsToScopedProduct ||
      resultingMovementScope !== resultingProductScope
    ) {
      blockers.push({
        code: 'movement-product-scope',
        message: 'Existe movimentação e produto em escopos incompatíveis para a associação integral.',
      });
    }
  }

  const legacyEntityKeys = new Set<string>([
    ...categories.map(({ id }) => entityKey('category', id)),
    ...products.map(({ id }) => entityKey('product', id)),
    ...movements.map(({ id }) => entityKey('movement', id)),
  ]);
  const relatedOutbox = snapshot.outbox.filter((entry) =>
    legacyEntityKeys.has(entityKey(entry.entityType, entry.entityId)),
  );

  for (const entry of relatedOutbox) {
    if (entry.status === 'processing') {
      blockers.push({
        code: 'outbox-processing',
        message: 'Existe alteração relacionada em processamento. Aguarde sua conclusão.',
      });
    }
    if (entry.businessId && entry.businessId !== businessId) {
      blockers.push({
        code: 'outbox-business',
        message: 'Existe alteração relacionada vinculada a outro estabelecimento.',
      });
    }
    if (entry.userId && entry.userId !== userId) {
      blockers.push({
        code: 'outbox-user',
        message: 'Existe alteração relacionada vinculada a outro usuário.',
      });
    }
    if (entry.userId && !entry.businessId) {
      blockers.push({
        code: 'outbox-incomplete-context',
        message: 'Existe alteração relacionada com vínculo de usuário incompleto.',
      });
    }
  }

  return {
    categories: categories.length,
    products: products.length,
    movements: movements.length,
    relatedOutbox: relatedOutbox.length,
    fullyUnscopedOutbox: relatedOutbox.filter(
      ({ userId, businessId }) => !userId && !businessId,
    ).length,
    selectedBusinessOutbox: relatedOutbox.filter(
      (entry) => entry.businessId === businessId,
    ).length,
    blockers,
    snapshotToken: createLegacyAssociationSnapshotToken(snapshot),
    legacyEntityKeys,
  };
}

export function createLegacyAssociationSnapshotToken(
  snapshot: LegacyAssociationSnapshot,
): string {
  return JSON.stringify({
    categories: [...snapshot.categories].sort(byId),
    products: [...snapshot.products].sort(byId),
    movements: [...snapshot.movements].sort(byId),
    outbox: [...snapshot.outbox].sort(byId),
  });
}

export function entityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}
