import type { Category } from './Category';
import type { Movement } from './Movement';
import type { Product } from './Product';

export type SyncEntityType = 'category' | 'product' | 'movement';

export type SyncOperation =
  | 'category.created'
  | 'category.updated'
  | 'category.deleted'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'movement.created';

export type OutboxStatus = 'pending' | 'processing' | 'synced' | 'error' | 'conflict';

export type OutboxPayload = Category | Product | Movement;

export interface OutboxEntry {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: OutboxPayload;
  status: OutboxStatus;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt?: string;
  userId?: string;
  businessId?: string;
  idempotencyKey: string;
  remoteVersion?: number;
}

export interface SyncStatusSummary {
  pending: number;
  processing: number;
  error: number;
  conflict: number;
  totalAwaitingAction: number;
}
