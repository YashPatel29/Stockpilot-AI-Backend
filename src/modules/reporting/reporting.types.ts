import type {
  InventoryTransactionType,
  PurchaseOrderStatus,
  ProductStatus,
  WarehouseStatus,
} from "@prisma/client";

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface UnitOfMeasureQuantity {
  unitOfMeasure: string;
  totalQuantityOnHand: string;
}

export interface RecentTransactionItem {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasure: string;
  type: InventoryTransactionType;
  quantity: string;
  quantityDelta: string;
  warehouseId: string | null;
  warehouseName: string | null;
  sourceLocationId: string | null;
  sourceLocationCode: string | null;
  destinationLocationId: string | null;
  destinationLocationCode: string | null;
  reference: string | null;
  notes: string | null;
  performedByUserId: string;
  performedByUserName: string;
  createdAt: string;
}

export interface InventoryDashboardDto {
  overview: {
    totalActiveProducts: number;
    totalActiveWarehouses: number;
    totalActiveStorageLocations: number;
    positiveStockBalancesCount: number;
    zeroStockBalancesCount: number;
    unitsOnHand: UnitOfMeasureQuantity[];
  };
  movementsWindow: {
    startDate: string;
    endDate: string;
    totalTransactions: number;
    countsByType: Record<InventoryTransactionType, number>;
    quantitiesByTypeAndUom: Array<{
      type: InventoryTransactionType;
      unitOfMeasure: string;
      totalQuantity: string;
    }>;
  };
  purchaseOrdersSummary: {
    totalOrdersCount: number;
    countsByStatus: Record<PurchaseOrderStatus, number>;
    totalCommittedValue: string;
    totalDraftValue: string;
    totalCancelledValue: string;
    pendingApprovalCount: number;
  };
  recentTransactions: RecentTransactionItem[];
}

export interface WarehouseInventorySummaryItem {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  status: WarehouseStatus;
  locationCount: number;
  positiveStockLocationsCount: number;
  distinctProductsCount: number;
  stockByUom: UnitOfMeasureQuantity[];
}

export interface WarehouseInventoryReportDto {
  warehouses: WarehouseInventorySummaryItem[];
}

export interface InventoryMovementsReportDto {
  summary: {
    totalTransactions: number;
    countsByType: Record<InventoryTransactionType, number>;
    quantitiesByTypeAndUom: Array<{
      type: InventoryTransactionType;
      unitOfMeasure: string;
      totalQuantity: string;
    }>;
  };
  items: RecentTransactionItem[];
  pagination: PaginationMeta;
}

export interface ProductInventoryLocationItem {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  quantityOnHand: string;
}

export interface ProductInventoryReportItem {
  productId: string;
  sku: string;
  name: string;
  categoryName: string | null;
  unitOfMeasure: string;
  costPrice: string;
  sellingPrice: string;
  status: ProductStatus;
  totalQuantityOnHand: string;
  locationCount: number;
  locations: ProductInventoryLocationItem[];
}

export interface ProductInventoryReportDto {
  items: ProductInventoryReportItem[];
  pagination: PaginationMeta;
}

export interface LowStockReportItem {
  productId: string;
  sku: string;
  name: string;
  categoryName: string | null;
  unitOfMeasure: string;
  lowStockThreshold: number;
  totalQuantityOnHand: string;
  deficit: string;
  status: ProductStatus;
  locationsCount: number;
}

export interface LowStockReportDto {
  summary: {
    lowStockProductsCount: number;
  };
  items: LowStockReportItem[];
  pagination: PaginationMeta;
}

export interface PurchaseOrderReportItem {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  createdByUserEmail: string;
  approvedByUserEmail: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  lineItemsCount: number;
  totalOrderedQuantity: string;
  totalReceivedQuantity: string;
  totalOutstandingQuantity: string;
}

export interface PurchaseOrderReportDto {
  summary: {
    totalOrdersCount: number;
    countsByStatus: Record<PurchaseOrderStatus, number>;
    totalCommittedValue: string;
    totalDraftValue: string;
    totalCancelledValue: string;
    pendingApprovalCount: number;
    receivedOrdersCount: number;
    partiallyReceivedOrdersCount: number;
    outstandingLinesCount: number;
    totalQuantityOrdered: string;
    totalQuantityReceived: string;
    totalQuantityOutstanding: string;
  };
  items: PurchaseOrderReportItem[];
  pagination: PaginationMeta;
}

export interface RecentActivityReportDto {
  items: RecentTransactionItem[];
  limit: number;
}
