import { localDb } from '../services/db/localDb';
import type { Category } from '../types/Category';
import type { Movement } from '../types/Movement';
import type { Product } from '../types/Product';
import type { OutboxEntry } from '../types/Sync';
import type {
  InitialCloudLoadOperation,
  PersistedInitialCloudLoadResult,
} from '../types/InitialCloudLoad';
import { validateBusinessId, validateUserId } from '../domain/businessScope';
import {
  getValidatedRemoteVersion,
  validateOptionalRemoteVersion,
} from '../domain/remoteVersion';
import { buildInitialCloudLoadStateText } from '../domain/initialCloudLoadState';

export interface InitialCloudLoadSnapshot {
  categories: Category[];
  products: Product[];
  movements: Movement[];
  outbox: OutboxEntry[];
}

interface ReserveInitialCloudLoadInput {
  operation: InitialCloudLoadOperation;
  expectedStateText: string;
}

interface FinalizeInitialCloudLoadInput {
  operationId: string;
  absorbedAt: string;
  remoteVersion: number;
}

export interface InitialCloudLoadRepository {
  readSnapshot(businessId: string): Promise<InitialCloudLoadSnapshot>;
  findActiveOperation(
    userId: string,
    businessId: string,
  ): Promise<InitialCloudLoadOperation | undefined>;
  reserveSnapshot(input: ReserveInitialCloudLoadInput): Promise<void>;
  releaseReservation(operationId: string): Promise<void>;
  markRemoteConfirmed(
    operationId: string,
    result: PersistedInitialCloudLoadResult,
  ): Promise<void>;
  finalizeReservedSnapshot(input: FinalizeInitialCloudLoadInput): Promise<void>;
  applyRemoteBaseline(input: {
    businessId: string;
    categoryIds: string[];
    productIds: string[];
    remoteVersion: number;
  }): Promise<void>;
}

export const initialCloudLoadRepository: InitialCloudLoadRepository = {
  async readSnapshot(businessId) {
    validateBusinessId(businessId);
    return localDb.transaction(
      'r',
      localDb.categories,
      localDb.products,
      localDb.movements,
      localDb.outbox,
      async () => readSnapshotInCurrentTransaction(businessId),
    );
  },

  async findActiveOperation(userId, businessId) {
    validateUserId(userId);
    validateBusinessId(businessId);
    const operation = await localDb.initialCloudLoads
      .where('businessId')
      .equals(businessId)
      .first();
    return operation &&
      operation.userId === userId &&
      (operation.status === 'reserved' ||
        operation.status === 'remote-confirmed')
      ? operation
      : undefined;
  },

  async reserveSnapshot({ operation, expectedStateText }) {
    validateOperation(operation);
    await localDb.transaction(
      'rw',
      localDb.categories,
      localDb.products,
      localDb.movements,
      localDb.outbox,
      localDb.initialCloudLoads,
      async () => {
        const existing = await localDb.initialCloudLoads
          .where('businessId')
          .equals(operation.businessId)
          .first();
        if (existing) {
          if (
            existing.status !== 'completed' &&
            existing.id === operation.id &&
            existing.idempotencyKey === operation.idempotencyKey &&
            existing.payloadHash === operation.payloadHash
          ) {
            return;
          }
          if (existing.status === 'completed') {
            throw new Error(
              'Uma carga inicial concluida nao pode ser reutilizada. Gere uma nova previa.',
            );
          }
          throw new Error(
            'Ja existe uma reserva de carga inicial para este estabelecimento.',
          );
        }

        const snapshot = await readSnapshotInCurrentTransaction(
          operation.businessId,
        );
        if (
          buildInitialCloudLoadStateText(snapshot, operation.businessId) !==
          expectedStateText
        ) {
          throw new Error(
            'Os dados locais mudaram desde a previa. Revise novamente antes de confirmar.',
          );
        }

        const entries = await localDb.outbox.bulkGet(
          operation.reservedEventIds,
        );
        const allowedEntityKeys = new Set([
          ...operation.categoryIds.map((id) => `category:${id}`),
          ...operation.productIds.map((id) => `product:${id}`),
          ...operation.movementIds.map((id) => `movement:${id}`),
        ]);
        if (
          entries.some(
            (entry) =>
              !entry ||
              (entry.status !== 'pending' && entry.status !== 'error') ||
              entry.userId !== operation.userId ||
              entry.businessId !== operation.businessId ||
              !allowedEntityKeys.has(
                `${entry.entityType}:${entry.entityId}`,
              ),
          )
        ) {
          throw new Error(
            'A outbox mudou durante a reserva da carga inicial.',
          );
        }

        await localDb.initialCloudLoads.add(operation);
        if (entries.length > 0) {
          await localDb.outbox.bulkPut(
            entries.map((entry) => ({
              ...entry!,
              status: 'reserved' as const,
              bootstrapReservation: {
                operationId: operation.id,
                previousStatus: entry!.status as 'pending' | 'error',
              },
            })),
          );
        }
      },
    );
  },

  async releaseReservation(operationId) {
    await localDb.transaction(
      'rw',
      localDb.outbox,
      localDb.initialCloudLoads,
      async () => {
        const operation = await localDb.initialCloudLoads.get(operationId);
        if (!operation) return;
        if (operation.status !== 'reserved') {
          throw new Error(
            'Uma carga confirmada remotamente nao pode liberar eventos para o push normal.',
          );
        }
        const entries = await localDb.outbox.bulkGet(
          operation.reservedEventIds,
        );
        if (
          entries.some(
            (entry) =>
              !entry ||
              entry.status !== 'reserved' ||
              entry.bootstrapReservation?.operationId !== operation.id,
          )
        ) {
          throw new Error(
            'Nao foi possivel restaurar integralmente a reserva da outbox.',
          );
        }
        if (entries.length > 0) {
          await localDb.outbox.bulkPut(
            entries.map((entry) => {
              const previousStatus = entry!.bootstrapReservation!.previousStatus;
              const preserved = { ...entry! };
              delete preserved.bootstrapReservation;
              return {
                ...preserved,
                status: previousStatus,
              };
            }),
          );
        }
        await localDb.initialCloudLoads.delete(operation.id);
      },
    );
  },

  async markRemoteConfirmed(operationId, result) {
    validateRemoteResult(result);
    await localDb.transaction(
      'rw',
      localDb.initialCloudLoads,
      async () => {
        const operation = await localDb.initialCloudLoads.get(operationId);
        if (
          !operation ||
          (operation.status !== 'reserved' &&
            operation.status !== 'remote-confirmed')
        ) {
          throw new Error(
            'A reserva local da carga inicial nao esta disponivel para confirmacao.',
          );
        }
        await localDb.initialCloudLoads.update(operationId, {
          status: 'remote-confirmed',
          remoteResult: result,
        });
      },
    );
  },

  async finalizeReservedSnapshot({
    operationId,
    absorbedAt,
    remoteVersion,
  }) {
    validateOptionalRemoteVersion(remoteVersion);
    if (!Number.isFinite(Date.parse(absorbedAt))) {
      throw new Error('O timestamp da absorcao da outbox e invalido.');
    }

    await localDb.transaction(
      'rw',
      localDb.categories,
      localDb.products,
      localDb.outbox,
      localDb.initialCloudLoads,
      async () => {
        const operation = await localDb.initialCloudLoads.get(operationId);
        if (!operation || operation.status !== 'remote-confirmed') {
          throw new Error(
            'A carga remota ainda nao foi confirmada para finalizacao local.',
          );
        }
        const [categories, products, entries] = await Promise.all([
          localDb.categories.bulkGet(operation.categoryIds),
          localDb.products.bulkGet(operation.productIds),
          localDb.outbox.bulkGet(operation.reservedEventIds),
        ]);
        if (
          categories.some(
            (category) =>
              !category || category.businessId !== operation.businessId,
          ) ||
          products.some(
            (product) =>
              !product || product.businessId !== operation.businessId,
          )
        ) {
          throw new Error(
            'Nao foi possivel registrar a baseline local no estabelecimento correto.',
          );
        }
        if (
          entries.some(
            (entry) =>
              !entry ||
              entry.status !== 'reserved' ||
              entry.bootstrapReservation?.operationId !== operation.id,
          )
        ) {
          throw new Error(
            'Os eventos reservados nao estao intactos para absorcao.',
          );
        }

        if (categories.length > 0) {
          await localDb.categories.bulkPut(
            categories.map((category) => ({
              ...category!,
              remoteVersion: maxRemoteVersion(
                category!.remoteVersion,
                remoteVersion,
              ),
            })),
          );
        }
        if (products.length > 0) {
          await localDb.products.bulkPut(
            products.map((product) => ({
              ...product!,
              remoteVersion: maxRemoteVersion(
                product!.remoteVersion,
                remoteVersion,
              ),
            })),
          );
        }
        if (entries.length > 0) {
          await localDb.outbox.bulkPut(
            entries.map((entry) => {
              const preserved = { ...entry! };
              delete preserved.bootstrapReservation;
              return {
                ...preserved,
                status: 'absorbed' as const,
                bootstrapAbsorption: {
                  operationId: operation.id,
                  reason: 'initial-cloud-load-snapshot' as const,
                  absorbedAt,
                },
              };
            }),
          );
        }
        await localDb.initialCloudLoads.update(operation.id, {
          status: 'completed',
        });
      },
    );
  },

  async applyRemoteBaseline({
    businessId,
    categoryIds,
    productIds,
    remoteVersion,
  }) {
    validateBusinessId(businessId);
    validateOptionalRemoteVersion(remoteVersion);
    const uniqueCategoryIds = [...new Set(categoryIds)];
    const uniqueProductIds = [...new Set(productIds)];

    await localDb.transaction(
      'rw',
      localDb.categories,
      localDb.products,
      async () => {
        const [categories, products] = await Promise.all([
          localDb.categories.bulkGet(uniqueCategoryIds),
          localDb.products.bulkGet(uniqueProductIds),
        ]);
        if (
          categories.some(
            (category) => !category || category.businessId !== businessId,
          ) ||
          products.some(
            (product) => !product || product.businessId !== businessId,
          )
        ) {
          throw new Error(
            'Nao foi possivel registrar a baseline local no estabelecimento correto.',
          );
        }
        if (categories.length > 0) {
          await localDb.categories.bulkPut(
            categories.map((category) => ({
              ...category!,
              remoteVersion: maxRemoteVersion(
                category!.remoteVersion,
                remoteVersion,
              ),
            })),
          );
        }
        if (products.length > 0) {
          await localDb.products.bulkPut(
            products.map((product) => ({
              ...product!,
              remoteVersion: maxRemoteVersion(
                product!.remoteVersion,
                remoteVersion,
              ),
            })),
          );
        }
      },
    );
  },
};

async function readSnapshotInCurrentTransaction(
  businessId: string,
): Promise<InitialCloudLoadSnapshot> {
  const [categories, products, movements, outbox] = await Promise.all([
    localDb.categories.where('businessId').equals(businessId).toArray(),
    localDb.products.where('businessId').equals(businessId).toArray(),
    localDb.movements.where('businessId').equals(businessId).toArray(),
    localDb.outbox.toArray(),
  ]);
  return { categories, products, movements, outbox };
}

function maxRemoteVersion(
  current: unknown,
  baseline: number,
): number {
  const currentVersion = getValidatedRemoteVersion(current);
  return currentVersion === undefined
    ? baseline
    : Math.max(currentVersion, baseline);
}

function validateOperation(operation: InitialCloudLoadOperation): void {
  validateUserId(operation.userId);
  validateBusinessId(operation.businessId);
  if (
    !operation.id ||
    operation.status !== 'reserved' ||
    !operation.idempotencyKey ||
    !operation.payloadText ||
    !/^[0-9a-f]{64}$/.test(operation.payloadHash) ||
    !/^[0-9a-f]{64}$/.test(operation.localSignature)
  ) {
    throw new Error('A reserva da carga inicial e invalida.');
  }
}

function validateRemoteResult(result: PersistedInitialCloudLoadResult): void {
  if (
    !Number.isSafeInteger(result.categories) ||
    result.categories < 0 ||
    !Number.isSafeInteger(result.products) ||
    result.products < 0
  ) {
    throw new Error('O resultado remoto da carga inicial e invalido.');
  }
}
