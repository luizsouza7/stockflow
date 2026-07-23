import {
  analyzeLegacyAssociation,
  entityKey,
  type LegacyAssociationAnalysis,
  type LegacyAssociationSnapshot,
} from '../domain/legacyDataAssociation';
import { localDb } from '../services/db/localDb';

export interface ApplyLegacyAssociationInput {
  userId: string;
  businessId: string;
  expectedSnapshotToken: string;
}

export interface AppliedLegacyAssociation {
  categories: number;
  products: number;
  movements: number;
  outboxUpdated: number;
}

export class LegacyAssociationStateError extends Error {}

export const legacyDataAssociationRepository = {
  async preview(userId: string, businessId: string): Promise<LegacyAssociationAnalysis> {
    return localDb.transaction(
      'r',
      localDb.categories,
      localDb.products,
      localDb.movements,
      localDb.outbox,
      async () => analyzeLegacyAssociation(await readSnapshot(), userId, businessId),
    );
  },

  async associate(input: ApplyLegacyAssociationInput): Promise<AppliedLegacyAssociation> {
    return localDb.transaction(
      'rw',
      localDb.categories,
      localDb.products,
      localDb.movements,
      localDb.outbox,
      async () => {
        const snapshot = await readSnapshot();
        const analysis = analyzeLegacyAssociation(snapshot, input.userId, input.businessId);

        if (analysis.snapshotToken !== input.expectedSnapshotToken) {
          throw new LegacyAssociationStateError(
            'Os dados locais mudaram desde a prévia. Revise as contagens antes de confirmar novamente.',
          );
        }
        if (analysis.blockers.length > 0) {
          throw new LegacyAssociationStateError(analysis.blockers[0].message);
        }

        const categories = snapshot.categories
          .filter(({ businessId }) => businessId === undefined)
          .map((category) => ({ ...category, businessId: input.businessId }));
        const products = snapshot.products
          .filter(({ businessId }) => businessId === undefined)
          .map((product) => ({ ...product, businessId: input.businessId }));
        const movements = snapshot.movements
          .filter(({ businessId }) => businessId === undefined)
          .map((movement) => ({ ...movement, businessId: input.businessId }));
        const outbox = snapshot.outbox
          .filter((entry) =>
            analysis.legacyEntityKeys.has(entityKey(entry.entityType, entry.entityId)),
          )
          .filter((entry) => !entry.userId || !entry.businessId)
          .map((entry) => ({
            ...entry,
            userId: entry.userId ?? input.userId,
            businessId: entry.businessId ?? input.businessId,
          }));

        if (categories.length > 0) await localDb.categories.bulkPut(categories);
        if (products.length > 0) await localDb.products.bulkPut(products);
        if (movements.length > 0) await localDb.movements.bulkPut(movements);
        if (outbox.length > 0) await localDb.outbox.bulkPut(outbox);

        return {
          categories: categories.length,
          products: products.length,
          movements: movements.length,
          outboxUpdated: outbox.length,
        };
      },
    );
  },
};

async function readSnapshot(): Promise<LegacyAssociationSnapshot> {
  const [categories, products, movements, outbox] = await Promise.all([
    localDb.categories.toArray(),
    localDb.products.toArray(),
    localDb.movements.toArray(),
    localDb.outbox.toArray(),
  ]);
  return { categories, products, movements, outbox };
}
