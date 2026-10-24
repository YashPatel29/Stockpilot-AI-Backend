import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { OrganizationRole, type Organization } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken, hashToken } from "../../src/common/utils/token.util";
import { devInvitationDelivery } from "../../src/modules/organizations/invitations/delivery/dev-delivery";

describe("Feature 3: Team Members, Invitations & RBAC (Integration)", () => {
  const ownerUser = {
    id: "usr-owner-111",
    email: "owner@stockpilot.io",
    name: "Owner Alice",
    status: "ACTIVE",
  };

  const adminUser = {
    id: "usr-admin-222",
    email: "admin@stockpilot.io",
    name: "Admin Bob",
    status: "ACTIVE",
  };

  const memberUser = {
    id: "usr-member-333",
    email: "member@stockpilot.io",
    name: "Member Charlie",
    status: "ACTIVE",
  };

  const inviteeUser = {
    id: "usr-invitee-444",
    email: "newinvitee@stockpilot.io",
    name: "Invitee Dave",
    status: "ACTIVE",
  };

  const orgId = "550e8400-e29b-41d4-a716-446655440000";
  const otherOrgId = "660e8400-e29b-41d4-a716-446655440000";

  const targetMembershipId = "770e8400-e29b-41d4-a716-446655440000";
  const targetInvitationId = "880e8400-e29b-41d4-a716-446655440000";

  const sampleOrg: Organization = {
    id: orgId,
    name: "StockPilot Supply Chain",
    slug: "stockpilot-supply-chain",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const ownerMembership = {
    id: "mem-owner-1",
    userId: ownerUser.id,
    organizationId: orgId,
    role: OrganizationRole.OWNER,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    organization: sampleOrg,
    user: ownerUser,
  };

  const adminMembership = {
    id: "mem-admin-2",
    userId: adminUser.id,
    organizationId: orgId,
    role: OrganizationRole.ADMIN,
    createdAt: new Date("2026-01-02T10:00:00Z"),
    updatedAt: new Date("2026-01-02T10:00:00Z"),
    organization: sampleOrg,
    user: adminUser,
  };

  const memberMembership = {
    id: "mem-member-3",
    userId: memberUser.id,
    organizationId: orgId,
    role: OrganizationRole.MEMBER,
    createdAt: new Date("2026-01-03T10:00:00Z"),
    updatedAt: new Date("2026-01-03T10:00:00Z"),
    organization: sampleOrg,
    user: memberUser,
  };

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let inviteeToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    devInvitationDelivery.clear();

    ownerToken = signAccessToken({
      sub: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
    });
    adminToken = signAccessToken({
      sub: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
    });
    memberToken = signAccessToken({
      sub: memberUser.id,
      email: memberUser.email,
      name: memberUser.name,
    });
    inviteeToken = signAccessToken({
      sub: inviteeUser.id,
      email: inviteeUser.email,
      name: inviteeUser.name,
    });

    // Mock authenticate middleware user resolver
    vi.spyOn(prisma.user, "findUnique").mockImplementation(((args: {
      where: { id?: string; email?: string };
    }) => {
      const id = args.where.id;
      if (id === ownerUser.id) return Promise.resolve(ownerUser);
      if (id === adminUser.id) return Promise.resolve(adminUser);
      if (id === memberUser.id) return Promise.resolve(memberUser);
      if (id === inviteeUser.id) return Promise.resolve(inviteeUser);
      return Promise.resolve(null);
    }) as never);
  });

  // =========================================================================
  // 1. MEMBER LISTING & PAGINATION
  // =========================================================================
  describe("GET /api/v1/organizations/:organizationId/members", () => {
    it("should allow any active member (MEMBER, ADMIN, OWNER) to list members with pagination", async () => {
      // Mock requireOrgMember lookup for memberUser
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        memberMembership as never,
      );

      vi.spyOn(prisma.organizationMembership, "count").mockResolvedValue(3);
      vi.spyOn(prisma.organizationMembership, "findMany").mockResolvedValue([
        { ...ownerMembership, user: ownerUser },
        { ...adminMembership, user: adminUser },
        { ...memberMembership, user: memberUser },
      ] as never);

      const response = await request(app)
        .get(`/api/v1/organizations/${orgId}/members?page=1&limit=20`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(3);
      expect(response.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
      expect(response.body.data.items[0].user).toEqual({
        id: ownerUser.id,
        name: ownerUser.name,
        email: ownerUser.email,
      });
    });

    it("should return 404 for non-members (IDOR protection)", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/v1/organizations/${orgId}/members`)
        .set("Authorization", `Bearer ${inviteeToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("Organization not found.");
    });
  });

  // =========================================================================
  // 2. MEMBER ROLE MUTATION & RBAC RESTRICTIONS
  // =========================================================================
  describe("PATCH /api/v1/organizations/:organizationId/members/:membershipId/role", () => {
    it("should allow OWNER to promote a MEMBER to ADMIN", async () => {
      // 1. requireOrgMember lookup for owner
      // 2. Service actor lookup
      // 3. Service target membership lookup
      const targetMember = {
        id: targetMembershipId,
        userId: memberUser.id,
        organizationId: orgId,
        role: OrganizationRole.MEMBER,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: memberUser,
      };

      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(ownerMembership as never) // requireOrgMember
        .mockResolvedValueOnce(ownerMembership as never) // service actor
        .mockResolvedValueOnce(targetMember as never); // target

      vi.spyOn(prisma.organizationMembership, "update").mockResolvedValue({
        ...targetMember,
        role: OrganizationRole.ADMIN,
      } as never);

      const response = await request(app)
        .patch(`/api/v1/organizations/${orgId}/members/${targetMembershipId}/role`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "ADMIN" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe("ADMIN");
    });

    it("should return 403 Forbidden when an ADMIN attempts to change member roles", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        adminMembership as never,
      );

      const response = await request(app)
        .patch(`/api/v1/organizations/${orgId}/members/${targetMembershipId}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "MEMBER" });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("should return 422/400 when attempting to promote anyone to OWNER", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        ownerMembership as never,
      );

      const response = await request(app)
        .patch(`/api/v1/organizations/${orgId}/members/${targetMembershipId}/role`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "OWNER" });

      expect(response.status).toBe(422); // Zod enum rejects OWNER
    });

    it("should return 400 Bad Request when attempting to modify/demote the organization OWNER", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(ownerMembership as never)
        .mockResolvedValueOnce(ownerMembership as never)
        .mockResolvedValueOnce(ownerMembership as never); // Target is OWNER

      const response = await request(app)
        .patch(`/api/v1/organizations/${orgId}/members/${targetMembershipId}/role`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "ADMIN" });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("OWNER cannot be demoted");
    });
  });

  // =========================================================================
  // 3. MEMBER REMOVAL & HIERARCHY RESTRICTIONS
  // =========================================================================
  describe("DELETE /api/v1/organizations/:organizationId/members/:membershipId", () => {
    it("should allow OWNER to remove a member", async () => {
      const targetMember = {
        id: targetMembershipId,
        userId: memberUser.id,
        organizationId: orgId,
        role: OrganizationRole.MEMBER,
      };

      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(ownerMembership as never) // requireOrgMember
        .mockResolvedValueOnce(ownerMembership as never) // service actor
        .mockResolvedValueOnce(targetMember as never); // service target

      vi.spyOn(prisma.organizationMembership, "delete").mockResolvedValue(targetMember as never);

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${targetMembershipId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.message).toBe("Member removed successfully.");
    });

    it("should allow ADMIN to remove a regular MEMBER", async () => {
      const targetMember = {
        id: targetMembershipId,
        userId: memberUser.id,
        organizationId: orgId,
        role: OrganizationRole.MEMBER,
      };

      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(adminMembership as never)
        .mockResolvedValueOnce(adminMembership as never)
        .mockResolvedValueOnce(targetMember as never);

      vi.spyOn(prisma.organizationMembership, "delete").mockResolvedValue(targetMember as never);

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${targetMembershipId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it("should prevent ADMIN from removing another ADMIN", async () => {
      const targetAdmin = {
        id: targetMembershipId,
        userId: "other-admin-id",
        organizationId: orgId,
        role: OrganizationRole.ADMIN,
      };

      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(adminMembership as never)
        .mockResolvedValueOnce(adminMembership as never)
        .mockResolvedValueOnce(targetAdmin as never);

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${targetMembershipId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain("only remove regular members");
    });

    it("should prevent removing the OWNER under any circumstance", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(ownerMembership as never)
        .mockResolvedValueOnce(ownerMembership as never)
        .mockResolvedValueOnce(ownerMembership as never); // target is OWNER

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${targetMembershipId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("OWNER cannot be removed");
    });

    it("should return 404 if member belongs to a different organization (IDOR protection)", async () => {
      const foreignMember = {
        id: targetMembershipId,
        userId: memberUser.id,
        organizationId: otherOrgId,
        role: OrganizationRole.MEMBER,
      };

      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(ownerMembership as never)
        .mockResolvedValueOnce(ownerMembership as never)
        .mockResolvedValueOnce(foreignMember as never);

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgId}/members/${targetMembershipId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe("Member not found.");
    });
  });

  // =========================================================================
  // 4. INVITATION CREATION & RBAC
  // =========================================================================
  describe("POST /api/v1/organizations/:organizationId/invitations", () => {
    it("should allow OWNER to issue an invitation for ADMIN", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        ownerMembership as never,
      );
      vi.spyOn(prisma.organizationMembership, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.organizationInvitation, "updateMany").mockResolvedValue({ count: 0 });

      vi.spyOn(prisma.organizationInvitation, "create").mockImplementation(((args: {
        data: { email: string; role: OrganizationRole; tokenHash: string; expiresAt: Date };
      }) => ({
        id: targetInvitationId,
        organizationId: orgId,
        email: args.data.email,
        role: args.data.role,
        tokenHash: args.data.tokenHash,
        invitedById: ownerUser.id,
        expiresAt: args.data.expiresAt,
        createdAt: new Date(),
        invitedBy: ownerUser,
      })) as never);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "recruit@acme.com", role: "ADMIN" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe("recruit@acme.com");
      expect(response.body.data.role).toBe("ADMIN");
      expect(response.body.data.devRawToken).toBeDefined();

      // Check delivery adapter captured it
      const sent = devInvitationDelivery.getLatestInvitationForEmail("recruit@acme.com");
      expect(sent).toBeDefined();
    });

    it("should allow ADMIN to issue an invitation for MEMBER", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        adminMembership as never,
      );
      vi.spyOn(prisma.organizationMembership, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.organizationInvitation, "updateMany").mockResolvedValue({ count: 0 });

      vi.spyOn(prisma.organizationInvitation, "create").mockImplementation(((args: {
        data: { email: string; role: OrganizationRole; tokenHash: string; expiresAt: Date };
      }) => ({
        id: targetInvitationId,
        organizationId: orgId,
        email: args.data.email,
        role: args.data.role,
        tokenHash: args.data.tokenHash,
        invitedById: adminUser.id,
        expiresAt: args.data.expiresAt,
        createdAt: new Date(),
        invitedBy: adminUser,
      })) as never);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "member.candidate@acme.com", role: "MEMBER" });

      expect(response.status).toBe(201);
    });

    it("should reject invitation creation by regular MEMBER (403 Forbidden)", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        memberMembership as never,
      );

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ email: "new@acme.com", role: "MEMBER" });

      expect(response.status).toBe(403);
    });

    it("should reject invitations with role OWNER (422/400)", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        ownerMembership as never,
      );

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "new@acme.com", role: "OWNER" });

      expect(response.status).toBe(422);
    });

    it("should reject invitation if user is already a member (409 Conflict)", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        ownerMembership as never,
      );
      vi.spyOn(prisma.organizationMembership, "findFirst").mockResolvedValue({
        id: "existing-mem",
      } as never);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invitations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: memberUser.email, role: "MEMBER" });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain("already a member");
    });
  });

  // =========================================================================
  // 5. INVITATION LISTING & REVOCATION
  // =========================================================================
  describe("GET & DELETE /api/v1/organizations/:organizationId/invitations", () => {
    it("should list pending invitations without exposing token hashes", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        ownerMembership as never,
      );
      vi.spyOn(prisma.organizationInvitation, "count").mockResolvedValue(1);
      vi.spyOn(prisma.organizationInvitation, "findMany").mockResolvedValue([
        {
          id: targetInvitationId,
          organizationId: orgId,
          email: "pending@acme.com",
          role: OrganizationRole.MEMBER,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          tokenHash: "super-secret-sha256-hash",
          invitedBy: ownerUser,
        },
      ] as never);

      const response = await request(app)
        .get(`/api/v1/organizations/${orgId}/invitations`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.items[0].email).toBe("pending@acme.com");
      expect(response.body.data.items[0].tokenHash).toBeUndefined();
    });

    it("should allow OWNER or ADMIN to revoke an invitation", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique")
        .mockResolvedValueOnce(ownerMembership as never) // requireOrgMember
        .mockResolvedValueOnce(ownerMembership as never); // service

      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue({
        id: targetInvitationId,
        organizationId: orgId,
        acceptedAt: null,
        revokedAt: null,
      } as never);

      vi.spyOn(prisma.organizationInvitation, "update").mockResolvedValue({} as never);

      const response = await request(app)
        .delete(`/api/v1/organizations/${orgId}/invitations/${targetInvitationId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.message).toBe("Invitation revoked successfully.");
    });
  });

  // =========================================================================
  // 6. INVITATION ACCEPTANCE & EDGE CASES
  // =========================================================================
  describe("POST /api/v1/invitations/accept", () => {
    const rawToken = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const hashed = hashToken(rawToken);

    const validInvitationRecord = {
      id: targetInvitationId,
      organizationId: orgId,
      email: inviteeUser.email,
      role: OrganizationRole.ADMIN,
      tokenHash: hashed,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      organization: sampleOrg,
    };

    it("should successfully accept invitation and create membership atomically", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue(
        validInvitationRecord as never,
      );
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(null);

      vi.spyOn(prisma, "$transaction").mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) => {
          return callback(prisma);
        },
      );

      vi.spyOn(prisma.organizationMembership, "create").mockResolvedValue({
        id: "new-membership-uuid",
        userId: inviteeUser.id,
        organizationId: orgId,
        role: OrganizationRole.ADMIN,
        createdAt: new Date(),
      } as never);

      vi.spyOn(prisma.organizationInvitation, "update").mockResolvedValue({
        ...validInvitationRecord,
        acceptedAt: new Date(),
      } as never);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.membership.role).toBe("ADMIN");
      expect(response.body.data.organization.name).toBe(sampleOrg.name);
    });

    it("should return 403 Forbidden when authenticated user email does not match invited email", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue(
        validInvitationRecord as never,
      );

      // Caller is memberUser, but invite is for inviteeUser
      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain("different email address");
    });

    it("should return 400 Bad Request for expired tokens", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue({
        ...validInvitationRecord,
        expiresAt: new Date(Date.now() - 1000), // Expired
      } as never);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("expired");
    });

    it("should return 400 Bad Request for revoked tokens", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue({
        ...validInvitationRecord,
        revokedAt: new Date(),
      } as never);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("revoked");
    });

    it("should return 400 Bad Request for already accepted tokens (replay attack defense)", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue({
        ...validInvitationRecord,
        acceptedAt: new Date(),
      } as never);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("already been accepted");
    });

    it("should return 409 Conflict if user is already a member (duplicate prevention)", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue(
        validInvitationRecord as never,
      );
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue({
        id: "already-member",
      } as never);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain("already a member");
    });

    it("should allow public inspection of valid invitation details without authentication", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue({
        ...validInvitationRecord,
        invitedBy: ownerUser,
      } as never);

      const response = await request(app).get(`/api/v1/invitations/details/${rawToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.organization.name).toBe(sampleOrg.name);
      expect(response.body.data.role).toBe("ADMIN");
      expect(response.body.data.invitedBy.name).toBe(ownerUser.name);
    });

    it("should allow an authenticated user to list invitations received by their email", async () => {
      vi.spyOn(prisma.organizationInvitation, "findMany").mockResolvedValue([
        {
          ...validInvitationRecord,
          invitedBy: ownerUser,
        },
      ] as never);

      const response = await request(app)
        .get("/api/v1/invitations/received")
        .set("Authorization", `Bearer ${inviteeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].organization.name).toBe(sampleOrg.name);
    });

    it("should allow an authenticated recipient to accept invitation by invitationId", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique")
        .mockResolvedValueOnce(null) // by tokenHash
        .mockResolvedValueOnce(validInvitationRecord as never); // by ID
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(null);

      vi.spyOn(prisma, "$transaction").mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) => {
          return callback(prisma);
        },
      );

      vi.spyOn(prisma.organizationMembership, "create").mockResolvedValue({
        id: "new-membership-uuid",
        userId: inviteeUser.id,
        organizationId: orgId,
        role: OrganizationRole.ADMIN,
        createdAt: new Date(),
      } as never);

      vi.spyOn(prisma.organizationInvitation, "update").mockResolvedValue({
        ...validInvitationRecord,
        acceptedAt: new Date(),
      } as never);

      const response = await request(app)
        .post("/api/v1/invitations/accept")
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ invitationId: targetInvitationId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.membership.role).toBe("ADMIN");
      expect(response.body.data.organization.name).toBe(sampleOrg.name);
    });

    it("should allow an authenticated recipient to reject an invitation", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue(
        validInvitationRecord as never,
      );
      vi.spyOn(prisma.organizationInvitation, "update").mockResolvedValue({
        ...validInvitationRecord,
        revokedAt: new Date(),
      } as never);

      const response = await request(app)
        .post("/api/v1/invitations/reject")
        .set("Authorization", `Bearer ${inviteeToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain("rejected");
    });

    it("should return 403 Forbidden when a user tries to reject someone else's invitation", async () => {
      vi.spyOn(prisma.organizationInvitation, "findUnique").mockResolvedValue(
        validInvitationRecord as never,
      );

      const response = await request(app)
        .post("/api/v1/invitations/reject")
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ token: rawToken });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain("different email address");
    });
  });
});
