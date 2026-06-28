import type { SyncStatus } from './Product';

export type MovementType = 'entrada' | 'saida';

export interface Movement {
  id?: number;
  productId: number;
  type: MovementType;
  quantity: number;
  note: string;
  date: string;
  syncStatus: SyncStatus;
}

export interface MovementWithProduct extends Movement {
  productName: string;
  productCode: string;
}
