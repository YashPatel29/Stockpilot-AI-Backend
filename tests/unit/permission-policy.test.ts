import { describe, it, expect } from "vitest";
import { OrganizationRole } from "@prisma/client";
import {
  Permissions,
  hasPermission,
  ROLE_PERMISSIONS,
} from "../../src/modules/organizations/rbac/permissions";
import { PermissionPolicy } from "../../src/modules/organizations/rbac/permission.policy";
import { ForbiddenError, BadRequestError } from "../../src/common/errors/http-errors";

describe("RBAC Permissions Catalog & Invariants (Unit)", () => {
  it("should assign full administrative permissions to OWNER", () => {
    const ownerPerms = ROLE_PERMISSIONS[OrganizationRole.OWNER];
    expect(ownerPerms).toContain(Permissions.ORG_MEMBERS_READ);
    expect(ownerPerms).toContain(Permissions.ORG_MEMBERS_ROLE_UPDATE);
    expect(ownerPerms).toContain(Permissions.ORG_MEMBERS_REMOVE);
    expect(ownerPerms).toContain(Permissions.ORG_INVITATIONS_CREATE);
    expect(ownerPerms).toContain(Permissions.ORG_INVITATIONS_READ);
    expect(ownerPerms).toContain(Permissions.ORG_INVITATIONS_REVOKE);
    expect(ownerPerms).toContain(Permissions.ORG_SETTINGS_MANAGE);
    expect(ownerPerms).toContain(Permissions.CATALOG_CATEGORIES_READ);
    expect(ownerPerms).toContain(Permissions.CATALOG_CATEGORIES_WRITE);
    expect(ownerPerms).toContain(Permissions.CATALOG_PRODUCTS_READ);
    expect(ownerPerms).toContain(Permissions.CATALOG_PRODUCTS_WRITE);
    expect(ownerPerms).toContain(Permissions.WAREHOUSES_READ);
    expect(ownerPerms).toContain(Permissions.WAREHOUSES_WRITE);
    expect(ownerPerms).toContain(Permissions.LOCATIONS_READ);
    expect(ownerPerms).toContain(Permissions.LOCATIONS_WRITE);
  });

  it("should assign operational permissions to ADMIN excluding settings & role assignment", () => {
    const adminPerms = ROLE_PERMISSIONS[OrganizationRole.ADMIN];
    expect(adminPerms).toContain(Permissions.ORG_MEMBERS_READ);
    expect(adminPerms).toContain(Permissions.ORG_MEMBERS_REMOVE);
    expect(adminPerms).toContain(Permissions.ORG_INVITATIONS_CREATE);
    expect(adminPerms).toContain(Permissions.ORG_INVITATIONS_READ);
    expect(adminPerms).toContain(Permissions.ORG_INVITATIONS_REVOKE);
    expect(adminPerms).toContain(Permissions.CATALOG_CATEGORIES_READ);
    expect(adminPerms).toContain(Permissions.CATALOG_CATEGORIES_WRITE);
    expect(adminPerms).toContain(Permissions.CATALOG_PRODUCTS_READ);
    expect(adminPerms).toContain(Permissions.CATALOG_PRODUCTS_WRITE);
    expect(adminPerms).toContain(Permissions.WAREHOUSES_READ);
    expect(adminPerms).toContain(Permissions.WAREHOUSES_WRITE);
    expect(adminPerms).toContain(Permissions.LOCATIONS_READ);
    expect(adminPerms).toContain(Permissions.LOCATIONS_WRITE);
    expect(adminPerms).not.toContain(Permissions.ORG_MEMBERS_ROLE_UPDATE);
    expect(adminPerms).not.toContain(Permissions.ORG_SETTINGS_MANAGE);
  });

  it("should assign read-only permissions to MEMBER", () => {
    const memberPerms = ROLE_PERMISSIONS[OrganizationRole.MEMBER];
    expect(memberPerms).toEqual([
      Permissions.ORG_MEMBERS_READ,
      Permissions.CATALOG_CATEGORIES_READ,
      Permissions.CATALOG_PRODUCTS_READ,
      Permissions.WAREHOUSES_READ,
      Permissions.LOCATIONS_READ,
    ]);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.ORG_MEMBERS_READ)).toBe(true);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.CATALOG_CATEGORIES_READ)).toBe(true);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.CATALOG_PRODUCTS_READ)).toBe(true);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.WAREHOUSES_READ)).toBe(true);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.LOCATIONS_READ)).toBe(true);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.CATALOG_CATEGORIES_WRITE)).toBe(
      false,
    );
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.CATALOG_PRODUCTS_WRITE)).toBe(false);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.WAREHOUSES_WRITE)).toBe(false);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.LOCATIONS_WRITE)).toBe(false);
    expect(hasPermission(OrganizationRole.MEMBER, Permissions.ORG_INVITATIONS_CREATE)).toBe(false);
  });
});

describe("PermissionPolicy (Unit)", () => {
  describe("assertCanAssignRole", () => {
    it("should allow OWNER to assign ADMIN or MEMBER to a non-OWNER target", () => {
      expect(() =>
        PermissionPolicy.assertCanAssignRole(
          OrganizationRole.OWNER,
          OrganizationRole.MEMBER,
          OrganizationRole.ADMIN,
        ),
      ).not.toThrow();

      expect(() =>
        PermissionPolicy.assertCanAssignRole(
          OrganizationRole.OWNER,
          OrganizationRole.ADMIN,
          OrganizationRole.MEMBER,
        ),
      ).not.toThrow();
    });

    it("should reject non-OWNER actors from changing member roles", () => {
      expect(() =>
        PermissionPolicy.assertCanAssignRole(
          OrganizationRole.ADMIN,
          OrganizationRole.MEMBER,
          OrganizationRole.ADMIN,
        ),
      ).toThrow(ForbiddenError);

      expect(() =>
        PermissionPolicy.assertCanAssignRole(
          OrganizationRole.MEMBER,
          OrganizationRole.MEMBER,
          OrganizationRole.ADMIN,
        ),
      ).toThrow(ForbiddenError);
    });

    it("should reject modifying or demoting the OWNER's role", () => {
      expect(() =>
        PermissionPolicy.assertCanAssignRole(
          OrganizationRole.OWNER,
          OrganizationRole.OWNER,
          OrganizationRole.ADMIN,
        ),
      ).toThrow(BadRequestError);
    });

    it("should reject promoting any user to OWNER through member management", () => {
      expect(() =>
        PermissionPolicy.assertCanAssignRole(
          OrganizationRole.OWNER,
          OrganizationRole.MEMBER,
          OrganizationRole.OWNER,
        ),
      ).toThrow(BadRequestError);
    });
  });

  describe("assertCanRemoveMember", () => {
    it("should prohibit removing the organization OWNER under any circumstance", () => {
      expect(() =>
        PermissionPolicy.assertCanRemoveMember(OrganizationRole.OWNER, OrganizationRole.OWNER),
      ).toThrow(BadRequestError);

      expect(() =>
        PermissionPolicy.assertCanRemoveMember(OrganizationRole.ADMIN, OrganizationRole.OWNER),
      ).toThrow(BadRequestError);
    });

    it("should prohibit regular MEMBER from removing any user", () => {
      expect(() =>
        PermissionPolicy.assertCanRemoveMember(OrganizationRole.MEMBER, OrganizationRole.MEMBER),
      ).toThrow(ForbiddenError);
    });

    it("should allow ADMIN to remove MEMBER but reject removing another ADMIN", () => {
      expect(() =>
        PermissionPolicy.assertCanRemoveMember(OrganizationRole.ADMIN, OrganizationRole.MEMBER),
      ).not.toThrow();

      expect(() =>
        PermissionPolicy.assertCanRemoveMember(OrganizationRole.ADMIN, OrganizationRole.ADMIN),
      ).toThrow(ForbiddenError);
    });

    it("should allow OWNER to remove ADMIN or MEMBER", () => {
      expect(() =>
        PermissionPolicy.assertCanRemoveMember(OrganizationRole.OWNER, OrganizationRole.MEMBER),
      ).not.toThrow();

      expect(() =>
        PermissionPolicy.assertCanRemoveMember(OrganizationRole.OWNER, OrganizationRole.ADMIN),
      ).not.toThrow();
    });
  });

  describe("assertCanCreateInvitation", () => {
    it("should allow OWNER and ADMIN to issue invitations for ADMIN or MEMBER", () => {
      expect(() =>
        PermissionPolicy.assertCanCreateInvitation(OrganizationRole.OWNER, OrganizationRole.MEMBER),
      ).not.toThrow();

      expect(() =>
        PermissionPolicy.assertCanCreateInvitation(OrganizationRole.ADMIN, OrganizationRole.ADMIN),
      ).not.toThrow();
    });

    it("should reject issuing invitations with the OWNER role", () => {
      expect(() =>
        PermissionPolicy.assertCanCreateInvitation(OrganizationRole.OWNER, OrganizationRole.OWNER),
      ).toThrow(BadRequestError);

      expect(() =>
        PermissionPolicy.assertCanCreateInvitation(OrganizationRole.ADMIN, OrganizationRole.OWNER),
      ).toThrow(BadRequestError);
    });

    it("should reject regular MEMBER from issuing invitations", () => {
      expect(() =>
        PermissionPolicy.assertCanCreateInvitation(
          OrganizationRole.MEMBER,
          OrganizationRole.MEMBER,
        ),
      ).toThrow(ForbiddenError);
    });
  });

  describe("assertCanRevokeInvitation", () => {
    it("should allow OWNER and ADMIN to revoke invitations", () => {
      expect(() =>
        PermissionPolicy.assertCanRevokeInvitation(OrganizationRole.OWNER),
      ).not.toThrow();

      expect(() =>
        PermissionPolicy.assertCanRevokeInvitation(OrganizationRole.ADMIN),
      ).not.toThrow();
    });

    it("should reject regular MEMBER from revoking invitations", () => {
      expect(() => PermissionPolicy.assertCanRevokeInvitation(OrganizationRole.MEMBER)).toThrow(
        ForbiddenError,
      );
    });
  });
});
