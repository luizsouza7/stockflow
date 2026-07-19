import { outboxService } from '../outboxService';
import { outboxRepository } from '../../repositories/outboxRepository';
import type { OutboxEntry } from '../../types/Sync';

export const DEFAULT_OUTBOX_BATCH_SIZE = 25;
export const MAX_OUTBOX_BATCH_SIZE = 100;
export const MAX_OUTBOX_BACKOFF_MS = 60 * 60 * 1000;
const BACKOFF_DELAYS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  MAX_OUTBOX_BACKOFF_MS,
] as const;
const MAX_STORED_ERROR_LENGTH = 240;
const STALE_PROCESSING_ERROR =
  'Processamento local interrompido; evento recolocado na fila.';
const SENSITIVE_ERROR =
  'Falha no executor local; detalhes sensiveis foram omitidos.';
const UNKNOWN_ERROR = 'Falha desconhecida no executor local.';

export type OutboxExecutor = (entry: Readonly<OutboxEntry>) => Promise<void>;

interface ProcessOutboxBatchInput {
  executor: OutboxExecutor;
  now?: () => Date;
  batchSize?: number;
}

export interface ProcessOutboxBatchResult {
  claimed: number;
  succeeded: number;
  failed: number;
}

interface ResetStaleProcessingInput {
  olderThan: Date;
  now?: () => Date;
}

export async function getLocalSyncPreparationStatus() {
  return outboxService.getStatusSummary();
}

export async function processOutboxBatch({
  executor,
  now = () => new Date(),
  batchSize = DEFAULT_OUTBOX_BATCH_SIZE,
}: ProcessOutboxBatchInput): Promise<ProcessOutboxBatchResult> {
  validateBatchSize(batchSize);
  const claimedAt = toValidIsoString(now());
  const entries = await outboxRepository.claimEligible({ now: claimedAt, batchSize });
  let succeeded = 0;
  let failed = 0;

  for (const entry of entries) {
    const claimToken = entry.updatedAt;

    try {
      await executor(entry);
      if (await outboxRepository.removeClaimed(entry.id, claimToken)) {
        succeeded += 1;
      }
    } catch (error) {
      const failedAtDate = now();
      const failedAt = toValidIsoString(failedAtDate);
      const attemptCount = incrementAttemptCount(entry.attemptCount);
      const nextAttemptAt = calculateNextAttemptAt(attemptCount, failedAtDate);
      const failureRecorded = await outboxRepository.markProcessingFailure({
        id: entry.id,
        claimedAt: claimToken,
        attemptCount,
        lastError: sanitizeOutboxError(error),
        nextAttemptAt,
        failedAt,
      });

      if (failureRecorded) {
        failed += 1;
      }
    }
  }

  return { claimed: entries.length, succeeded, failed };
}

export async function resetStaleProcessing({
  olderThan,
  now = () => new Date(),
}: ResetStaleProcessingInput): Promise<number> {
  return outboxRepository.resetStaleProcessing({
    olderThan: toValidIsoString(olderThan),
    resetAt: toValidIsoString(now()),
    lastError: STALE_PROCESSING_ERROR,
  });
}

export function calculateNextAttemptAt(failedAttemptCount: number, now: Date): string {
  const nowTimestamp = now.getTime();

  if (!Number.isFinite(nowTimestamp)) {
    throw new Error('O relogio informado para o retry e invalido.');
  }

  const normalizedAttemptCount = normalizeAttemptCount(failedAttemptCount);
  const delayIndex = Math.max(0, Math.min(normalizedAttemptCount - 1, BACKOFF_DELAYS_MS.length - 1));
  const nextAttemptTimestamp = nowTimestamp + BACKOFF_DELAYS_MS[delayIndex];
  const nextAttempt = new Date(nextAttemptTimestamp);

  if (!Number.isFinite(nextAttempt.getTime())) {
    throw new Error('Nao foi possivel calcular uma data valida para o retry.');
  }

  return nextAttempt.toISOString();
}

export function sanitizeOutboxError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const firstLine = rawMessage.split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() ?? '';

  if (!firstLine) return UNKNOWN_ERROR;
  if (
    /password|senha|token|authorization|bearer|service[_-]?role|sb_secret_|eyJ[a-zA-Z0-9_-]*\./i.test(
      firstLine,
    )
  ) {
    return SENSITIVE_ERROR;
  }

  return firstLine.length <= MAX_STORED_ERROR_LENGTH
    ? firstLine
    : `${firstLine.slice(0, MAX_STORED_ERROR_LENGTH - 1)}…`;
}

function incrementAttemptCount(currentAttemptCount: number): number {
  const normalizedAttemptCount = normalizeAttemptCount(currentAttemptCount);
  return Math.min(normalizedAttemptCount + 1, Number.MAX_SAFE_INTEGER);
}

function normalizeAttemptCount(attemptCount: number): number {
  return Number.isSafeInteger(attemptCount) && attemptCount >= 0 ? attemptCount : 0;
}

function validateBatchSize(batchSize: number): void {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_OUTBOX_BATCH_SIZE) {
    throw new Error(`batchSize deve ser um inteiro entre 1 e ${MAX_OUTBOX_BATCH_SIZE}.`);
  }
}

function toValidIsoString(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new Error('O relogio informado para a outbox e invalido.');
  }

  return date.toISOString();
}
