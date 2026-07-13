export type SyncStatus = 'pending' | 'synced' | 'error';

export interface Product {
  id?: number;
  name: string;
  code: string;
  category: string;
  salePriceInCents: number;
  currentQuantity: number;
  minimumStock: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus: SyncStatus;
}

export interface ProductFormData
  extends Pick<Product, 'name' | 'code' | 'category' | 'currentQuantity' | 'minimumStock'> {
  salePrice: string;
}
