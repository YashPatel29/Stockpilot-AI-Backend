import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  OrganizationRole,
  Prisma,
  InventoryTransactionType,
  PurchaseOrderStatus,
  WarehouseStatus,
  ProductStatus,
} from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";

describe("Feature 8: Inventory Dashboard and Reporting (Integration)", () => {
  const orgId = "550e8400-e29b-41d4-a716-446655440001";
  const warehouseId = "550e8400-e29b-41d4-a716-446655440101";
  const locationId = "550e8400-e29b-41d4-a716-446655440201";
  const productId = "550e8400-e29b-41d4-a716-446655440301";

  const ownerUser = {
    id: "550e8400-e29b-41d4-a716-446655440010",
    email: "owner@stockpilot.io",
    name: "Owner Alice",
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
    name: "Alpha Corp",
    slug: "alpha-corp",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  let ownerToken: string;
  let memberToken: string;
  let externalToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();

    ownerToken = signAccessToken({
      sub: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
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
        if (userId === memberUser.id) {
          return Promise.resolve({
            id: "mem-member-2",
            userId: memberUser.id,
            organizationId: orgId,
            role: OrganizationRole.MEMBER,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
      }

      return Promise.resolve(null);
    }) as never);
  });

  describe("GET /api/v1/organizations/:organizationId/dashboard/inventory", () => {
    it("should return inventory dashboard overview for organization members (200)", async () => {
      vi.spyOn(prisma.product, "count").mockResolvedValueOnce(10);
      vi.spyOn(prisma.warehouse, "count").mockResolvedValueOnce(2);
      vi.spyOn(prisma.storageLocation, "count").mockResolvedValueOnce(6);
      vi.spyOn(prisma.inventoryBalance, "count").mockResolvedValueOnce(5).mockResolvedValueOnce(2);
      vi.spyOn(prisma.inventoryBalance, "findMany").mockResolvedValueOnce([
        { quantityOnHand: new Prisma.Decimal(120), product: { unitOfMeasure: "PCS" } },
      ] as never);
      vi.spyOn(prisma.inventoryTransaction, "count").mockResolvedValueOnce(15);
      vi.spyOn(prisma.inventoryTransaction, "groupBy").mockResolvedValueOnce([
        { type: InventoryTransactionType.RECEIPT, _count: { _all: 10 } },
        { type: InventoryTransactionType.ISSUE, _count: { _all: 5 } },
      ] as never);
      vi.spyOn(prisma.inventoryTransaction, "findMany")
        .mockResolvedValueOnce([
          {
            type: InventoryTransactionType.RECEIPT,
            quantity: new Prisma.Decimal(100),
            product: { unitOfMeasure: "PCS" },
          },
        ] as never)
        .mockResolvedValueOnce([
          {
            id: "tx-1",
            productId,
            type: InventoryTransactionType.RECEIPT,
            quantity: new Prisma.Decimal(100),
            quantityDelta: new Prisma.Decimal(100),
            warehouseId,
            sourceLocationId: null,
            destinationLocationId: locationId,
            reference: "PO-100",
            notes: null,
            performedByUserId: ownerUser.id,
            createdAt: new Date("2026-10-27T10:00:00Z"),
            product: { sku: "SKU-01", name: "Steel Bolt", unitOfMeasure: "PCS" },
            warehouse: { name: "Central Hub" },
            sourceLocation: null,
            destinationLocation: { code: "A-01" },
            performedByUser: { name: "Owner Alice" },
          },
        ] as never);
      vi.spyOn(prisma.purchaseOrder, "groupBy").mockResolvedValueOnce([
        {
          status: PurchaseOrderStatus.APPROVED,
          _count: { _all: 2 },
          _sum: { totalAmount: new Prisma.Decimal(500) },
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/dashboard/inventory`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview.totalActiveProducts).toBe(10);
      expect(res.body.data.overview.totalActiveWarehouses).toBe(2);
      expect(res.body.data.overview.unitsOnHand).toEqual([
        { unitOfMeasure: "PCS", totalQuantityOnHand: "120.0000" },
      ]);
      expect(res.body.data.movementsWindow.totalTransactions).toBe(15);
      expect(res.body.data.purchaseOrdersSummary.totalCommittedValue).toBe("500.0000");
      expect(res.body.data.recentTransactions).toHaveLength(1);
    });

    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await request(app).get(`/api/v1/organizations/${orgId}/dashboard/inventory`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should reject external user with 404 Not Found (anti-IDOR)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/dashboard/inventory`)
        .set("Authorization", `Bearer ${externalToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should reject invalid date filter (startDate > endDate) with 422", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/dashboard/inventory`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .query({
          startDate: "2026-10-30T00:00:00Z",
          endDate: "2026-10-20T00:00:00Z",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/reports/inventory-by-warehouse", () => {
    it("should return stock distribution grouped by warehouse and UOM (200)", async () => {
      vi.spyOn(prisma.warehouse, "findMany").mockResolvedValueOnce([
        {
          id: warehouseId,
          code: "WH-EAST",
          name: "East Facility",
          status: WarehouseStatus.ACTIVE,
          _count: { locations: 4 },
        },
      ] as never);
      vi.spyOn(prisma.inventoryBalance, "findMany").mockResolvedValueOnce([
        {
          warehouseId,
          locationId,
          productId,
          quantityOnHand: new Prisma.Decimal(250),
          product: { unitOfMeasure: "PCS" },
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/reports/inventory-by-warehouse`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.warehouses).toHaveLength(1);
      expect(res.body.data.warehouses[0].warehouseCode).toBe("WH-EAST");
      expect(res.body.data.warehouses[0].stockByUom).toEqual([
        { unitOfMeasure: "PCS", totalQuantityOnHand: "250.0000" },
      ]);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/reports/inventory-movements", () => {
    it("should return paginated movements and movement summaries (200)", async () => {
      vi.spyOn(prisma.inventoryTransaction, "count").mockResolvedValueOnce(1);
      vi.spyOn(prisma.inventoryTransaction, "groupBy").mockResolvedValueOnce([
        { type: InventoryTransactionType.RECEIPT, _count: { _all: 1 } },
      ] as never);
      vi.spyOn(prisma.inventoryTransaction, "findMany")
        .mockResolvedValueOnce([
          {
            type: InventoryTransactionType.RECEIPT,
            quantity: new Prisma.Decimal(50),
            product: { unitOfMeasure: "PCS" },
          },
        ] as never)
        .mockResolvedValueOnce([
          {
            id: "tx-1",
            productId,
            type: InventoryTransactionType.RECEIPT,
            quantity: new Prisma.Decimal(50),
            quantityDelta: new Prisma.Decimal(50),
            warehouseId,
            sourceLocationId: null,
            destinationLocationId: locationId,
            reference: "RC-01",
            notes: null,
            performedByUserId: ownerUser.id,
            createdAt: new Date("2026-10-27T10:00:00Z"),
            product: { sku: "SKU-01", name: "Bolt", unitOfMeasure: "PCS" },
            warehouse: { name: "East Hub" },
            sourceLocation: null,
            destinationLocation: { code: "A-01" },
            performedByUser: { name: "Alice" },
          },
        ] as never);

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/reports/inventory-movements`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalTransactions).toBe(1);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.page).toBe(1);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/reports/product-inventory", () => {
    it("should return product inventory with single row per product and location details (200)", async () => {
      vi.spyOn(prisma.product, "count").mockResolvedValueOnce(1);
      vi.spyOn(prisma.product, "findMany").mockResolvedValueOnce([
        {
          id: productId,
          sku: "SKU-PROD-01",
          name: "Industrial Valve",
          unitOfMeasure: "PCS",
          costPrice: new Prisma.Decimal(45),
          sellingPrice: new Prisma.Decimal(90),
          status: ProductStatus.ACTIVE,
          category: { name: "Piping" },
          inventoryBalances: [
            {
              warehouseId,
              locationId,
              quantityOnHand: new Prisma.Decimal(75),
              warehouse: { code: "WH-1", name: "Facility 1" },
              location: { code: "B-02", name: "Rack 2" },
            },
          ],
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/reports/product-inventory`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].sku).toBe("SKU-PROD-01");
      expect(res.body.data.items[0].totalQuantityOnHand).toBe("75.0000");
      expect(res.body.data.items[0].locations).toHaveLength(1);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/reports/low-stock", () => {
    it("should return low stock products based on Product.lowStockThreshold (200)", async () => {
      vi.spyOn(prisma.product, "findMany").mockResolvedValueOnce([
        {
          id: productId,
          sku: "CRITICAL-01",
          name: "Critical Filter",
          unitOfMeasure: "PCS",
          lowStockThreshold: 100,
          status: ProductStatus.ACTIVE,
          category: { name: "Maintenance" },
          inventoryBalances: [{ quantityOnHand: new Prisma.Decimal(30) }],
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/reports/low-stock`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.lowStockProductsCount).toBe(1);
      expect(res.body.data.items[0].sku).toBe("CRITICAL-01");
      expect(res.body.data.items[0].deficit).toBe("70.0000"); // 100 - 30
    });
  });

  describe("GET /api/v1/organizations/:organizationId/reports/purchase-orders", () => {
    it("should return procurement status summaries and line progress (200)", async () => {
      vi.spyOn(prisma.purchaseOrder, "count").mockResolvedValueOnce(1);
      vi.spyOn(prisma.purchaseOrder, "groupBy").mockResolvedValueOnce([
        {
          status: PurchaseOrderStatus.APPROVED,
          _count: { _all: 1 },
          _sum: { totalAmount: new Prisma.Decimal(1200) },
        },
      ] as never);
      vi.spyOn(prisma.purchaseOrderItem, "findMany").mockResolvedValueOnce([
        { quantityOrdered: new Prisma.Decimal(100), quantityReceived: new Prisma.Decimal(50) },
      ] as never);
      vi.spyOn(prisma.purchaseOrder, "findMany").mockResolvedValueOnce([
        {
          id: "po-1",
          orderNumber: "PO-20261027-001",
          supplierId: "sup-1",
          status: PurchaseOrderStatus.APPROVED,
          orderDate: new Date("2026-10-27T10:00:00Z"),
          expectedDeliveryDate: null,
          currency: "USD",
          subtotal: new Prisma.Decimal(1200),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(1200),
          supplier: { name: "Premier Supplies" },
          createdByUser: { email: "buyer@stockpilot.io" },
          approvedByUser: null,
          approvedAt: null,
          cancelledAt: null,
          items: [
            { quantityOrdered: new Prisma.Decimal(100), quantityReceived: new Prisma.Decimal(50) },
          ],
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/reports/purchase-orders`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalCommittedValue).toBe("1200.0000");
      expect(res.body.data.summary.totalQuantityOutstanding).toBe("50.0000");
      expect(res.body.data.items).toHaveLength(1);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/reports/recent-activity", () => {
    it("should return recent transactions up to limit (200)", async () => {
      vi.spyOn(prisma.inventoryTransaction, "findMany").mockResolvedValueOnce([
        {
          id: "tx-1",
          productId,
          type: InventoryTransactionType.RECEIPT,
          quantity: new Prisma.Decimal(10),
          quantityDelta: new Prisma.Decimal(10),
          warehouseId,
          sourceLocationId: null,
          destinationLocationId: locationId,
          reference: "REC-99",
          notes: null,
          performedByUserId: ownerUser.id,
          createdAt: new Date("2026-10-27T10:00:00Z"),
          product: { sku: "SKU-01", name: "Bolt", unitOfMeasure: "PCS" },
          warehouse: { name: "East Hub" },
          sourceLocation: null,
          destinationLocation: { code: "A-01" },
          performedByUser: { name: "Alice" },
        },
      ] as never);

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/reports/recent-activity`)
        .set("Authorization", `Bearer ${memberToken}`)
        .query({ limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.limit).toBe(10);
    });
  });
});
