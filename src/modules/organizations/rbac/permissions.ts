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
  ],
  [OrganizationRole.MEMBER]: [
    Permissions.ORG_MEMBERS_READ,
    Permissions.CATALOG_CATEGORIES_READ,
    Permissions.CATALOG_PRODUCTS_READ,
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
