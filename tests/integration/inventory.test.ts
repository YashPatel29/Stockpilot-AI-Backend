import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { OrganizationRole, Prisma } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";

describe("Feature 6: Inventory Transactions and Stock Balances (Integration)", () => {
  const orgId = "550e8400-e29b-41d4-a716-446655440001";
  const otherOrgId = "550e8400-e29b-41d4-a716-446655440002";

  const ownerUser = {
    id: "550e8400-e29b-41d4-a716-446655440010",
    email: "owner@stockpilot.io",
    name: "Owner Alice",
    status: "ACTIVE",
  };

  const adminUser = {
    id: "550e8400-e29b-41d4-a716-446655440020",
    email: "admin@stockpilot.io",
    name: "Admin Bob",
    status: "ACTIVE",
  };

  const memberUser = {
    id: "550e8400-e29b-41d4-a716-446655440030",
    email: "member@stockpilot.io",
    name: "Member Charlie",
    status: "ACTIVE",
  };

  const externalUser = {
    id: "550e8400-e29b-41d4-a716-446655440040",
    email: "external@stockpilot.io",
    name: "External Eve",
    status: "ACTIVE",
  };

  const sampleOrg = {
    id: orgId,
    name: "Alpha Corp Logistics",
    slug: "alpha-corp-logistics",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleOtherOrg = {
    id: otherOrgId,
    name: "Beta Global Supply",
    slug: "beta-global-supply",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let externalToken: string;

  const prodId1 = "550e8400-e29b-41d4-a716-446655440101";
  const foreignProdId = "550e8400-e29b-41d4-a716-446655440102";
  const whId1 = "550e8400-e29b-41d4-a716-446655440201";
  const locId1 = "550e8400-e29b-41d4-a716-446655440301";
  const locId2 = "550e8400-e29b-41d4-a716-446655440302";
  const foreignLocId = "550e8400-e29b-41d4-a716-446655440399";

  const sampleProduct = {
    id: prodId1,
    organizationId: orgId,
    categoryId: null,
    sku: "WIDGET-01",
    name: "Standard Widget",
    description: "Standard industrial widget",
    unitOfMeasure: "PCS",
    costPrice: new Prisma.Decimal("10.0000"),
    sellingPrice: new Prisma.Decimal("25.0000"),
    lowStockThreshold: 5,
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleForeignProduct = {
    id: foreignProdId,
    organizationId: otherOrgId,
    categoryId: null,
    sku: "FOREIGN-SKU",
    name: "Foreign Widget",
    description: null,
    unitOfMeasure: "PCS",
    costPrice: new Prisma.Decimal("10.0000"),
    sellingPrice: new Prisma.Decimal("20.0000"),
    lowStockThreshold: 0,
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleWarehouse = {
    id: whId1,
    organizationId: orgId,
    code: "WH-NYC",
    name: "New York Hub",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleLocation1 = {
    id: locId1,
    organizationId: orgId,
    warehouseId: whId1,
    code: "LOC-A1",
    name: "Aisle A, Shelf 1",
    type: "SHELF",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    warehouse: sampleWarehouse,
  };

  const sampleLocation2 = {
    id: locId2,
    organizationId: orgId,
    warehouseId: whId1,
    code: "LOC-B2",
    name: "Aisle B, Shelf 2",
    type: "SHELF",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    warehouse: sampleWarehouse,
  };

  const sampleForeignLocation = {
    id: foreignLocId,
    organizationId: otherOrgId,
    warehouseId: "foreign-wh-id",
    code: "FOR-01",
    name: "Foreign Bin",
    type: "BIN",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    warehouse: {
      id: "foreign-wh-id",
      organizationId: otherOrgId,
      code: "FOR-WH",
      name: "Foreign WH",
      status: "ACTIVE",
    },
  };

  interface BalanceRecord {
    id: string;
    organizationId: string;
    productId: string;
    warehouseId: string;
    locationId: string;
    quantityOnHand: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }

  interface TransactionRecord {
    id: string;
    organizationId: string;
    productId: string;
    warehouseId: string | null;
    type: string;
    quantity: Prisma.Decimal;
    quantityDelta: Prisma.Decimal;
    sourceLocationId: string | null;
    destinationLocationId: string | null;
    reason: string | null;
    reference: string | null;
    notes: string | null;
    idempotencyKey: string | null;
    requestHash: string | null;
    performedByUserId: string;
    createdAt: Date;
  }

  let balancesStore: BalanceRecord[] = [];
  let transactionsStore: TransactionRecord[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    balancesStore = [];
    transactionsStore = [];

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
    externalToken = signAccessToken({
      sub: externalUser.id,
      email: externalUser.email,
      name: externalUser.name,
    });

    // Mock authenticate middleware
    vi.spyOn(prisma.user, "findUnique").mockImplementation(((args: { where: { id?: string } }) => {
      const id = args.where.id;
      if (id === ownerUser.id) return Promise.resolve(ownerUser);
      if (id === adminUser.id) return Promise.resolve(adminUser);
      if (id === memberUser.id) return Promise.resolve(memberUser);
      if (id === externalUser.id) return Promise.resolve(externalUser);
      return Promise.resolve(null);
    }) as never);

    // Mock requireOrgMember middleware
    vi.spyOn(prisma.organizationMembership, "findUnique").mockImplementation(((args: {
      where: { userId_organizationId: { userId: string; organizationId: string } };
    }) => {
      const { userId, organizationId } = args.where.userId_organizationId;

      if (organizationId === orgId) {
        if (userId === ownerUser.id) {
          return Promise.resolve({
            id: "mem-owner-1",
            userId: ownerUser.id,
            organizationId: orgId,
            role: OrganizationRole.OWNER,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
        if (userId === adminUser.id) {
          return Promise.resolve({
            id: "mem-admin-2",
            userId: adminUser.id,
            organizationId: orgId,
            role: OrganizationRole.ADMIN,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
        if (userId === memberUser.id) {
          return Promise.resolve({
            id: "mem-member-3",
            userId: memberUser.id,
            organizationId: orgId,
            role: OrganizationRole.MEMBER,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
      }

      if (organizationId === otherOrgId && userId === externalUser.id) {
        return Promise.resolve({
          id: "mem-external-4",
          userId: externalUser.id,
          organizationId: otherOrgId,
          role: OrganizationRole.ADMIN,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
          organization: sampleOtherOrg,
        });
      }

      return Promise.resolve(null);
    }) as never);

    // Mock prisma.$transaction
    vi.spyOn(prisma, "$transaction").mockImplementation(((action: unknown) => {
      if (typeof action === "function") {
        return (action as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return Promise.all(action as Array<Promise<unknown>>);
    }) as never);

    // Mock prisma.product
    vi.spyOn(prisma.product, "findFirst").mockImplementation(((args: {
      where: { id?: string; organizationId?: string };
    }) => {
      if (args.where.id === prodId1 && args.where.organizationId === orgId) {
        return Promise.resolve(sampleProduct);
      }
      if (args.where.id === foreignProdId && args.where.organizationId === otherOrgId) {
        return Promise.resolve(sampleForeignProduct);
      }
      return Promise.resolve(null);
    }) as never);

    // Mock prisma.storageLocation
    vi.spyOn(prisma.storageLocation, "findFirst").mockImplementation(((args: {
      where: { id?: string; organizationId?: string };
    }) => {
      if (args.where.id === locId1 && args.where.organizationId === orgId) {
        return Promise.resolve(sampleLocation1);
      }
      if (args.where.id === locId2 && args.where.organizationId === orgId) {
        return Promise.resolve(sampleLocation2);
      }
      if (args.where.id === foreignLocId && args.where.organizationId === otherOrgId) {
        return Promise.resolve(sampleForeignLocation);
      }
      return Promise.resolve(null);
    }) as never);

    // Mock prisma.inventoryBalance
    vi.spyOn(prisma.inventoryBalance, "findUnique").mockImplementation(((args: {
      where: { productId_locationId: { productId: string; locationId: string } };
    }) => {
      const { productId, locationId } = args.where.productId_locationId;
      const match = balancesStore.find(
        (b) => b.productId === productId && b.locationId === locationId,
      );
      if (!match) return Promise.resolve(null);
      return Promise.resolve({
        ...match,
        product: sampleProduct,
        warehouse: sampleWarehouse,
        location: match.locationId === locId1 ? sampleLocation1 : sampleLocation2,
      });
    }) as never);

    vi.spyOn(prisma.inventoryBalance, "findUniqueOrThrow").mockImplementation(((args: {
      where: { productId_locationId: { productId: string; locationId: string } };
    }) => {
      const { productId, locationId } = args.where.productId_locationId;
      const match = balancesStore.find(
        (b) => b.productId === productId && b.locationId === locationId,
      );
      if (!match) return Promise.reject(new Error("Record not found"));
      return Promise.resolve({
        ...match,
        product: sampleProduct,
        warehouse: sampleWarehouse,
        location: match.locationId === locId1 ? sampleLocation1 : sampleLocation2,
      });
    }) as never);

    vi.spyOn(prisma.inventoryBalance, "findMany").mockImplementation(((args?: {
      where?: { organizationId?: string; productId?: string };
    }) => {
      let filtered = [...balancesStore];
      if (args?.where?.organizationId) {
        filtered = filtered.filter((b) => b.organizationId === args.where!.organizationId);
      }
      if (args?.where?.productId) {
        filtered = filtered.filter((b) => b.productId === args.where!.productId);
      }
      return Promise.resolve(
        filtered.map((b) => ({
          ...b,
          product: sampleProduct,
          warehouse: sampleWarehouse,
          location: b.locationId === locId1 ? sampleLocation1 : sampleLocation2,
        })),
      );
    }) as never);

    vi.spyOn(prisma.inventoryBalance, "count").mockImplementation(((args?: {
      where?: { organizationId?: string };
    }) => {
      let filtered = [...balancesStore];
      if (args?.where?.organizationId) {
        filtered = filtered.filter((b) => b.organizationId === args.where!.organizationId);
      }
      return Promise.resolve(filtered.length);
    }) as never);

    vi.spyOn(prisma.inventoryBalance, "upsert").mockImplementation(((args: {
      where: { productId_locationId: { productId: string; locationId: string } };
      create: {
        organizationId: string;
        productId: string;
        warehouseId: string;
        locationId: string;
        quantityOnHand: Prisma.Decimal;
      };
      update: { quantityOnHand: { increment?: Prisma.Decimal } };
    }) => {
      const { productId, locationId } = args.where.productId_locationId;
      let record = balancesStore.find(
        (b) => b.productId === productId && b.locationId === locationId,
      );

      if (record) {
        if (args.update.quantityOnHand.increment) {
          record.quantityOnHand = record.quantityOnHand.add(args.update.quantityOnHand.increment);
        }
        record.updatedAt = new Date();
      } else {
        record = {
          id: randomUUID(),
          organizationId: args.create.organizationId,
          productId: args.create.productId,
          warehouseId: args.create.warehouseId,
          locationId: args.create.locationId,
          quantityOnHand: args.create.quantityOnHand,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        balancesStore.push(record);
      }

      return Promise.resolve({
        ...record,
        product: sampleProduct,
        warehouse: sampleWarehouse,
        location: record.locationId === locId1 ? sampleLocation1 : sampleLocation2,
      });
    }) as never);

    vi.spyOn(prisma.inventoryBalance, "updateMany").mockImplementation(((args: {
      where: { productId: string; locationId: string; quantityOnHand?: { gte?: Prisma.Decimal } };
      data: { quantityOnHand: { decrement?: Prisma.Decimal } };
    }) => {
      const match = balancesStore.find(
        (b) => b.productId === args.where.productId && b.locationId === args.where.locationId,
      );
      if (!match) return Promise.resolve({ count: 0 });

      if (
        args.where.quantityOnHand?.gte &&
        match.quantityOnHand.lt(args.where.quantityOnHand.gte)
      ) {
        return Promise.resolve({ count: 0 });
      }

      if (args.data.quantityOnHand.decrement) {
        match.quantityOnHand = match.quantityOnHand.sub(args.data.quantityOnHand.decrement);
        match.updatedAt = new Date();
      }

      return Promise.resolve({ count: 1 });
    }) as never);

    // Mock prisma.inventoryTransaction
    vi.spyOn(prisma.inventoryTransaction, "create").mockImplementation(((args: {
      data: {
        organizationId: string;
        productId: string;
        warehouseId?: string | null;
        type: string;
        quantity: Prisma.Decimal;
        quantityDelta: Prisma.Decimal;
        sourceLocationId?: string | null;
        destinationLocationId?: string | null;
        reason?: string | null;
        reference?: string | null;
        notes?: string | null;
        idempotencyKey?: string | null;
        requestHash?: string | null;
        performedByUserId: string;
      };
    }) => {
      const record: TransactionRecord = {
        id: randomUUID(),
        ...args.data,
        warehouseId: args.data.warehouseId ?? null,
        sourceLocationId: args.data.sourceLocationId ?? null,
        destinationLocationId: args.data.destinationLocationId ?? null,
        reason: args.data.reason ?? null,
        reference: args.data.reference ?? null,
        notes: args.data.notes ?? null,
        idempotencyKey: args.data.idempotencyKey ?? null,
        requestHash: args.data.requestHash ?? null,
        createdAt: new Date(),
      };
      transactionsStore.push(record);

      return Promise.resolve({
        ...record,
        product: sampleProduct,
        warehouse: sampleWarehouse,
        sourceLocation: record.sourceLocationId === locId1 ? sampleLocation1 : null,
        destinationLocation:
          record.destinationLocationId === locId1 ? sampleLocation1 : sampleLocation2,
        performedByUser: ownerUser,
      });
    }) as never);

    vi.spyOn(prisma.inventoryTransaction, "findUnique").mockImplementation(((args: {
      where: { organizationId_idempotencyKey: { organizationId: string; idempotencyKey: string } };
    }) => {
      const { organizationId, idempotencyKey } = args.where.organizationId_idempotencyKey;
      const match = transactionsStore.find(
        (t) => t.organizationId === organizationId && t.idempotencyKey === idempotencyKey,
      );
      if (!match) return Promise.resolve(null);
      return Promise.resolve({
        ...match,
        product: sampleProduct,
        warehouse: sampleWarehouse,
        destinationLocation: sampleLocation1,
        sourceLocation: sampleLocation1,
        performedByUser: ownerUser,
      });
    }) as never);

    vi.spyOn(prisma.inventoryTransaction, "findMany").mockImplementation(((args?: {
      where?: { organizationId?: string; type?: string };
    }) => {
      let filtered = [...transactionsStore];
      if (args?.where?.organizationId) {
        filtered = filtered.filter((t) => t.organizationId === args.where!.organizationId);
      }
      if (args?.where?.type) {
        filtered = filtered.filter((t) => t.type === args.where!.type);
      }
      return Promise.resolve(
        filtered.map((t) => ({
          ...t,
          product: sampleProduct,
          warehouse: sampleWarehouse,
          sourceLocation: t.sourceLocationId === locId1 ? sampleLocation1 : null,
          destinationLocation:
            t.destinationLocationId === locId1
              ? sampleLocation1
              : t.destinationLocationId === locId2
                ? sampleLocation2
                : null,
          performedByUser: ownerUser,
        })),
      );
    }) as never);

    vi.spyOn(prisma.inventoryTransaction, "count").mockImplementation(((args?: {
      where?: { organizationId?: string };
    }) => {
      let filtered = [...transactionsStore];
      if (args?.where?.organizationId) {
        filtered = filtered.filter((t) => t.organizationId === args.where!.organizationId);
      }
      return Promise.resolve(filtered.length);
    }) as never);
  });

  describe("Authentication & RBAC Isolation", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await request(app).get(`/api/v1/organizations/${orgId}/inventory/balances`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should reject non-member user with 404 Not Found (anti-IDOR)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/inventory/balances`)
        .set("Authorization", `Bearer ${externalToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should reject regular MEMBER from mutating stock with 403 Forbidden", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "10.0000",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("should allow MEMBER to view balances and transaction history (read-only)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/inventory/balances`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
    });
  });

  describe("Stock Receipts (POST /inventory/receipts)", () => {
    it("should allow OWNER and ADMIN to receive stock and create balance + ledger", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "25.0000",
          reference: "PO-1001",
          notes: "Initial inventory delivery",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balance.quantityOnHand).toBe("25.0000");
      expect(res.body.data.transaction.type).toBe("RECEIPT");
      expect(res.body.data.transaction.quantity).toBe("25.0000");
      expect(res.body.data.transaction.reference).toBe("PO-1001");
    });

    it("should reject receipt with negative or zero quantity with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "-10.0000",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should reject receipt with more than 4 decimal places with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "10.12345",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should reject cross-tenant product ID with 404 Not Found (anti-IDOR)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: foreignProdId,
          locationId: locId1,
          quantity: "5.0000",
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Stock Issues (POST /inventory/issues)", () => {
    beforeEach(() => {
      // Seed balance of 20
      balancesStore.push({
        id: randomUUID(),
        organizationId: orgId,
        productId: prodId1,
        warehouseId: whId1,
        locationId: locId1,
        quantityOnHand: new Prisma.Decimal("20.0000"),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("should atomically decrease balance and record ISSUE ledger", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/issues`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "5.0000",
          reason: "DAMAGED",
          reference: "ISSUE-1001",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balance.quantityOnHand).toBe("15.0000");
      expect(res.body.data.transaction.type).toBe("ISSUE");
      expect(res.body.data.transaction.quantity).toBe("5.0000");
    });

    it("should reject issue when requested quantity exceeds available stock with 400 Bad Request", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/issues`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "50.0000",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Insufficient stock");
    });
  });

  describe("Stock Adjustments (POST /inventory/adjustments)", () => {
    beforeEach(() => {
      balancesStore.push({
        id: randomUUID(),
        organizationId: orgId,
        productId: prodId1,
        warehouseId: whId1,
        locationId: locId1,
        quantityOnHand: new Prisma.Decimal("10.0000"),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("should increase stock on positive adjustment", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/adjustments`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantityDelta: "+4.0000",
          reason: "STOCK_COUNT",
          reference: "AUDIT-2026",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balance.quantityOnHand).toBe("14.0000");
      expect(res.body.data.transaction.type).toBe("ADJUSTMENT");
    });

    it("should decrease stock on negative adjustment", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/adjustments`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantityDelta: "-3.0000",
          reason: "SHRINKAGE",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balance.quantityOnHand).toBe("7.0000");
    });

    it("should reject negative adjustment that would produce negative stock", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/adjustments`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantityDelta: "-20.0000",
          reason: "SCRAP",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Stock adjustment would result in negative stock");
    });

    it("should reject adjustment with zero delta with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/adjustments`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantityDelta: "0.0000",
          reason: "COUNT",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should reject adjustment without reason with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/adjustments`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantityDelta: "5.0000",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Stock Transfers (POST /inventory/transfers)", () => {
    beforeEach(() => {
      balancesStore.push({
        id: randomUUID(),
        organizationId: orgId,
        productId: prodId1,
        warehouseId: whId1,
        locationId: locId1,
        quantityOnHand: new Prisma.Decimal("15.0000"),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("should transfer stock between distinct locations atomically with one ledger entry", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/transfers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          sourceLocationId: locId1,
          destinationLocationId: locId2,
          quantity: "6.0000",
          reference: "TRANSFER-1001",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sourceBalance.quantityOnHand).toBe("9.0000");
      expect(res.body.data.destinationBalance.quantityOnHand).toBe("6.0000");
      expect(res.body.data.transaction.type).toBe("TRANSFER");
      expect(res.body.data.transaction.sourceLocationId).toBe(locId1);
      expect(res.body.data.transaction.destinationLocationId).toBe(locId2);
      expect(transactionsStore).toHaveLength(1);
    });

    it("should reject same source and destination locations with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/transfers`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: prodId1,
          sourceLocationId: locId1,
          destinationLocationId: locId1,
          quantity: "5.0000",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should reject transfer if source location has insufficient stock with 400 Bad Request", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/transfers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          sourceLocationId: locId1,
          destinationLocationId: locId2,
          quantity: "25.0000",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Insufficient stock at source location");
    });
  });

  describe("Idempotency Prevention", () => {
    it("should replay existing transaction when called with the same key and identical payload", async () => {
      const idempotencyKey = "uuid-key-repeat-01";
      const payload = {
        productId: prodId1,
        locationId: locId1,
        quantity: "10.0000",
        reference: "PO-REPLAY",
        idempotencyKey,
      };

      const res1 = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send(payload);

      expect(res1.status).toBe(201);
      const txId = res1.body.data.transaction.id;

      // Repeat identical request
      const res2 = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.body.data.transaction.id).toBe(txId);
      expect(transactionsStore).toHaveLength(1); // Not duplicated!
    });

    it("should reject reusing idempotency key with conflicting payload with 409 Conflict", async () => {
      const idempotencyKey = "uuid-key-conflict-01";

      await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "10.0000",
          idempotencyKey,
        });

      // Send same key with different quantity
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/inventory/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          productId: prodId1,
          locationId: locId1,
          quantity: "50.0000",
          idempotencyKey,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Idempotency key has already been used");
    });
  });

  describe("Queries & History (GET /balances & GET /transactions)", () => {
    beforeEach(() => {
      balancesStore.push({
        id: randomUUID(),
        organizationId: orgId,
        productId: prodId1,
        warehouseId: whId1,
        locationId: locId1,
        quantityOnHand: new Prisma.Decimal("18.0000"),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      transactionsStore.push({
        id: randomUUID(),
        organizationId: orgId,
        productId: prodId1,
        warehouseId: whId1,
        type: "RECEIPT",
        quantity: new Prisma.Decimal("18.0000"),
        quantityDelta: new Prisma.Decimal("18.0000"),
        sourceLocationId: null,
        destinationLocationId: locId1,
        reason: null,
        reference: "PO-INIT",
        notes: null,
        idempotencyKey: null,
        requestHash: null,
        performedByUserId: ownerUser.id,
        createdAt: new Date(),
      });
    });

    it("should return paginated balances with metadata", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/inventory/balances`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantityOnHand).toBe("18.0000");
      expect(res.body.data.pagination.totalItems).toBe(1);
    });

    it("should return paginated transactions history with metadata", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/inventory/transactions`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].type).toBe("RECEIPT");
      expect(res.body.data.items[0].quantity).toBe("18.0000");
    });

    it("should reject invalid date range with startDate after endDate", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/inventory/transactions`)
        .set("Authorization", `Bearer ${memberToken}`)
        .query({
          startDate: "2026-06-01T00:00:00.000Z",
          endDate: "2026-01-01T00:00:00.000Z",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });
});
