import { OrganizationRole } from "@prisma/client";

/**
 * Granular permissions catalog for multi-tenant organization operations.
 */
export const Permissions = {
  // Member management
  ORG_MEMBERS_READ: "org:members:read",
  ORG_MEMBERS_ROLE_UPDATE: "org:members:role:update",
  ORG_MEMBERS_REMOVE: "org:members:remove",

  // Invitation management
  ORG_INVITATIONS_CREATE: "org:invitations:create",
  ORG_INVITATIONS_READ: "org:invitations:read",
  ORG_INVITATIONS_REVOKE: "org:invitations:revoke",

  // Organization settings & lifecycle
  ORG_SETTINGS_MANAGE: "org:settings:manage",

  // Product category management
  CATALOG_CATEGORIES_READ: "catalog:categories:read",
  CATALOG_CATEGORIES_WRITE: "catalog:categories:write",

  // Product management
  CATALOG_PRODUCTS_READ: "catalog:products:read",
  CATALOG_PRODUCTS_WRITE: "catalog:products:write",

  // Warehouse management
  WAREHOUSES_READ: "warehouses:read",
  WAREHOUSES_WRITE: "warehouses:write",

  // Storage location management
  LOCATIONS_READ: "locations:read",
  LOCATIONS_WRITE: "locations:write",

  // Inventory balance & transaction management
  INVENTORY_BALANCES_READ: "inventory:balances:read",
  INVENTORY_TRANSACTIONS_READ: "inventory:transactions:read",
  INVENTORY_TRANSACTIONS_WRITE: "inventory:transactions:write",

  // Supplier management
  SUPPLIERS_READ: "suppliers:read",
  SUPPLIERS_WRITE: "suppliers:write",

  // Purchase order management
  PURCHASE_ORDERS_READ: "purchase_orders:read",
  PURCHASE_ORDERS_WRITE: "purchase_orders:write",

  // Reporting & dashboard management
  REPORTS_READ: "reports:read",

  // Audit logs management
  AUDIT_LOGS_READ: "audit_logs:read",

  // Demand forecasting management
  FORECASTS_READ: "forecasts:read",
  FORECASTS_WRITE: "forecasts:write",

  // Inventory anomaly detection management
  ANOMALIES_READ: "anomalies:read",
  ANOMALIES_WRITE: "anomalies:write",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Explicit role-to-permission mapping defining baseline entitlements.
 * Invariant: Fine-grained restrictions (e.g. hierarchical member removal) are
 * enforced via PermissionPolicy.
 */
export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  [OrganizationRole.OWNER]: [
    Permissions.ORG_MEMBERS_READ,
    Permissions.ORG_MEMBERS_ROLE_UPDATE,
    Permissions.ORG_MEMBERS_REMOVE,
    Permissions.ORG_INVITATIONS_CREATE,
    Permissions.ORG_INVITATIONS_READ,
    Permissions.ORG_INVITATIONS_REVOKE,
    Permissions.ORG_SETTINGS_MANAGE,
    Permissions.CATALOG_CATEGORIES_READ,
    Permissions.CATALOG_CATEGORIES_WRITE,
    Permissions.CATALOG_PRODUCTS_READ,
    Permissions.CATALOG_PRODUCTS_WRITE,
    Permissions.WAREHOUSES_READ,
    Permissions.WAREHOUSES_WRITE,
    Permissions.LOCATIONS_READ,
    Permissions.LOCATIONS_WRITE,
    Permissions.INVENTORY_BALANCES_READ,
    Permissions.INVENTORY_TRANSACTIONS_READ,
    Permissions.INVENTORY_TRANSACTIONS_WRITE,
    Permissions.SUPPLIERS_READ,
    Permissions.SUPPLIERS_WRITE,
    Permissions.PURCHASE_ORDERS_READ,
    Permissions.PURCHASE_ORDERS_WRITE,
    Permissions.REPORTS_READ,
    Permissions.AUDIT_LOGS_READ,
    Permissions.FORECASTS_READ,
    Permissions.FORECASTS_WRITE,
    Permissions.ANOMALIES_READ,
    Permissions.ANOMALIES_WRITE,
  ],
  [OrganizationRole.ADMIN]: [
    Permissions.ORG_MEMBERS_READ,
    Permissions.ORG_MEMBERS_REMOVE,
    Permissions.ORG_INVITATIONS_CREATE,
    Permissions.ORG_INVITATIONS_READ,
    Permissions.ORG_INVITATIONS_REVOKE,
    Permissions.CATALOG_CATEGORIES_READ,
    Permissions.CATALOG_CATEGORIES_WRITE,
    Permissions.CATALOG_PRODUCTS_READ,
    Permissions.CATALOG_PRODUCTS_WRITE,
    Permissions.WAREHOUSES_READ,
    Permissions.WAREHOUSES_WRITE,
    Permissions.LOCATIONS_READ,
    Permissions.LOCATIONS_WRITE,
    Permissions.INVENTORY_BALANCES_READ,
    Permissions.INVENTORY_TRANSACTIONS_READ,
    Permissions.INVENTORY_TRANSACTIONS_WRITE,
    Permissions.SUPPLIERS_READ,
    Permissions.SUPPLIERS_WRITE,
    Permissions.PURCHASE_ORDERS_READ,
    Permissions.PURCHASE_ORDERS_WRITE,
    Permissions.REPORTS_READ,
    Permissions.AUDIT_LOGS_READ,
    Permissions.FORECASTS_READ,
    Permissions.FORECASTS_WRITE,
    Permissions.ANOMALIES_READ,
    Permissions.ANOMALIES_WRITE,
  ],
  [OrganizationRole.MEMBER]: [
    Permissions.ORG_MEMBERS_READ,
    Permissions.CATALOG_CATEGORIES_READ,
    Permissions.CATALOG_PRODUCTS_READ,
    Permissions.WAREHOUSES_READ,
    Permissions.LOCATIONS_READ,
    Permissions.INVENTORY_BALANCES_READ,
    Permissions.INVENTORY_TRANSACTIONS_READ,
    Permissions.SUPPLIERS_READ,
    Permissions.PURCHASE_ORDERS_READ,
    Permissions.REPORTS_READ,
    Permissions.FORECASTS_READ,
    Permissions.ANOMALIES_READ,
  ],
};

/**
 * Checks whether an organization role holds the specified baseline permission.
 */
export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permission);
}
