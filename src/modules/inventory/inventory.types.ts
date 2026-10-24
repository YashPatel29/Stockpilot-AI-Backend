import type {
  InventoryBalance,
  InventoryTransaction,
  Product,
  Warehouse,
  StorageLocation,
  User,
} from "@prisma/client";

/**
 * Operation classification for inventory stock movements and adjustments.
 */
export const InventoryTransactionType = {
  RECEIPT: "RECEIPT",
  ISSUE: "ISSUE",
  ADJUSTMENT: "ADJUSTMENT",
  TRANSFER: "TRANSFER",
} as const;

export type InventoryTransactionType =
  (typeof InventoryTransactionType)[keyof typeof InventoryTransactionType];

/**
 * Common pagination metadata envelope.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Sanitized Product summary for inventory responses.
 */
export interface ProductSummaryDto {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  status: string;
}

/**
 * Sanitized Warehouse summary for inventory responses.
 */
export interface WarehouseSummaryDto {
  id: string;
  code: string;
  name: string;
  status: string;
}

/**
 * Sanitized StorageLocation summary for inventory responses.
 */
export interface LocationSummaryDto {
  id: string;
  code: string;
  name: string;
  type: string | null;
  status: string;
}

/**
 * Sanitized User actor summary for inventory transactions.
 */
export interface UserSummaryDto {
  id: string;
  name: string;
  email: string;
}

/**
 * Safe DTO for an inventory balance at a storage location.
 */
export interface SafeInventoryBalanceDto {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  quantityOnHand: string;
  createdAt: string;
  updatedAt: string;
  product?: ProductSummaryDto;
  warehouse?: WarehouseSummaryDto;
  location?: LocationSummaryDto;
}

/**
 * Safe DTO for an append-only inventory ledger transaction.
 */
export interface SafeInventoryTransactionDto {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string | null;
  type: InventoryTransactionType;
  quantity: string;
  quantityDelta: string;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  performedByUserId: string;
  createdAt: string;
  product?: Pick<Product, "id" | "sku" | "name" | "unitOfMeasure">;
  warehouse?: Pick<Warehouse, "id" | "code" | "name"> | null;
  sourceLocation?: Pick<StorageLocation, "id" | "code" | "name"> | null;
  destinationLocation?: Pick<StorageLocation, "id" | "code" | "name"> | null;
  performedByUser?: UserSummaryDto;
}

export interface PaginatedBalancesResult {
  items: SafeInventoryBalanceDto[];
  pagination: PaginationMeta;
}

export interface PaginatedTransactionsResult {
  items: SafeInventoryTransactionDto[];
  pagination: PaginationMeta;
}

export interface MutationResult<T = SafeInventoryBalanceDto> {
  transaction: SafeInventoryTransactionDto;
  balance?: T;
  sourceBalance?: T;
  destinationBalance?: T;
}

/**
 * Maps an InventoryBalance database entity with optional relations to a SafeInventoryBalanceDto.
 */
export function toSafeBalance(
  balance: InventoryBalance & {
    product?: Pick<Product, "id" | "sku" | "name" | "unitOfMeasure" | "status"> | null;
    warehouse?: Pick<Warehouse, "id" | "code" | "name" | "status"> | null;
    location?: Pick<StorageLocation, "id" | "code" | "name" | "type" | "status"> | null;
  },
): SafeInventoryBalanceDto {
  return {
    id: balance.id,
    organizationId: balance.organizationId,
    productId: balance.productId,
    warehouseId: balance.warehouseId,
    locationId: balance.locationId,
    quantityOnHand:
      typeof balance.quantityOnHand === "object" && "toFixed" in balance.quantityOnHand
        ? balance.quantityOnHand.toFixed(4)
        : String(balance.quantityOnHand),
    createdAt: balance.createdAt.toISOString(),
    updatedAt: balance.updatedAt.toISOString(),
    ...(balance.product && {
      product: {
        id: balance.product.id,
        sku: balance.product.sku,
        name: balance.product.name,
        unitOfMeasure: balance.product.unitOfMeasure,
        status: balance.product.status,
      },
    }),
    ...(balance.warehouse && {
      warehouse: {
        id: balance.warehouse.id,
        code: balance.warehouse.code,
        name: balance.warehouse.name,
        status: balance.warehouse.status,
      },
    }),
    ...(balance.location && {
      location: {
        id: balance.location.id,
        code: balance.location.code,
        name: balance.location.name,
        type: balance.location.type,
        status: balance.location.status,
      },
    }),
  };
}

/**
 * Maps an InventoryTransaction database entity with optional relations to a SafeInventoryTransactionDto.
 */
export function toSafeTransaction(
  tx: InventoryTransaction & {
    product?: Pick<Product, "id" | "sku" | "name" | "unitOfMeasure"> | null;
    warehouse?: Pick<Warehouse, "id" | "code" | "name"> | null;
    sourceLocation?: Pick<StorageLocation, "id" | "code" | "name"> | null;
    destinationLocation?: Pick<StorageLocation, "id" | "code" | "name"> | null;
    performedByUser?: Pick<User, "id" | "name" | "email"> | null;
  },
): SafeInventoryTransactionDto {
  return {
    id: tx.id,
    organizationId: tx.organizationId,
    productId: tx.productId,
    warehouseId: tx.warehouseId,
    type: tx.type as InventoryTransactionType,
    quantity:
      typeof tx.quantity === "object" && "toFixed" in tx.quantity
        ? tx.quantity.toFixed(4)
        : String(tx.quantity),
    quantityDelta:
      typeof tx.quantityDelta === "object" && "toFixed" in tx.quantityDelta
        ? tx.quantityDelta.toFixed(4)
        : String(tx.quantityDelta),
    sourceLocationId: tx.sourceLocationId,
    destinationLocationId: tx.destinationLocationId,
    reason: tx.reason,
    reference: tx.reference,
    notes: tx.notes,
    idempotencyKey: tx.idempotencyKey,
    performedByUserId: tx.performedByUserId,
    createdAt: tx.createdAt.toISOString(),
    ...(tx.product && {
      product: {
        id: tx.product.id,
        sku: tx.product.sku,
        name: tx.product.name,
        unitOfMeasure: tx.product.unitOfMeasure,
      },
    }),
    ...(tx.warehouse && {
      warehouse: {
        id: tx.warehouse.id,
        code: tx.warehouse.code,
        name: tx.warehouse.name,
      },
    }),
    ...(tx.sourceLocation && {
      sourceLocation: {
        id: tx.sourceLocation.id,
        code: tx.sourceLocation.code,
        name: tx.sourceLocation.name,
      },
    }),
    ...(tx.destinationLocation && {
      destinationLocation: {
        id: tx.destinationLocation.id,
        code: tx.destinationLocation.code,
        name: tx.destinationLocation.name,
      },
    }),
    ...(tx.performedByUser && {
      performedByUser: {
        id: tx.performedByUser.id,
        name: tx.performedByUser.name,
        email: tx.performedByUser.email,
      },
    }),
  };
}
