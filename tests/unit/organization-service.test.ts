import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrganizationRole, type PrismaClient } from "@prisma/client";
import { OrganizationService } from "../../src/modules/organizations/organization.service";
import { NotFoundError, ForbiddenError } from "../../src/common/errors/http-errors";

describe("OrganizationService (Unit)", () => {
  let mockPrisma: {
    organization: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    organizationMembership: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  let service: OrganizationService;

  const userId = "usr-uuid-111";
  const orgId = "org-uuid-222";

  const sampleOrg = {
    id: orgId,
    name: "Acme Logistics",
    slug: "acme-logistics",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleOwnerMembership = {
    id: "mem-uuid-1",
    userId,
    organizationId: orgId,
    role: OrganizationRole.OWNER,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    organization: sampleOrg,
  };

  const sampleMemberMembership = {
    ...sampleOwnerMembership,
    id: "mem-uuid-2",
    role: OrganizationRole.MEMBER,
  };

  beforeEach(() => {
    mockPrisma = {
      organization: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      organizationMembership: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
          return callback(mockPrisma);
        }),
    };

    service = new OrganizationService(mockPrisma as unknown as PrismaClient);
  });

  describe("createOrganization()", () => {
    it("should atomically create organization and assign caller as OWNER", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null); // No slug collision
      mockPrisma.organization.create.mockResolvedValue(sampleOrg);
      mockPrisma.organizationMembership.create.mockResolvedValue(sampleOwnerMembership);

      const result = await service.createOrganization(userId, { name: "  Acme Logistics  " });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: {
          name: "Acme Logistics",
          slug: "acme-logistics",
          status: "ACTIVE",
        },
      });
      expect(mockPrisma.organizationMembership.create).toHaveBeenCalledWith({
        data: {
          userId,
          organizationId: orgId,
          role: OrganizationRole.OWNER,
        },
      });

      expect(result.role).toBe(OrganizationRole.OWNER);
      expect(result.organization.id).toBe(orgId);
      expect(result.organization.name).toBe("Acme Logistics");
    });

    it("should handle slug collision by appending a unique suffix", async () => {
      // First slug lookup collides, second is free
      mockPrisma.organization.findUnique
        .mockResolvedValueOnce({ id: "existing-org" })
        .mockResolvedValueOnce(null);

      mockPrisma.organization.create.mockResolvedValue({
        ...sampleOrg,
        slug: "acme-logistics-a1b2",
      });
      mockPrisma.organizationMembership.create.mockResolvedValue(sampleOwnerMembership);

      const result = await service.createOrganization(userId, { name: "Acme Logistics" });

      expect(mockPrisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: expect.stringMatching(/^acme-logistics-[a-f0-9]{4}$/),
          }),
        }),
      );
      expect(result.role).toBe(OrganizationRole.OWNER);
    });

    it("should roll back atomically if membership creation fails in transaction", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      mockPrisma.organization.create.mockResolvedValue(sampleOrg);
      mockPrisma.organizationMembership.create.mockRejectedValue(
        new Error("Database write timeout"),
      );

      await expect(service.createOrganization(userId, { name: "Acme Logistics" })).rejects.toThrow(
        "Database write timeout",
      );
    });
  });

  describe("listUserOrganizations()", () => {
    it("should list only organizations the authenticated user belongs to with pagination", async () => {
      mockPrisma.organizationMembership.count.mockResolvedValue(1);
      mockPrisma.organizationMembership.findMany.mockResolvedValue([sampleOwnerMembership]);

      const result = await service.listUserOrganizations(userId, { page: 1, limit: 10 });

      expect(mockPrisma.organizationMembership.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          organization: {
            status: { not: "DEACTIVATED" },
          },
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { organization: true },
      });

      expect(result.organizations).toHaveLength(1);
      const firstOrg = result.organizations[0];
      expect(firstOrg).toBeDefined();
      expect(firstOrg?.id).toBe(orgId);
      expect(firstOrg?.role).toBe(OrganizationRole.OWNER);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe("getOrganizationById()", () => {
    it("should return organization and role when caller is an active member", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(sampleMemberMembership);

      const result = await service.getOrganizationById(userId, orgId);

      expect(result.organization.id).toBe(orgId);
      expect(result.role).toBe(OrganizationRole.MEMBER);
    });

    it("should throw NotFoundError when caller is not a member (IDOR prevention)", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);

      await expect(service.getOrganizationById(userId, "unauthorized-org-id")).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should throw NotFoundError when organization is deactivated", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue({
        ...sampleOwnerMembership,
        organization: { ...sampleOrg, status: "DEACTIVATED" },
      });

      await expect(service.getOrganizationById(userId, orgId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateOrganization()", () => {
    it("should allow an OWNER to update organization name", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(sampleOwnerMembership);
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      mockPrisma.organization.update.mockResolvedValue({
        ...sampleOrg,
        name: "Acme Supply Chain",
        slug: "acme-supply-chain",
      });

      const updated = await service.updateOrganization(userId, orgId, {
        name: "Acme Supply Chain",
      });

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: orgId },
        data: {
          name: "Acme Supply Chain",
          slug: "acme-supply-chain",
        },
      });
      expect(updated.name).toBe("Acme Supply Chain");
    });

    it("should reject update with ForbiddenError when caller is only a MEMBER", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(sampleMemberMembership);

      await expect(service.updateOrganization(userId, orgId, { name: "New Name" })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("should throw NotFoundError if caller has no membership at all", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);

      await expect(service.updateOrganization(userId, orgId, { name: "New Name" })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("deactivateOrganization()", () => {
    it("should allow an OWNER to deactivate the organization safely", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(sampleOwnerMembership);
      mockPrisma.organization.update.mockResolvedValue({
        ...sampleOrg,
        status: "DEACTIVATED",
      });

      await service.deactivateOrganization(userId, orgId);

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: orgId },
        data: { status: "DEACTIVATED" },
      });
    });

    it("should reject deactivation with ForbiddenError when caller is only a MEMBER", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(sampleMemberMembership);

      await expect(service.deactivateOrganization(userId, orgId)).rejects.toThrow(ForbiddenError);
    });

    it("should throw NotFoundError if organization does not exist", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);

      await expect(service.deactivateOrganization(userId, orgId)).rejects.toThrow(NotFoundError);
    });
  });
});
