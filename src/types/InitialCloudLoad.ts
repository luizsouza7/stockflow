export type InitialCloudLoadOperationStatus =
  | 'reserved'
  | 'remote-confirmed'
  | 'completed';

export interface PersistedInitialCloudLoadResult {
  categories: number;
  products: number;
  wasDuplicate: boolean;
}

export interface InitialCloudLoadOperation {
  id: string;
  userId: string;
  businessId: string;
  businessName: string;
  status: InitialCloudLoadOperationStatus;
  idempotencyKey: string;
  payloadText: string;
  payloadHash: string;
  localSignature: string;
  categoryIds: string[];
  productIds: string[];
  movementIds: string[];
  reservedEventIds: string[];
  createdAt: string;
  remoteResult?: PersistedInitialCloudLoadResult;
}
