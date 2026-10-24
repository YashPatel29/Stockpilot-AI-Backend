import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrganizationRole, type PrismaClient } from "@prisma/client";
import { MemberService } from "../../src/modules/organizations/members/member.service";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from "../../src/common/errors/http-errors";

describe("MemberService (Unit)", () => {
  let mockPrisma: {
    organizationMembership: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  let service: MemberService;

  const orgId = "org-uuid-111";
  const otherOrgId = "org-uuid-999";
  const ownerUserId = "user-owner-1";
  const adminUserId = "user-admin-2";
  const memberUserId = "user-member-3";

  const ownerMembership = {
    id: "mem-owner-id",
    userId: ownerUserId,
    organizationId: orgId,
    role: OrganizationRole.OWNER,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    user: { id: ownerUserId, name: "Owner User", email: "owner@test.com" },
  };

  const adminMembership = {
    id: "mem-admin-id",
    userId: adminUserId,
    organizationId: orgId,
    role: OrganizationRole.ADMIN,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    user: { id: adminUserId, name: "Admin User", email: "admin@test.com" },
  };

  const regularMembership = {
    id: "mem-member-id",
    userId: memberUserId,
    organizationId: orgId,
    role: OrganizationRole.MEMBER,
    createdAt: new Date("2026-01-03T00:00:00Z"),
    updatedAt: new Date("2026-01-03T00:00:00Z"),
    user: { id: memberUserId, name: "Member User", email: "member@test.com" },
  };

  beforeEach(() => {
    mockPrisma = {
      organizationMembership: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    service = new MemberService(mockPrisma as unknown as PrismaClient);
  });

  describe("listMembers", () => {
    it("should return paginated members with safe user profiles", async () => {
      mockPrisma.organizationMembership.count.mockResolvedValue(2);
      mockPrisma.organizationMembership.findMany.mockResolvedValue([
        ownerMembership,
        regularMembership,
      ]);

      const result = await service.listMembers(orgId, { page: 1, limit: 10 });

      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.user).toEqual({
        id: ownerUserId,
        name: "Owner User",
        email: "owner@test.com",
      });
      expect(result.items[1]?.role).toBe(OrganizationRole.MEMBER);
    });
  });

  describe("updateMemberRole", () => {
    it("should allow OWNER to promote a MEMBER to ADMIN", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(ownerMembership) // actor lookup
        .mockResolvedValueOnce(regularMembership); // target lookup

      mockPrisma.organizationMembership.update.mockResolvedValue({
        ...regularMembership,
        role: OrganizationRole.ADMIN,
      });

      const updated = await service.updateMemberRole(
        ownerUserId,
        orgId,
        regularMembership.id,
        OrganizationRole.ADMIN,
      );

      expect(updated.role).toBe(OrganizationRole.ADMIN);
      expect(mockPrisma.organizationMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: regularMembership.id },
          data: { role: OrganizationRole.ADMIN },
        }),
      );
    });

    it("should throw NotFoundError if target membership belongs to a different organization (IDOR defense)", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(ownerMembership)
        .mockResolvedValueOnce({
          ...regularMembership,
          organizationId: otherOrgId,
        });

      await expect(
        service.updateMemberRole(ownerUserId, orgId, regularMembership.id, OrganizationRole.ADMIN),
      ).rejects.toThrow(NotFoundError);
    });

    it("should reject promoting anyone to OWNER", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(ownerMembership)
        .mockResolvedValueOnce(regularMembership);

      await expect(
        service.updateMemberRole(ownerUserId, orgId, regularMembership.id, OrganizationRole.OWNER),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject non-OWNER actor from changing member roles", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(adminMembership)
        .mockResolvedValueOnce(regularMembership);

      await expect(
        service.updateMemberRole(adminUserId, orgId, regularMembership.id, OrganizationRole.MEMBER),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("removeMember", () => {
    it("should allow OWNER to remove a member", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(ownerMembership)
        .mockResolvedValueOnce(regularMembership);

      mockPrisma.organizationMembership.delete.mockResolvedValue(regularMembership);

      await expect(
        service.removeMember(ownerUserId, orgId, regularMembership.id),
      ).resolves.toBeUndefined();

      expect(mockPrisma.organizationMembership.delete).toHaveBeenCalledWith({
        where: { id: regularMembership.id },
      });
    });

    it("should allow ADMIN to remove a MEMBER", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(adminMembership)
        .mockResolvedValueOnce(regularMembership);

      mockPrisma.organizationMembership.delete.mockResolvedValue(regularMembership);

      await expect(
        service.removeMember(adminUserId, orgId, regularMembership.id),
      ).resolves.toBeUndefined();
    });

    it("should prevent ADMIN from removing another ADMIN", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(adminMembership)
        .mockResolvedValueOnce(adminMembership);

      await expect(service.removeMember(adminUserId, orgId, adminMembership.id)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("should strictly prohibit removing the organization OWNER", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(ownerMembership)
        .mockResolvedValueOnce(ownerMembership);

      await expect(service.removeMember(ownerUserId, orgId, ownerMembership.id)).rejects.toThrow(
        BadRequestError,
      );
    });

    it("should throw NotFoundError if member belongs to another organization", async () => {
      mockPrisma.organizationMembership.findUnique
        .mockResolvedValueOnce(ownerMembership)
        .mockResolvedValueOnce({
          ...regularMembership,
          organizationId: otherOrgId,
        });

      await expect(service.removeMember(ownerUserId, orgId, regularMembership.id)).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
