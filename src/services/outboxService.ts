import { outboxRepository } from '../repositories/outboxRepository';
import type {
  OutboxEntry,
  OutboxPayload,
  SyncEntityType,
  SyncOperation,
  SyncStatusSummary,
} from '../types/Sync';
import { generateUuid } from '../utils/id';

interface CreateOutboxEntryInput {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: OutboxPayload;
  occurredAt: string;
}

export const outboxService = {
  async enqueue(input: CreateOutboxEntryInput): Promise<string> {
    return outboxRepository.add(createOutboxEntry(input));
  },

  async getStatusSummary(): Promise<SyncStatusSummary> {
    const [pending, processing, error, conflict] = await Promise.all([
      outboxRepository.countByStatus('pending'),
      outboxRepository.countByStatus('processing'),
      outboxRepository.countByStatus('error'),
      outboxRepository.countByStatus('conflict'),
    ]);

    return {
      pending,
      processing,
      error,
      conflict,
      totalAwaitingAction: pending + processing + error + conflict,
    };
  },
};

export function createOutboxEntry(input: CreateOutboxEntryInput): OutboxEntry {
  const id = generateUuid();

  return {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    status: 'pending',
    attemptCount: 0,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    idempotencyKey: [
      input.entityType,
      input.entityId,
      input.operation,
      input.occurredAt,
    ].join(':'),
  };
}
