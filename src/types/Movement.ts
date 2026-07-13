import type { SyncStatus } from './Product';

export type MovementType = 'entrada' | 'saida';

interface MovementBase {
  id?: number;
  productId: number;
  type: MovementType;
  quantity: number;
  note: string;
  date: string;
  syncStatus: SyncStatus;
}

export interface TrackedMovement extends MovementBase {
  isLegacy?: false;
  previousQuantity: number;
  resultingQuantity: number;
}

export interface LegacyMovement extends MovementBase {
  isLegacy: true;
  previousQuantity?: never;
  resultingQuantity?: never;
}

export type Movement = TrackedMovement | LegacyMovement;

export type RegisterMovementInput = Omit<
  MovementBase,
  'id'
>;

export type MovementWithProduct = Movement & {
  productName: string;
  productCode: string;
};
