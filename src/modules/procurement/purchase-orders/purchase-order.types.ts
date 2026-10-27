import {
  PurchaseOrderStatus,
  Prisma,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderReceipt,
} from "@prisma/client";

export { PurchaseOrderStatus };

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Public DTO for purchase order line items.
 */
export interface SafePurchaseOrderItemDto {
  id: string;
  productId: string;
  productSku?: string;
  productName?: string;
  quantityOrdered: string;
  quantityReceived: string;
  quantityOutstanding: string;
  unitCost: string;
  lineTotal: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public DTO for delivery receipts.
 */
export interface SafePurchaseOrderReceiptDto {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  locationId: string;
  locationCode?: string;
  locationName?: string;
  reference: string | null;
  notes: string | null;
  receivedByUserId: string;
  receivedByUserName?: string;
  createdAt: string;
}

/**
 * Public DTO for purchase orders.
 */
export interface SafePurchaseOrderDto {
  id: string;
  organizationId: string;
  supplierId: string;
  supplierName?: string;
  supplierCode?: string | null;
  orderNumber: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate: string | null;
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  createdByUserId: string;
  createdByUserEmail?: string;
  approvedByUserId: string | null;
  approvedByUserEmail?: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SafePurchaseOrderItemDto[];
  receipts?: SafePurchaseOrderReceiptDto[];
}

/**
 * Paginated query result for purchase orders.
 */
export interface PaginatedPurchaseOrdersResult {
  items: SafePurchaseOrderDto[];
  pagination: PaginationMeta;
}

export type PurchaseOrderItemWithProduct = PurchaseOrderItem & {
  product?: {
    id: string;
    sku: string;
    name: string;
  };
};

export type PurchaseOrderReceiptWithDetails = PurchaseOrderReceipt & {
  location?: {
    id: string;
    code: string;
    name: string;
  };
  receivedByUser?: {
    id: string;
    email: string;
    name: string;
  };
};

export type PurchaseOrderWithDetails = PurchaseOrder & {
  supplier?: {
    id: string;
    name: string;
    code: string | null;
  };
  createdByUser?: {
    id: string;
    email: string;
    name: string;
  };
  approvedByUser?: {
    id: string;
    email: string;
    name: string;
  } | null;
  items?: PurchaseOrderItemWithProduct[];
  receipts?: PurchaseOrderReceiptWithDetails[];
};

/**
 * Transforms a raw PurchaseOrderItem entity into a sanitized SafePurchaseOrderItemDto.
 */
export function toSafePurchaseOrderItem(
  item: PurchaseOrderItemWithProduct,
): SafePurchaseOrderItemDto {
  const ordered = new Prisma.Decimal(item.quantityOrdered);
  const received = new Prisma.Decimal(item.quantityReceived);
  const outstanding = ordered.sub(received);
  const safeOutstanding = outstanding.isNegative() ? new Prisma.Decimal(0) : outstanding;

  return {
    id: item.id,
    productId: item.productId,
    ...(item.product && {
      productSku: item.product.sku,
      productName: item.product.name,
    }),
    quantityOrdered: ordered.toFixed(4),
    quantityReceived: received.toFixed(4),
    quantityOutstanding: safeOutstanding.toFixed(4),
    unitCost: new Prisma.Decimal(item.unitCost).toFixed(4),
    lineTotal: new Prisma.Decimal(item.lineTotal).toFixed(4),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * Transforms a raw PurchaseOrderReceipt entity into a sanitized SafePurchaseOrderReceiptDto.
 */
export function toSafePurchaseOrderReceipt(
  receipt: PurchaseOrderReceiptWithDetails,
): SafePurchaseOrderReceiptDto {
  return {
    id: receipt.id,
    organizationId: receipt.organizationId,
    purchaseOrderId: receipt.purchaseOrderId,
    locationId: receipt.locationId,
    ...(receipt.location && {
      locationCode: receipt.location.code,
      locationName: receipt.location.name,
    }),
    reference: receipt.reference,
    notes: receipt.notes,
    receivedByUserId: receipt.receivedByUserId,
    ...(receipt.receivedByUser && {
      receivedByUserName: receipt.receivedByUser.name,
    }),
    createdAt: receipt.createdAt.toISOString(),
  };
}

/**
 * Transforms a raw PurchaseOrder entity into a sanitized SafePurchaseOrderDto.
 */
export function toSafePurchaseOrder(po: PurchaseOrderWithDetails): SafePurchaseOrderDto {
  return {
    id: po.id,
    organizationId: po.organizationId,
    supplierId: po.supplierId,
    ...(po.supplier && {
      supplierName: po.supplier.name,
      supplierCode: po.supplier.code,
    }),
    orderNumber: po.orderNumber,
    status: po.status,
    orderDate: po.orderDate.toISOString(),
    expectedDeliveryDate: po.expectedDeliveryDate ? po.expectedDeliveryDate.toISOString() : null,
    currency: po.currency,
    subtotal: new Prisma.Decimal(po.subtotal).toFixed(4),
    taxAmount: new Prisma.Decimal(po.taxAmount).toFixed(4),
    totalAmount: new Prisma.Decimal(po.totalAmount).toFixed(4),
    notes: po.notes,
    createdByUserId: po.createdByUserId,
    ...(po.createdByUser && {
      createdByUserEmail: po.createdByUser.email,
    }),
    approvedByUserId: po.approvedByUserId,
    ...(po.approvedByUser && {
      approvedByUserEmail: po.approvedByUser.email,
    }),
    approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
    cancelledAt: po.cancelledAt ? po.cancelledAt.toISOString() : null,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    ...(po.items && {
      items: po.items.map(toSafePurchaseOrderItem),
    }),
    ...(po.receipts && {
      receipts: po.receipts.map(toSafePurchaseOrderReceipt),
    }),
  };
}
