import type { AuditLog, User } from "@prisma/client";

/**
 * Standardized domain audit actions.
 */
export const AuditAction = {
  AUTH_REGISTERED: "auth.registered",
  AUTH_LOGIN: "auth.login",
  ORG_CREATED: "organization.created",
  ORG_UPDATED: "organization.updated",
  ORG_DEACTIVATED: "organization.deactivated",
  INVITATION_CREATED: "invitation.created",
  INVITATION_ACCEPTED: "invitation.accepted",
  INVITATION_REVOKED: "invitation.revoked",
  MEMBERSHIP_ROLE_UPDATED: "membership.role_updated",
  MEMBERSHIP_REMOVED: "membership.removed",
  CATEGORY_CREATED: "category.created",
  CATEGORY_UPDATED: "category.updated",
  PRODUCT_CREATED: "product.created",
  PRODUCT_UPDATED: "product.updated",
  PRODUCT_ARCHIVED: "product.archived",
  PRODUCT_REACTIVATED: "product.reactivated",
  WAREHOUSE_CREATED: "warehouse.created",
  WAREHOUSE_UPDATED: "warehouse.updated",
  WAREHOUSE_DEACTIVATED: "warehouse.deactivated",
  LOCATION_CREATED: "location.created",
  LOCATION_UPDATED: "location.updated",
  LOCATION_DEACTIVATED: "location.deactivated",
  INVENTORY_RECEIVED: "inventory.received",
  INVENTORY_ISSUED: "inventory.issued",
  INVENTORY_ADJUSTED: "inventory.adjusted",
  INVENTORY_TRANSFERRED: "inventory.transferred",
  SUPPLIER_CREATED: "supplier.created",
  SUPPLIER_UPDATED: "supplier.updated",
  SUPPLIER_DEACTIVATED: "supplier.deactivated",
  PURCHASE_ORDER_CREATED: "purchase_order.created",
  PURCHASE_ORDER_SUBMITTED: "purchase_order.submitted",
  PURCHASE_ORDER_APPROVED: "purchase_order.approved",
  PURCHASE_ORDER_CANCELLED: "purchase_order.cancelled",
  PURCHASE_ORDER_RECEIVED: "purchase_order.received",
  DEMAND_FORECAST_GENERATED: "demand_forecast.generated",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction] | string;

/**
 * Common resource types tracked by the audit system.
 */
export const AuditResourceType = {
  USER: "User",
  ORGANIZATION: "Organization",
  ORGANIZATION_INVITATION: "OrganizationInvitation",
  ORGANIZATION_MEMBERSHIP: "OrganizationMembership",
  PRODUCT_CATEGORY: "ProductCategory",
  PRODUCT: "Product",
  WAREHOUSE: "Warehouse",
  STORAGE_LOCATION: "StorageLocation",
  INVENTORY_BALANCE: "InventoryBalance",
  INVENTORY_TRANSACTION: "InventoryTransaction",
  SUPPLIER: "Supplier",
  PURCHASE_ORDER: "PurchaseOrder",
  PURCHASE_ORDER_RECEIPT: "PurchaseOrderReceipt",
  DEMAND_FORECAST_RUN: "DemandForecastRun",
} as const;

export type AuditResourceTypeKey =
  (typeof AuditResourceType)[keyof typeof AuditResourceType] | string;

/**
 * Actor summary attached to audit records.
 */
export interface AuditActorDto {
  id: string;
  name: string;
  email: string;
}

/**
 * Safe external DTO representing an immutable audit log record.
 */
export interface SafeAuditLogDto {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actor?: AuditActorDto | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/**
 * Paginated audit logs query result.
 */
export interface PaginatedAuditLogsResult {
  auditLogs: SafeAuditLogDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Internal input parameters for recording an audit entry.
 */
export interface CreateAuditLogParams {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: AuditActionType;
  resourceType: AuditResourceTypeKey;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Audit log with optional actor relation.
 */
export type AuditLogWithActor = AuditLog & {
  actorUser?: Pick<User, "id" | "name" | "email"> | null;
};

/**
 * Serializes a database audit log model into a safe consumer-facing DTO.
 */
export function toSafeAuditLog(log: AuditLogWithActor): SafeAuditLogDto {
  return {
    id: log.id,
    organizationId: log.organizationId,
    actorUserId: log.actorUserId,
    actor: log.actorUser
      ? {
          id: log.actorUser.id,
          name: log.actorUser.name,
          email: log.actorUser.email,
        }
      : null,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    metadata:
      log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : null,
    requestId: log.requestId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
  };
}
