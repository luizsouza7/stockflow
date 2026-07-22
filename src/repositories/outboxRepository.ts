import { localDb } from '../services/db/localDb';
import type { OutboxEntry, OutboxStatus } from '../types/Sync';

interface ClaimEligibleInput {
  now: string;
  batchSize: number;
  canClaim?: (entry: OutboxEntry) => boolean;
}

interface MarkProcessingFailureInput {
  id: string;
  claimedAt: string;
  attemptCount: number;
  lastError: string;
  nextAttemptAt: string;
  failedAt: string;
}

interface ResetStaleProcessingInput {
  olderThan: string;
  resetAt: string;
  lastError: string;
}

interface MarkClaimedSyncedInput {
  id: string;
  claimedAt: string;
  completedAt: string;
  remoteVersion: number;
}

interface BindEligibleForContextInput {
  userId: string;
  businessId: string;
  boundAt: string;
}

function compareByCreatedAtAndId(left: OutboxEntry, right: OutboxEntry): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
}

function isEligible(entry: OutboxEntry, nowTimestamp: number): boolean {
  if (entry.status === 'pending') return true;
  if (entry.status !== 'error' || !entry.nextAttemptAt) return false;

  const nextAttemptTimestamp = Date.parse(entry.nextAttemptAt);
  return Number.isFinite(nextAttemptTimestamp) && nextAttemptTimestamp <= nowTimestamp;
}

export const outboxRepository = {
  async add(entry: OutboxEntry): Promise<string> {
    return localDb.outbox.add(entry);
  },

  async findAll(): Promise<OutboxEntry[]> {
    return localDb.outbox.orderBy('createdAt').toArray();
  },

  async countByStatus(status: OutboxStatus): Promise<number> {
    return localDb.outbox.where('status').equals(status).count();
  },

  async claimEligible({ now, batchSize, canClaim }: ClaimEligibleInput): Promise<OutboxEntry[]> {
    const nowTimestamp = Date.parse(now);

    return localDb.transaction('rw', localDb.outbox, async () => {
      const candidates = await localDb.outbox
        .where('status')
        .anyOf('pending', 'error')
        .toArray();
      const eligible = candidates
        .filter((entry) => isEligible(entry, nowTimestamp))
        .filter((entry) => canClaim?.(entry) ?? true)
        .sort(compareByCreatedAtAndId)
        .slice(0, batchSize)
        .map((entry) => ({ ...entry, status: 'processing' as const, updatedAt: now }));

      if (eligible.length > 0) {
        await localDb.outbox.bulkPut(eligible);
      }

      return eligible;
    });
  },

  async removeClaimed(id: string, claimedAt: string): Promise<boolean> {
    return localDb.transaction('rw', localDb.outbox, async () => {
      const entry = await localDb.outbox.get(id);

      if (!entry || entry.status !== 'processing' || entry.updatedAt !== claimedAt) {
        return false;
      }

      await localDb.outbox.delete(id);
      return true;
    });
  },

  async markClaimedSynced(input: MarkClaimedSyncedInput): Promise<boolean> {
    return localDb.transaction('rw', localDb.outbox, async () => {
      const entry = await localDb.outbox.get(input.id);

      if (!entry || entry.status !== 'processing' || entry.updatedAt !== input.claimedAt) {
        return false;
      }

      await localDb.outbox.update(input.id, {
        status: 'synced',
        remoteVersion: input.remoteVersion,
        updatedAt: input.completedAt,
        lastError: undefined,
        nextAttemptAt: undefined,
      });
      return true;
    });
  },

  async markProcessingFailure(input: MarkProcessingFailureInput): Promise<boolean> {
    return localDb.transaction('rw', localDb.outbox, async () => {
      const entry = await localDb.outbox.get(input.id);

      if (
        !entry ||
        entry.status !== 'processing' ||
        entry.updatedAt !== input.claimedAt
      ) {
        return false;
      }

      await localDb.outbox.update(input.id, {
        status: 'error',
        attemptCount: input.attemptCount,
        lastError: input.lastError,
        nextAttemptAt: input.nextAttemptAt,
        updatedAt: input.failedAt,
      });
      return true;
    });
  },

  async resetStaleProcessing(input: ResetStaleProcessingInput): Promise<number> {
    const olderThanTimestamp = Date.parse(input.olderThan);

    return localDb.transaction('rw', localDb.outbox, async () => {
      const staleEntries = (await localDb.outbox.where('status').equals('processing').toArray())
        .filter((entry) => {
          const updatedAtTimestamp = Date.parse(entry.updatedAt);
          return Number.isFinite(updatedAtTimestamp) && updatedAtTimestamp < olderThanTimestamp;
        })
        .map((entry) => ({
          ...entry,
          status: 'pending' as const,
          updatedAt: input.resetAt,
          lastError: input.lastError,
          nextAttemptAt: undefined,
        }));

      if (staleEntries.length > 0) {
        await localDb.outbox.bulkPut(staleEntries);
      }

      return staleEntries.length;
    });
  },

  async findLatestSyncedVersion(
    entityType: OutboxEntry['entityType'],
    entityId: string,
    userId: string,
    businessId: string,
  ): Promise<number | undefined> {
    const entries = await localDb.outbox
      .where('[entityType+entityId]')
      .equals([entityType, entityId])
      .toArray();
    const versions = entries
      .filter(
        (entry) =>
          entry.status === 'synced' &&
          entry.userId === userId &&
          entry.businessId === businessId &&
          Number.isSafeInteger(entry.remoteVersion) &&
          Number(entry.remoteVersion) > 0,
      )
      .map((entry) => Number(entry.remoteVersion));

    return versions.length > 0 ? Math.max(...versions) : undefined;
  },

  async bindEligibleForContext(input: BindEligibleForContextInput): Promise<number> {
    return localDb.transaction('rw', localDb.outbox, async () => {
      const entries = (await localDb.outbox.toArray())
        .filter(
          (entry) =>
            (entry.status === 'pending' || entry.status === 'error') &&
            !entry.userId &&
            (!entry.businessId || entry.businessId === input.businessId),
        )
        .map((entry) => ({
          ...entry,
          userId: input.userId,
          businessId: entry.businessId ?? input.businessId,
          status: 'pending' as const,
          updatedAt: input.boundAt,
          lastError: undefined,
          nextAttemptAt: undefined,
        }));

      if (entries.length > 0) {
        await localDb.outbox.bulkPut(entries);
      }

      return entries.length;
    });
  },

  async countUnscoped(): Promise<number> {
    return localDb.outbox
      .filter(
        (entry) =>
          (entry.status === 'pending' || entry.status === 'error') &&
          !entry.userId &&
          !entry.businessId,
      )
      .count();
  },

  async countEligibleForBinding(businessId: string): Promise<number> {
    return localDb.outbox
      .filter(
        (entry) =>
          (entry.status === 'pending' || entry.status === 'error') &&
          !entry.userId &&
          (!entry.businessId || entry.businessId === businessId),
      )
      .count();
  },

  async countForContext(userId: string, businessId: string): Promise<number> {
    return localDb.outbox
      .filter(
        (entry) =>
          (entry.status === 'pending' || entry.status === 'error') &&
          entry.userId === userId &&
          entry.businessId === businessId,
      )
      .count();
  },
};
