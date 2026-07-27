export type RemoteInventoryEntityType = 'category' | 'product' | 'movement';

export interface RemoteInventoryCursor {
  version: 1;
  businessId: string;
  watermark: string;
  after: {
    sortTime: string;
    entityRank: 1 | 2 | 3;
    entityId: string;
  };
}

export interface RemoteCategoryPayload {
  id: string;
  businessId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RemoteProductPayload {
  id: string;
  businessId: string;
  name: string;
  code: string;
  categoryId: string | null;
  salePriceInCents: number;
  currentQuantity: number;
  minimumStock: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RemoteMovementPayload {
  id: string;
  businessId: string;
  productId: string;
  type: 'entrada' | 'saida';
  quantity: number;
  note: string;
  movementDate: string;
  previousQuantity: number | null;
  resultingQuantity: number | null;
  isLegacy: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface RemoteInventoryPageItemBase {
  entityId: string;
  businessId: string;
  version: number;
  sortTime: string;
  deletedAt: string | null;
}

export type RemoteInventoryPageItem =
  | (RemoteInventoryPageItemBase & {
      entityType: 'category';
      data: RemoteCategoryPayload;
    })
  | (RemoteInventoryPageItemBase & {
      entityType: 'product';
      data: RemoteProductPayload;
    })
  | (RemoteInventoryPageItemBase & {
      entityType: 'movement';
      data: RemoteMovementPayload;
    });

export interface RemoteInventoryPage {
  items: RemoteInventoryPageItem[];
  nextCursor: RemoteInventoryCursor | null;
  hasMore: boolean;
  watermark: string;
  pageSize: number;
  returnedCount: number;
}
