import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { OrganizationRole, type Organization, type OrganizationMembership } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";

type MembershipWithOrg = OrganizationMembership & { organization: Organization };

describe("Organizations & Multi-Tenancy API (Integration)", () => {
  const callerUser = {
    id: "usr-caller-123",
    email: "sarah.connor@stockpilot.ai",
    name: "Sarah Connor",
    status: "ACTIVE",
  };

  const sampleOrgId = "550e8400-e29b-41d4-a716-446655440000";

  const sampleOrg: Organization = {
    id: sampleOrgId,
    name: "Cyberdyne Supply Chain",
    slug: "cyberdyne-supply-chain",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const ownerMembership: MembershipWithOrg = {
    id: "mem-owner-1",
    userId: callerUser.id,
    organizationId: sampleOrgId,
    role: OrganizationRole.OWNER,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    organization: sampleOrg,
  };

  const regularMemberMembership: MembershipWithOrg = {
    ...ownerMembership,
    id: "mem-regular-2",
    role: OrganizationRole.MEMBER,
  };

  let validToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    validToken = signAccessToken({
      sub: callerUser.id,
      email: callerUser.email,
      name: callerUser.name,
    });

    // Mock authenticate middleware's user lookup
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(callerUser as never);
  });

  describe("POST /api/v1/organizations", () => {
    it("should successfully create an organization and assign caller as OWNER", async () => {
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce(null);
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) => {
        return (callback as (tx: unknown) => Promise<unknown>)(prisma);
      });
      vi.spyOn(prisma.organization, "create").mockResolvedValueOnce(sampleOrg);
      vi.spyOn(prisma.organizationMembership, "create").mockResolvedValueOnce(ownerMembership);

      const response = await request(app)
        .post("/api/v1/organizations")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ name: "Cyberdyne Supply Chain" });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          organization: {
            id: sampleOrgId,
            name: "Cyberdyne Supply Chain",
            slug: "cyberdyne-supply-chain",
            status: "ACTIVE",
          },
          role: "OWNER",
        },
        timestamp: expect.any(String),
      });
    });

    it("should return 422 Unprocessable Entity when organization name is too short", async () => {
      const response = await request(app)
        .post("/api/v1/organizations")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ name: "A" }); // Min length 2

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 401 Unauthorized when auth token is missing", async () => {
      const response = await request(app)
        .post("/api/v1/organizations")
        .send({ name: "Unauthorized Org" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/v1/organizations", () => {
    it("should return caller's organizations with pagination metadata", async () => {
      vi.spyOn(prisma.organizationMembership, "count").mockResolvedValueOnce(1);
      vi.spyOn(prisma.organizationMembership, "findMany").mockResolvedValueOnce([ownerMembership]);

      const response = await request(app)
        .get("/api/v1/organizations?page=1&limit=10")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: sampleOrgId,
        name: "Cyberdyne Supply Chain",
        role: "OWNER",
      });
      expect(response.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe("GET /api/v1/organizations/:organizationId", () => {
    it("should return organization details for an active member", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValueOnce(ownerMembership);

      const response = await request(app)
        .get(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.organization.id).toBe(sampleOrgId);
      expect(response.body.data.role).toBe("OWNER");
    });

    it("should return 404 Not Found if caller is not a member (IDOR prevention)", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 422 Unprocessable Entity for invalid organization UUID format", async () => {
      const response = await request(app)
        .get("/api/v1/organizations/not-a-valid-uuid")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PATCH /api/v1/organizations/:organizationId", () => {
    it("should allow an OWNER to update organization name", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValueOnce(ownerMembership);
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce(null);
      vi.spyOn(prisma.organization, "update").mockResolvedValueOnce({
        ...sampleOrg,
        name: "Cyberdyne Global Logistics",
        slug: "cyberdyne-global-logistics",
      });

      const response = await request(app)
        .patch(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ name: "Cyberdyne Global Logistics" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.organization.name).toBe("Cyberdyne Global Logistics");
    });

    it("should return 403 Forbidden when a regular MEMBER attempts to update", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValueOnce(
        regularMemberMembership,
      );

      const response = await request(app)
        .patch(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ name: "Renamed by Member" });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(response.body.error.message).toMatch(/owners/i);
    });

    it("should return 422 Unprocessable Entity when request contains unsupported fields", async () => {
      const response = await request(app)
        .patch(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          name: "Cyberdyne",
          unsupportedField: "malicious_payload",
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("DELETE /api/v1/organizations/:organizationId", () => {
    it("should allow an OWNER to safely deactivate the organization", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValueOnce(ownerMembership);
      vi.spyOn(prisma.organization, "update").mockResolvedValueOnce({
        ...sampleOrg,
        status: "DEACTIVATED",
      });

      const response = await request(app)
        .delete(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toMatch(/deactivated/i);
      expect(response.body.data.organizationId).toBe(sampleOrgId);
    });

    it("should return 403 Forbidden when a MEMBER attempts to deactivate", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValueOnce(
        regularMemberMembership,
      );

      const response = await request(app)
        .delete(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("should return 404 Not Found when non-member attempts to deactivate", async () => {
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValueOnce(null);

      const response = await request(app)
        .delete(`/api/v1/organizations/${sampleOrgId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });
});

