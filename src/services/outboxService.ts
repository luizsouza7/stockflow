import { outboxRepository } from '../repositories/outboxRepository';
import type {
  OutboxEntry,
  OutboxPayload,
  SyncEntityType,
  SyncOperation,
  SyncStatusSummary,
} from '../types/Sync';
import { generateUuid } from '../utils/id';
import { validateOptionalBusinessId } from '../domain/businessScope';
import {
  assertEntityInMutationContext,
  validateMutationContext,
  type LocalMutationContext,
} from '../domain/businessScope';

interface CreateOutboxEntryInput {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: OutboxPayload;
  occurredAt: string;
  context?: LocalMutationContext;
}

export const outboxService = {
  async enqueue(input: CreateOutboxEntryInput): Promise<string> {
    return outboxRepository.add(createOutboxEntry(input));
  },

  async getStatusSummary(): Promise<SyncStatusSummary> {
    const [pending, processing, error, conflict, reserved, absorbed] = await Promise.all([
      outboxRepository.countByStatus('pending'),
      outboxRepository.countByStatus('processing'),
      outboxRepository.countByStatus('error'),
      outboxRepository.countByStatus('conflict'),
      outboxRepository.countByStatus('reserved'),
      outboxRepository.countByStatus('absorbed'),
    ]);

    return {
      pending,
      processing,
      error,
      conflict,
      reserved,
      absorbed,
      totalAwaitingAction: pending + processing + error + conflict + reserved,
    };
  },

  async getStatusSummaryForScope(
    context: LocalMutationContext,
  ): Promise<SyncStatusSummary> {
    validateMutationContext(context);
    const [pending, processing, error, conflict, reserved, absorbed] = await Promise.all([
      outboxRepository.countByStatusForScope('pending', context),
      outboxRepository.countByStatusForScope('processing', context),
      outboxRepository.countByStatusForScope('error', context),
      outboxRepository.countByStatusForScope('conflict', context),
      outboxRepository.countByStatusForScope('reserved', context),
      outboxRepository.countByStatusForScope('absorbed', context),
    ]);
    return {
      pending,
      processing,
      error,
      conflict,
      reserved,
      absorbed,
      totalAwaitingAction: pending + processing + error + conflict + reserved,
    };
  },
};

export function createOutboxEntry(input: CreateOutboxEntryInput): OutboxEntry {
  const id = generateUuid();
  validateOptionalBusinessId(input.payload.businessId);
  if (input.context) {
    validateMutationContext(input.context);
    assertEntityInMutationContext(
      input.payload,
      input.context,
      'A outbox nao pode receber uma entidade de outro escopo.',
    );
  }

  return {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    ...(input.payload.businessId ? { businessId: input.payload.businessId } : {}),
    ...(input.context?.kind === 'business' ? { userId: input.context.userId } : {}),
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
