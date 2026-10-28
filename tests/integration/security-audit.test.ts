import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { OrganizationRole, Prisma } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken, signRefreshToken, hashToken } from "../../src/common/utils/token.util";
import { InventoryTransactionType } from "../../src/modules/inventory/inventory.types";
import { PurchaseOrderStatus } from "../../src/modules/procurement/purchase-orders/purchase-order.types";

describe("Production Security Audit & Multi-Tenant Hardening (Integration)", () => {
  // Tenant A
  const orgAId = "550e8400-e29b-41d4-a716-446655440001";
  const orgA = {
    id: orgAId,
    name: "Org Alpha",
    slug: "org-alpha",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  // Tenant B
  const orgBId = "550e8400-e29b-41d4-a716-446655440002";
  const orgB = {
    id: orgBId,
    name: "Org Beta",
    slug: "org-beta",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  // Users
  const userOrgAOwner = {
    id: "550e8400-e29b-41d4-a716-446655440010",
    email: "alice-owner@alpha.io",
    name: "Alice Owner",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const userOrgAMember = {
    id: "550e8400-e29b-41d4-a716-446655440011",
    email: "charlie-member@alpha.io",
    name: "Charlie Member",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const userOrgBOwner = {
    id: "550e8400-e29b-41d4-a716-446655440020",
    email: "bob-owner@beta.io",
    name: "Bob Owner",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const userDeactivated = {
    id: "550e8400-e29b-41d4-a716-446655440099",
    email: "deactivated@alpha.io",
    name: "Deactivated Dan",
    status: "INACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  // Resources in Org A
  const warehouseA = {
    id: "550e8400-e29b-41d4-a716-446655440101",
    organizationId: orgAId,
    code: "WH-A",
    name: "Warehouse Alpha",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const locationA1 = {
    id: "550e8400-e29b-41d4-a716-446655440201",
    organizationId: orgAId,
    warehouseId: warehouseA.id,
    code: "LOC-A1",
    name: "Location A1",
    status: "ACTIVE",
    warehouse: warehouseA,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const productA = {
    id: "550e8400-e29b-41d4-a716-446655440301",
    organizationId: orgAId,
    sku: "SKU-A-01",
    name: "Widget Alpha",
    unitOfMeasure: "UNIT",
    status: "ACTIVE",
    lowStockThreshold: 10,
    costPrice: new Prisma.Decimal("15.00"),
    sellingPrice: new Prisma.Decimal("25.00"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const supplierA = {
    id: "550e8400-e29b-41d4-a716-446655440401",
    organizationId: orgAId,
    name: "Alpha Supplier Co",
    isActive: true,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  // Resources in Org B
  const warehouseB = {
    id: "550e8400-e29b-41d4-a716-446655440102",
    organizationId: orgBId,
    code: "WH-B",
    name: "Warehouse Beta",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const locationB1 = {
    id: "550e8400-e29b-41d4-a716-446655440203",
    organizationId: orgBId,
    warehouseId: warehouseB.id,
    code: "LOC-B1",
    name: "Location B1",
    status: "ACTIVE",
    warehouse: warehouseB,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const productB = {
    id: "550e8400-e29b-41d4-a716-446655440302",
    organizationId: orgBId,
    sku: "SKU-B-01",
    name: "Gadget Beta",
    unitOfMeasure: "UNIT",
    status: "ACTIVE",
    lowStockThreshold: 5,
    costPrice: new Prisma.Decimal("30.00"),
    sellingPrice: new Prisma.Decimal("50.00"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const supplierB = {
    id: "550e8400-e29b-41d4-a716-446655440402",
    organizationId: orgBId,
    name: "Beta Supplier Co",
    isActive: true,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  let tokenOrgAOwner: string;
  let tokenOrgAMember: string;
  let tokenOrgBOwner: string;
  let tokenDeactivated: string;

  beforeEach(() => {
    vi.restoreAllMocks();

    tokenOrgAOwner = signAccessToken({
      sub: userOrgAOwner.id,
      email: userOrgAOwner.email,
      name: userOrgAOwner.name,
    });

    tokenOrgAMember = signAccessToken({
      sub: userOrgAMember.id,
      email: userOrgAMember.email,
      name: userOrgAMember.name,
    });

    tokenOrgBOwner = signAccessToken({
      sub: userOrgBOwner.id,
      email: userOrgBOwner.email,
      name: userOrgBOwner.name,
    });

    tokenDeactivated = signAccessToken({
      sub: userDeactivated.id,
      email: userDeactivated.email,
      name: userDeactivated.name,
    });

    // Default User lookup mock
    vi.spyOn(prisma.user, "findUnique").mockImplementation(((args: { where: { id: string } }) => {
      const id = args.where.id;
      if (id === userOrgAOwner.id) return userOrgAOwner as never;
      if (id === userOrgAMember.id) return userOrgAMember as never;
      if (id === userOrgBOwner.id) return userOrgBOwner as never;
      if (id === userDeactivated.id) return userDeactivated as never;
      return null;
    }) as never);

    // Default Org Membership lookup mock
    vi.spyOn(prisma.organizationMembership, "findUnique").mockImplementation(((args: {
      where: { userId_organizationId?: { userId: string; organizationId: string } };
    }) => {
      const comp = args.where?.userId_organizationId;
      if (!comp) return null;

      if (comp.organizationId === orgAId && comp.userId === userOrgAOwner.id) {
        return {
          id: "mem-a-owner",
          userId: userOrgAOwner.id,
          organizationId: orgAId,
          role: OrganizationRole.OWNER,
          organization: orgA,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
        } as never;
      }
      if (comp.organizationId === orgAId && comp.userId === userOrgAMember.id) {
        return {
          id: "mem-a-member",
          userId: userOrgAMember.id,
          organizationId: orgAId,
          role: OrganizationRole.MEMBER,
          organization: orgA,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
        } as never;
      }
      if (comp.organizationId === orgBId && comp.userId === userOrgBOwner.id) {
        return {
          id: "mem-b-owner",
          userId: userOrgBOwner.id,
          organizationId: orgBId,
          role: OrganizationRole.OWNER,
          organization: orgB,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
        } as never;
      }
      return null;
    }) as never);

    // Default Transaction mock
    vi.spyOn(prisma, "$transaction").mockImplementation(async (cb) => {
      if (typeof cb === "function") {
        return cb(prisma as never);
      }
      return cb as never;
    });

    // Mock Audit Log creation
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({
      id: "audit-1",
      organizationId: orgAId,
      actorUserId: userOrgAOwner.id,
      action: "INVENTORY_MUTATION",
      resourceType: "INVENTORY",
      resourceId: "res-1",
      metadata: null,
      requestId: "req-1",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      createdAt: new Date(),
    } as never);
  });

  // =========================================================================
  // 1. Multi-Tenant Isolation & Anti-IDOR Non-Disclosure
  // =========================================================================
  describe("Multi-Tenant Isolation & Anti-IDOR Non-Disclosure", () => {
    it("should return 404 Not Found when a user attempts to access an organization they do not belong to", async () => {
      // Bob (Org B) requests Org A's inventory balances
      const response = await request(app)
        .get(`/api/v1/organizations/${orgAId}/inventory/balances`)
        .set("Authorization", `Bearer ${tokenOrgBOwner}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("NOT_FOUND");
      // Must not leak existence of Org A
      expect(response.body.error.message).toContain("Organization not found");
    });

    it("should reject cross-tenant stock receipts with 404 when product belongs to another tenant", async () => {
      // Mock product lookup: Org B's product does not exist in Org A
      vi.spyOn(prisma.product, "findFirst").mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/inventory/receipts`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`)
        .send({
          productId: productB.id, // belongs to Org B!
          locationId: locationA1.id,
          quantity: "50.0000",
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("Product not found in this organization");
    });

    it("should reject cross-tenant stock transfers with 404 when destination location belongs to another tenant", async () => {
      // Product exists in Org A
      vi.spyOn(prisma.product, "findFirst").mockResolvedValueOnce(productA as never);
      // Source location exists in Org A
      vi.spyOn(prisma.storageLocation, "findFirst").mockImplementation(((args: {
        where?: { id?: string; organizationId?: string };
      }) => {
        if (args?.where?.id === locationA1.id && args.where.organizationId === orgAId) {
          return Promise.resolve(locationA1);
        }
        // Destination locationB1 does not belong to Org A
        return Promise.resolve(null);
      }) as never);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/inventory/transfers`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`)
        .send({
          productId: productA.id,
          sourceLocationId: locationA1.id,
          destinationLocationId: locationB1.id, // belongs to Org B!
          quantity: "10.0000",
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain(
        "Destination storage location not found in this organization",
      );
    });

    it("should reject purchase order creation with 404 when supplier belongs to another tenant", async () => {
      // Supplier lookup in Org A returns null
      vi.spyOn(prisma.supplier, "findFirst").mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/purchase-orders`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`)
        .send({
          supplierId: supplierB.id, // belongs to Org B!
          items: [
            {
              productId: productA.id,
              quantityOrdered: 10,
              unitCost: 15.0,
            },
          ],
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("Supplier not found in this organization");
    });

    it("should reject purchase order item receipt into a location belonging to another tenant with 404", async () => {
      const samplePO = {
        id: "550e8400-e29b-41d4-a716-446655440501",
        organizationId: orgAId,
        orderNumber: "PO-20261028-0001",
        status: PurchaseOrderStatus.APPROVED,
        items: [
          {
            id: "po-item-1",
            productId: productA.id,
            quantityOrdered: new Prisma.Decimal("10.0000"),
            quantityReceived: new Prisma.Decimal("0.0000"),
          },
        ],
      };

      vi.spyOn(prisma.purchaseOrder, "findFirst").mockResolvedValueOnce(samplePO as never);
      // Location check: locationB1 not found in Org A
      vi.spyOn(prisma.storageLocation, "findFirst").mockResolvedValueOnce(null);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/purchase-orders/${samplePO.id}/receipts`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`)
        .send({
          locationId: locationB1.id, // belongs to Org B!
          items: [
            {
              productId: productA.id,
              quantity: 5,
            },
          ],
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain(
        "Storage location not found in this organization",
      );
    });

    it("should return 404 when marking a notification belonging to another user as read", async () => {
      // Notification belongs to Bob, Alice attempts to mark it
      vi.spyOn(prisma.notification, "findFirst").mockResolvedValueOnce(null);

      const foreignNotificationId = "550e8400-e29b-41d4-a716-446655440701";
      const response = await request(app)
        .patch(`/api/v1/notifications/${foreignNotificationId}/read`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("Notification not found");
    });

    it("should return 404 when attempting to fetch a forecast run belonging to another organization", async () => {
      const foreignForecastId = "550e8400-e29b-41d4-a716-446655440801";
      vi.spyOn(prisma.demandForecastRun, "findFirst").mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/v1/organizations/${orgAId}/forecasts/demand/${foreignForecastId}`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("Demand forecast run not found");
    });

    it("should return 404 when attempting to view an anomaly finding belonging to another organization", async () => {
      const foreignAnomalyId = "550e8400-e29b-41d4-a716-446655440802";
      vi.spyOn(prisma.inventoryAnomaly, "findFirst").mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/v1/organizations/${orgAId}/anomalies/${foreignAnomalyId}`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("Anomaly finding not found");
    });

    it("should reject cross-tenant Copilot chat queries with 404", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/copilot/chat`)
        .set("Authorization", `Bearer ${tokenOrgBOwner}`) // Bob from Org B
        .send({ message: "What is my stock level?" });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("Organization not found");
    });

    it("should reject unauthenticated Copilot chat queries with 401 Unauthorized", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/copilot/chat`)
        .send({ message: "What is my stock level?" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // =========================================================================
  // 2. Authentication & Session Security
  // =========================================================================
  describe("Authentication & Session Security", () => {
    it("should reject an inactive or deactivated user immediately with 401 Unauthorized", async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${orgAId}/inventory/balances`)
        .set("Authorization", `Bearer ${tokenDeactivated}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should detect refresh token reuse and invalidate the entire token family", async () => {
      const familyId = "fam-security-audit-001";
      const stolenToken = signRefreshToken({
        sub: userOrgAOwner.id,
        familyId,
        jti: "jti-stolen-1",
      });
      const stolenTokenHash = hashToken(stolenToken);

      // The token in DB is already revoked (it was previously rotated)
      vi.spyOn(prisma.refreshToken, "findUnique").mockResolvedValueOnce({
        id: "rt-revoked",
        tokenHash: stolenTokenHash,
        userId: userOrgAOwner.id,
        familyId,
        revokedAt: new Date(Date.now() - 60000), // Already revoked!
        expiresAt: new Date(Date.now() + 1000000),
        replacedByTokenHash: "new-hash-xyz",
        createdAt: new Date(),
      } as never);

      const updateManySpy = vi.spyOn(prisma.refreshToken, "updateMany").mockResolvedValueOnce({
        count: 3,
      });

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`stockpilot_refresh_token=${stolenToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHORIZED");

      // Verify that the whole family was revoked
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it("should never expose password hashes in API responses", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${tokenOrgAOwner}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.password).toBeUndefined();
      expect(response.body.data.passwordHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. RBAC & Privilege Escalation Prevention
  // =========================================================================
  describe("RBAC & Privilege Escalation Prevention", () => {
    it("should prevent regular MEMBER from performing stock receipts with 403 Forbidden", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/inventory/receipts`)
        .set("Authorization", `Bearer ${tokenOrgAMember}`)
        .send({
          productId: productA.id,
          locationId: locationA1.id,
          quantity: "25.0000",
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(response.body.error.message).toContain("permission");
    });

    it("should prevent regular MEMBER from creating purchase orders with 403 Forbidden", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/purchase-orders`)
        .set("Authorization", `Bearer ${tokenOrgAMember}`)
        .send({
          supplierId: supplierA.id,
          items: [
            {
              productId: productA.id,
              quantityOrdered: 5,
              unitCost: 10,
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("should prevent regular MEMBER from accessing audit logs with 403 Forbidden", async () => {
      const response = await request(app)
        .get(`/api/v1/organizations/${orgAId}/audit-logs`)
        .set("Authorization", `Bearer ${tokenOrgAMember}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("should prevent regular MEMBER from triggering anomaly detection runs with 403 Forbidden", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/anomalies/detection-runs`)
        .set("Authorization", `Bearer ${tokenOrgAMember}`)
        .send({ windowDays: 30 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // 4. Ledger Immutability & Business Invariants
  // =========================================================================
  describe("Ledger Immutability & Business Invariants", () => {
    it("should reject any attempts to update or delete inventory transactions with 404 (strictly immutable)", async () => {
      const fakeTxId = "550e8400-e29b-41d4-a716-446655440999";

      const putRes = await request(app)
        .put(`/api/v1/organizations/${orgAId}/inventory/transactions/${fakeTxId}`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`)
        .send({ quantity: 100 });
      expect(putRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete(`/api/v1/organizations/${orgAId}/inventory/transactions/${fakeTxId}`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`);
      expect(deleteRes.status).toBe(404);
    });

    it("should reject stock issue when insufficient stock is available (preventing negative inventory)", async () => {
      vi.spyOn(prisma.product, "findFirst").mockResolvedValueOnce(productA as never);
      vi.spyOn(prisma.storageLocation, "findFirst").mockResolvedValueOnce(locationA1 as never);

      // Available stock is only 5, but requested issue is 20
      vi.spyOn(prisma.inventoryBalance, "findUnique").mockResolvedValueOnce({
        id: "bal-1",
        organizationId: orgAId,
        productId: productA.id,
        locationId: locationA1.id,
        quantityOnHand: new Prisma.Decimal("5.0000"),
      } as never);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/inventory/issues`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`)
        .send({
          productId: productA.id,
          locationId: locationA1.id,
          quantity: "20.0000",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("Insufficient stock at location");
    });

    it("should return 409 Conflict when an idempotency key is reused with a different mutation payload", async () => {
      const idempotencyKey = "idemp-audit-conflict-123";

      // Existing transaction recorded with different hash
      vi.spyOn(prisma.inventoryTransaction, "findUnique").mockResolvedValueOnce({
        id: "tx-existing",
        organizationId: orgAId,
        idempotencyKey,
        requestHash: "original-deterministic-hash-abc",
        type: InventoryTransactionType.RECEIPT,
        quantity: new Prisma.Decimal("10.0000"),
        quantityDelta: new Prisma.Decimal("10.0000"),
        createdAt: new Date(),
        product: productA,
        warehouse: warehouseA,
        destinationLocation: locationA1,
        performedByUser: userOrgAOwner,
      } as never);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgAId}/inventory/receipts`)
        .set("Authorization", `Bearer ${tokenOrgAOwner}`)
        .send({
          productId: productA.id,
          locationId: locationA1.id,
          quantity: "99.0000", // different quantity changes request hash!
          idempotencyKey,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("CONFLICT");
      expect(response.body.error.message).toContain(
        "Idempotency key has already been used with a different request payload",
      );
    });
  });

  // =========================================================================
  // 5. Infrastructure & Headers Security
  // =========================================================================
  describe("Infrastructure & Headers Security", () => {
    it("should strip x-powered-by header and apply security headers", async () => {
      const response = await request(app).get("/health/live");

      expect(response.headers["x-powered-by"]).toBeUndefined();
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBeDefined();
    });

    it("should reject cross-origin requests from disallowed origins via CORS policy", async () => {
      const response = await request(app)
        .get("/health/live")
        .set("Origin", "http://malicious-attacker-site.com");

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(response.body.error.message).toContain("security policy");
    });

    it("should handle malformed JSON bodies gracefully with 400 Bad Request", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .set("Content-Type", "application/json")
        .send("{ broken json: ");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toContain("Malformed JSON payload");
    });
  });
});
