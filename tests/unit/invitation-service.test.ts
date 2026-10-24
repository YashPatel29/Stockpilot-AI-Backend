import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrganizationRole, type PrismaClient } from "@prisma/client";
import { InvitationService } from "../../src/modules/organizations/invitations/invitation.service";
import { DevInvitationDeliveryAdapter } from "../../src/modules/organizations/invitations/delivery/dev-delivery";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "../../src/common/errors/http-errors";
import { hashToken } from "../../src/common/utils/token.util";

describe("InvitationService (Unit)", () => {
  let mockPrisma: {
    organizationMembership: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    organizationInvitation: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  let deliveryAdapter: DevInvitationDeliveryAdapter;
  let service: InvitationService;

  const orgId = "org-uuid-111";
  const otherOrgId = "org-uuid-999";
  const ownerUserId = "user-owner-1";
  const inviteeEmail = "candidate@example.com";

  const ownerMembership = {
    id: "mem-owner-id",
    userId: ownerUserId,
    organizationId: orgId,
    role: OrganizationRole.OWNER,
    organization: { id: orgId, name: "Acme Corp", slug: "acme-corp", status: "ACTIVE" },
    user: { id: ownerUserId, name: "Owner Name", email: "owner@acme.com" },
  };

  beforeEach(() => {
    deliveryAdapter = new DevInvitationDeliveryAdapter();
    deliveryAdapter.clear();

    mockPrisma = {
      organizationMembership: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      organizationInvitation: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
        return callback(mockPrisma);
      }),
    };

    service = new InvitationService(mockPrisma as unknown as PrismaClient, deliveryAdapter);
  });

  describe("createInvitation", () => {
    it("should issue an invitation, hash the token for DB, and dispatch to delivery adapter", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(ownerMembership);
      mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);
      mockPrisma.organizationInvitation.updateMany.mockResolvedValue({ count: 0 });

      mockPrisma.organizationInvitation.create.mockImplementation(
        ({
          data,
        }: {
          data: { email: string; role: OrganizationRole; tokenHash: string; expiresAt: Date };
        }) => ({
          id: "inv-uuid-1",
          organizationId: orgId,
          email: data.email,
          role: data.role,
          tokenHash: data.tokenHash,
          invitedById: ownerUserId,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
          invitedBy: { id: ownerUserId, name: "Owner Name", email: "owner@acme.com" },
        }),
      );

      const result = await service.createInvitation(ownerUserId, orgId, {
        email: "Candidate@Example.Com ",
        role: OrganizationRole.ADMIN,
      });

      expect(result.invitation.email).toBe(inviteeEmail);
      expect(result.invitation.role).toBe(OrganizationRole.ADMIN);
      expect(result.rawToken).toHaveLength(64);

      // Verify DB stored tokenHash rather than rawToken
      expect(mockPrisma.organizationInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: hashToken(result.rawToken),
            email: inviteeEmail,
            role: OrganizationRole.ADMIN,
          }),
        }),
      );

      // Verify delivery adapter captured the invitation
      const sent = deliveryAdapter.getLatestInvitationForEmail(inviteeEmail);
      expect(sent).toBeDefined();
      expect(sent?.rawToken).toBe(result.rawToken);
      expect(sent?.organizationName).toBe("Acme Corp");
    });

    it("should throw ConflictError if candidate is already an active member", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(ownerMembership);
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({ id: "existing-mem" });

      await expect(
        service.createInvitation(ownerUserId, orgId, {
          email: inviteeEmail,
          role: OrganizationRole.MEMBER,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("should reject issuing invitations with OWNER role", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(ownerMembership);

      await expect(
        service.createInvitation(ownerUserId, orgId, {
          email: inviteeEmail,
          role: OrganizationRole.OWNER as unknown as "MEMBER",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("listPendingInvitations", () => {
    it("should return pending invitations with token hashes omitted", async () => {
      mockPrisma.organizationInvitation.count.mockResolvedValue(1);
      mockPrisma.organizationInvitation.findMany.mockResolvedValue([
        {
          id: "inv-uuid-1",
          organizationId: orgId,
          email: inviteeEmail,
          role: OrganizationRole.MEMBER,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          tokenHash: "secret-sha256-hash",
          invitedBy: { id: ownerUserId, name: "Owner Name", email: "owner@acme.com" },
        },
      ]);

      const result = await service.listPendingInvitations(orgId, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.email).toBe(inviteeEmail);
      // Ensure tokenHash is not in DTO
      expect((result.items[0] as unknown as { tokenHash?: string }).tokenHash).toBeUndefined();
    });
  });

  describe("revokeInvitation", () => {
    it("should mark a pending invitation as revoked", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(ownerMembership);
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue({
        id: "inv-1",
        organizationId: orgId,
        acceptedAt: null,
        revokedAt: null,
      });

      await expect(service.revokeInvitation(ownerUserId, orgId, "inv-1")).resolves.toBeUndefined();

      expect(mockPrisma.organizationInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-1" },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it("should throw NotFoundError if invitation belongs to another organization", async () => {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(ownerMembership);
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue({
        id: "inv-1",
        organizationId: otherOrgId,
        acceptedAt: null,
        revokedAt: null,
      });

      await expect(service.revokeInvitation(ownerUserId, orgId, "inv-1")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("acceptInvitation", () => {
    const rawToken = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    const hashed = hashToken(rawToken);

    const validInvitation = {
      id: "inv-123",
      organizationId: orgId,
      email: "joiner@example.com",
      role: OrganizationRole.ADMIN,
      tokenHash: hashed,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      revokedAt: null,
      organization: {
        id: orgId,
        name: "Acme Corp",
        slug: "acme-corp",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    it("should accept valid invitation atomically in transaction", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue(validInvitation);
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(null);
      mockPrisma.organizationMembership.create.mockResolvedValue({
        id: "new-mem-id",
        userId: "user-new",
        organizationId: orgId,
        role: OrganizationRole.ADMIN,
        createdAt: new Date(),
      });
      mockPrisma.organizationInvitation.update.mockResolvedValue({
        ...validInvitation,
        acceptedAt: new Date(),
      });

      const result = await service.acceptInvitation("user-new", "joiner@example.com", rawToken);

      expect(result.membership.role).toBe(OrganizationRole.ADMIN);
      expect(result.organization.name).toBe("Acme Corp");
      expect(mockPrisma.organizationMembership.create).toHaveBeenCalledWith({
        data: {
          userId: "user-new",
          organizationId: orgId,
          role: OrganizationRole.ADMIN,
        },
      });
      expect(mockPrisma.organizationInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-123" },
          data: { acceptedAt: expect.any(Date) },
        }),
      );
    });

    it("should reject when authenticated email does not match invitation email", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue(validInvitation);

      await expect(
        service.acceptInvitation("user-new", "wrong.account@example.com", rawToken),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should reject expired invitation", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue({
        ...validInvitation,
        expiresAt: new Date(Date.now() - 1000), // Expired
      });

      await expect(
        service.acceptInvitation("user-new", "joiner@example.com", rawToken),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject revoked invitation", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue({
        ...validInvitation,
        revokedAt: new Date(),
      });

      await expect(
        service.acceptInvitation("user-new", "joiner@example.com", rawToken),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject already accepted invitation", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue({
        ...validInvitation,
        acceptedAt: new Date(),
      });

      await expect(
        service.acceptInvitation("user-new", "joiner@example.com", rawToken),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject if caller is already a member (duplicate prevention)", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue(validInvitation);
      mockPrisma.organizationMembership.findUnique.mockResolvedValue({ id: "already-member" });

      await expect(
        service.acceptInvitation("user-new", "joiner@example.com", rawToken),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("getInvitationDetails", () => {
    const rawToken = "abcde12345abcde12345abcde12345abcde12345abcde12345abcde123456789";
    const hashed = hashToken(rawToken);

    it("should return safe public details for a valid token", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue({
        id: "inv-preview-1",
        email: "candidate@example.com",
        role: OrganizationRole.MEMBER,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: null,
        revokedAt: null,
        organization: { id: orgId, name: "Acme Corp", slug: "acme-corp", status: "ACTIVE" },
        invitedBy: { name: "Alice Owner" },
      });

      const details = await service.getInvitationDetails(rawToken);

      expect(details.organization.name).toBe("Acme Corp");
      expect(details.invitedBy.name).toBe("Alice Owner");
      expect(details.role).toBe(OrganizationRole.MEMBER);
    });

    it("should throw NotFoundError if token does not exist", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue(null);

      await expect(service.getInvitationDetails("invalid-token")).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if invitation is expired", async () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue({
        id: "inv-preview-1",
        email: "candidate@example.com",
        role: OrganizationRole.MEMBER,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() - 1000),
        acceptedAt: null,
        revokedAt: null,
        organization: { id: orgId, name: "Acme Corp", slug: "acme-corp", status: "ACTIVE" },
        invitedBy: { name: "Alice Owner" },
      });

      await expect(service.getInvitationDetails(rawToken)).rejects.toThrow(BadRequestError);
    });
  });

  describe("listUserReceivedInvitations", () => {
    it("should return active invitations sent to user email", async () => {
      mockPrisma.organizationInvitation.findMany.mockResolvedValue([
        {
          id: "inv-rec-1",
          role: OrganizationRole.ADMIN,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          organization: { id: orgId, name: "Acme Corp", slug: "acme-corp" },
          invitedBy: { name: "Alice", email: "alice@acme.com" },
        },
      ]);

      const result = await service.listUserReceivedInvitations("candidate@example.com");

      expect(result).toHaveLength(1);
      expect(result[0]?.organization.name).toBe("Acme Corp");
      expect(result[0]?.role).toBe(OrganizationRole.ADMIN);
    });
  });
});
