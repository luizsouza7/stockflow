import type { InitialCloudLoadSnapshot } from '../repositories/initialCloudLoadRepository';
import type { OutboxEntry } from '../types/Sync';

export function getSnapshotRelatedOutbox(
  snapshot: InitialCloudLoadSnapshot,
  businessId: string,
): OutboxEntry[] {
  const relatedKeys = new Set([
    ...snapshot.categories.map(({ id }) => `category:${id}`),
    ...snapshot.products.map(({ id }) => `product:${id}`),
    ...snapshot.movements.map(({ id }) => `movement:${id}`),
  ]);

  return snapshot.outbox.filter(
    (entry) =>
      relatedKeys.has(`${entry.entityType}:${entry.entityId}`) ||
      entry.businessId === businessId,
  );
}

export function buildInitialCloudLoadStateText(
  snapshot: InitialCloudLoadSnapshot,
  businessId: string,
): string {
  return stableStringify({
    categories: [...snapshot.categories].sort(compareId),
    products: [...snapshot.products].sort(compareId),
    movements: [...snapshot.movements].sort(compareId),
    outbox: getSnapshotRelatedOutbox(snapshot, businessId).sort(compareId),
  });
}

function compareId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
