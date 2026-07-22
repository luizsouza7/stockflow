export type SyncStatus = 'pending' | 'synced' | 'error';

export interface Product {
  id: string;
  businessId?: string;
  name: string;
  code: string;
  categoryId?: string;
  salePriceInCents: number;
  currentQuantity: number;
  minimumStock: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus: SyncStatus;
}

export type CreateProductInput = Omit<Product, 'id' | 'businessId'>;

export type UpdateProductInput = Partial<
  Pick<Product, 'name' | 'code' | 'categoryId' | 'salePriceInCents' | 'minimumStock'>
>;

export interface ProductFormData
  extends Pick<Product, 'name' | 'code' | 'currentQuantity' | 'minimumStock'> {
  categoryId: string;
  salePrice: string;
}

export interface ProductWithCategory extends Product {
  categoryName: string;
}
