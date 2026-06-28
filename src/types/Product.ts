export type SyncStatus = 'pending' | 'synced' | 'error';

export interface Product {
  id?: number;
  name: string;
  code: string;
  category: string;
  price: number;
  currentQuantity: number;
  minimumStock: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export type ProductFormData = Pick<
  Product,
  'name' | 'code' | 'category' | 'price' | 'currentQuantity' | 'minimumStock'
>;
