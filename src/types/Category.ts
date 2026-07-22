import type { SyncStatus } from './Product';

export interface Category {
  id: string;
  businessId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus: SyncStatus;
}
