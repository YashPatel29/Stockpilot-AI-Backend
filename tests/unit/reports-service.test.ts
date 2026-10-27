import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Prisma,
  type PrismaClient,
  InventoryTransactionType,
  PurchaseOrderStatus,
  WarehouseStatus,
  ProductStatus,
} from "@prisma/client";
import { ReportsService } from "../../src/modules/reporting/reports.service";

describe("ReportsService (Unit)", () => {
  let mockPrisma: {
    warehouse: {
      findMany: ReturnType<typeof vi.fn>;
    };
    inventoryBalance: {
      findMany: ReturnType<typeof vi.fn>;
    };
    inventoryTransaction: {
      count: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    product: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    purchaseOrder: {
      count: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    purchaseOrderItem: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  let service: ReportsService;
  const orgId = "550e8400-e29b-41d4-a716-446655440001";
  const warehouseId1 = "wh-uuid-111";
  const warehouseId2 = "wh-uuid-222";

  beforeEach(() => {
    mockPrisma = {
      warehouse: {
        findMany: vi.fn(),
      },
      inventoryBalance: {
        findMany: vi.fn(),
      },
      inventoryTransaction: {
        count: vi.fn(),
        groupBy: vi.fn(),
        findMany: vi.fn(),
      },
      product: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      purchaseOrder: {
        count: vi.fn(),
        groupBy: vi.fn(),
        findMany: vi.fn(),
      },
      purchaseOrderItem: {
        findMany: vi.fn(),
      },
    };

    service = new ReportsService(mockPrisma as unknown as PrismaClient);
  });

  describe("getInventoryByWarehouse", () => {
    it("should aggregate stock by warehouse and distinct unit of measure without mixing", async () => {
      mockPrisma.warehouse.findMany.mockResolvedValueOnce([
        {
          id: warehouseId1,
          code: "WH-NORTH",
          name: "North Facility",
          status: WarehouseStatus.ACTIVE,
          _count: { locations: 5 },
        },
        {
          id: warehouseId2,
          code: "WH-SOUTH",
          name: "South Facility",
          status: WarehouseStatus.ACTIVE,
          _count: { locations: 3 },
        },
      ]);

      mockPrisma.inventoryBalance.findMany.mockResolvedValueOnce([
        {
          warehouseId: warehouseId1,
          locationId: "loc-1",
          productId: "prod-1",
          quantityOnHand: new Prisma.Decimal(50),
          product: { unitOfMeasure: "PCS" },
        },
        {
          warehouseId: warehouseId1,
          locationId: "loc-2",
          productId: "prod-1",
          quantityOnHand: new Prisma.Decimal(30),
          product: { unitOfMeasure: "PCS" },
        },
        {
          warehouseId: warehouseId1,
          locationId: "loc-3",
          productId: "prod-2",
          quantityOnHand: new Prisma.Decimal(10.5),
          product: { unitOfMeasure: "KG" },
        },
        {
          warehouseId: warehouseId2,
          locationId: "loc-4",
          productId: "prod-1",
          quantityOnHand: new Prisma.Decimal(200),
          product: { unitOfMeasure: "PCS" },
        },
      ]);

      const result = await service.getInventoryByWarehouse(orgId, {});

      expect(result.warehouses).toHaveLength(2);

      const whNorth = result.warehouses.find((w) => w.warehouseId === warehouseId1)!;
      expect(whNorth.warehouseCode).toBe("WH-NORTH");
      expect(whNorth.locationCount).toBe(5);
      expect(whNorth.positiveStockLocationsCount).toBe(3); // loc-1, loc-2, loc-3
      expect(whNorth.distinctProductsCount).toBe(2); // prod-1, prod-2
      expect(whNorth.stockByUom).toEqual([
        { unitOfMeasure: "PCS", totalQuantityOnHand: "80.0000" }, // 50 + 30
        { unitOfMeasure: "KG", totalQuantityOnHand: "10.5000" },
      ]);

      const whSouth = result.warehouses.find((w) => w.warehouseId === warehouseId2)!;
      expect(whSouth.stockByUom).toEqual([
        { unitOfMeasure: "PCS", totalQuantityOnHand: "200.0000" },
      ]);
    });
  });

  describe("getInventoryMovements", () => {
    it("should count transfers as 1 logical transaction and aggregate quantities", async () => {
      mockPrisma.inventoryTransaction.count.mockResolvedValueOnce(3);

      mockPrisma.inventoryTransaction.groupBy.mockResolvedValueOnce([
        { type: InventoryTransactionType.RECEIPT, _count: { _all: 1 } },
        { type: InventoryTransactionType.TRANSFER, _count: { _all: 1 } },
        { type: InventoryTransactionType.ISSUE, _count: { _all: 1 } },
      ]);

      mockPrisma.inventoryTransaction.findMany
        .mockResolvedValueOnce([
          {
            type: InventoryTransactionType.RECEIPT,
            quantity: new Prisma.Decimal(100),
            product: { unitOfMeasure: "PCS" },
          },
          {
            type: InventoryTransactionType.TRANSFER,
            quantity: new Prisma.Decimal(25),
            product: { unitOfMeasure: "PCS" },
          },
          {
            type: InventoryTransactionType.ISSUE,
            quantity: new Prisma.Decimal(10),
            product: { unitOfMeasure: "PCS" },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "tx-transfer-1",
            productId: "prod-1",
            type: InventoryTransactionType.TRANSFER,
            quantity: new Prisma.Decimal(25),
            quantityDelta: new Prisma.Decimal(25),
            warehouseId: warehouseId1,
            sourceLocationId: "loc-src-1",
            destinationLocationId: "loc-dst-2",
            reference: "TRF-900",
            notes: "Internal rebalancing",
            performedByUserId: "user-1",
            createdAt: new Date("2026-10-27T10:00:00Z"),
            product: { sku: "BOLT-01", name: "Steel Bolt", unitOfMeasure: "PCS" },
            warehouse: { name: "North Hub" },
            sourceLocation: { code: "A-01" },
            destinationLocation: { code: "B-02" },
            performedByUser: { name: "Bob" },
          },
        ]);

      const result = await service.getInventoryMovements(orgId, {
        page: 1,
        limit: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.summary.totalTransactions).toBe(3);
      expect(result.summary.countsByType[InventoryTransactionType.TRANSFER]).toBe(1);
      expect(result.summary.quantitiesByTypeAndUom).toContainEqual({
        type: InventoryTransactionType.TRANSFER,
        unitOfMeasure: "PCS",
        totalQuantity: "25.0000",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.sourceLocationCode).toBe("A-01");
      expect(result.items[0]?.destinationLocationCode).toBe("B-02");
    });
  });

  describe("getProductInventory", () => {
    it("should return exactly one row per product with non-duplicated location list", async () => {
      mockPrisma.product.count.mockResolvedValueOnce(1);
      mockPrisma.product.findMany.mockResolvedValueOnce([
        {
          id: "prod-uuid-1",
          sku: "STEEL-01",
          name: "Industrial Bolt",
          unitOfMeasure: "PCS",
          costPrice: new Prisma.Decimal(1.5),
          sellingPrice: new Prisma.Decimal(3.0),
          status: ProductStatus.ACTIVE,
          category: { name: "Fasteners" },
          inventoryBalances: [
            {
              warehouseId: warehouseId1,
              locationId: "loc-1",
              quantityOnHand: new Prisma.Decimal(40),
              warehouse: { code: "WH-1", name: "Main Hub" },
              location: { code: "A-01", name: "Bay 1" },
            },
            {
              warehouseId: warehouseId1,
              locationId: "loc-2",
              quantityOnHand: new Prisma.Decimal(60),
              warehouse: { code: "WH-1", name: "Main Hub" },
              location: { code: "A-02", name: "Bay 2" },
            },
          ],
        },
      ]);

      const result = await service.getProductInventory(orgId, {
        page: 1,
        limit: 10,
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(result.items).toHaveLength(1);
      const productRow = result.items[0]!;
      expect(productRow.sku).toBe("STEEL-01");
      expect(productRow.categoryName).toBe("Fasteners");
      expect(productRow.totalQuantityOnHand).toBe("100.0000"); // 40 + 60
      expect(productRow.locationCount).toBe(2);
      expect(productRow.locations).toHaveLength(2);
    });
  });

  describe("getLowStockReport", () => {
    it("should flag products whose organization-wide stock is less than or equal to lowStockThreshold", async () => {
      mockPrisma.product.findMany.mockResolvedValueOnce([
        {
          id: "prod-1",
          sku: "LOW-01",
          name: "Low Stock Item",
          unitOfMeasure: "PCS",
          lowStockThreshold: 50,
          status: ProductStatus.ACTIVE,
          category: { name: "Electronics" },
          inventoryBalances: [
            { quantityOnHand: new Prisma.Decimal(15) },
            { quantityOnHand: new Prisma.Decimal(10) },
          ], // Total 25 <= 50 -> Deficit 25
        },
        {
          id: "prod-2",
          sku: "HIGH-02",
          name: "High Stock Item",
          unitOfMeasure: "PCS",
          lowStockThreshold: 20,
          status: ProductStatus.ACTIVE,
          category: { name: "Electronics" },
          inventoryBalances: [{ quantityOnHand: new Prisma.Decimal(100) }], // Total 100 > 20 -> Not low stock
        },
        {
          id: "prod-3",
          sku: "ZERO-03",
          name: "Unconfigured Item",
          unitOfMeasure: "PCS",
          lowStockThreshold: 0,
          status: ProductStatus.ACTIVE,
          category: null,
          inventoryBalances: [{ quantityOnHand: new Prisma.Decimal(0) }], // Threshold 0 -> Excluded by default
        },
      ]);

      const result = await service.getLowStockReport(orgId, {
        page: 1,
        limit: 10,
        includeZeroThreshold: false,
        sortBy: "deficit",
        sortOrder: "desc",
      });

      expect(result.summary.lowStockProductsCount).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.sku).toBe("LOW-01");
      expect(result.items[0]?.lowStockThreshold).toBe(50);
      expect(result.items[0]?.totalQuantityOnHand).toBe("25.0000");
      expect(result.items[0]?.deficit).toBe("25.0000");
    });
  });

  describe("getPurchaseOrderReport", () => {
    it("should segregate committed purchasing from cancelled orders and compute line commitments", async () => {
      mockPrisma.purchaseOrder.count.mockResolvedValueOnce(3);

      mockPrisma.purchaseOrder.groupBy.mockResolvedValueOnce([
        {
          status: PurchaseOrderStatus.APPROVED,
          _count: { _all: 1 },
          _sum: { totalAmount: new Prisma.Decimal(1200) },
        },
        {
          status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
          _count: { _all: 1 },
          _sum: { totalAmount: new Prisma.Decimal(800) },
        },
        {
          status: PurchaseOrderStatus.CANCELLED,
          _count: { _all: 1 },
          _sum: { totalAmount: new Prisma.Decimal(500) },
        },
      ]);

      mockPrisma.purchaseOrderItem.findMany.mockResolvedValueOnce([
        { quantityOrdered: new Prisma.Decimal(100), quantityReceived: new Prisma.Decimal(40) }, // 60 outstanding
        { quantityOrdered: new Prisma.Decimal(50), quantityReceived: new Prisma.Decimal(50) }, // 0 outstanding
      ]);

      mockPrisma.purchaseOrder.findMany.mockResolvedValueOnce([
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
          supplier: { name: "Premier Vendor" },
          createdByUser: { email: "buyer@stockpilot.io" },
          approvedByUser: { email: "admin@stockpilot.io" },
          approvedAt: new Date("2026-10-27T11:00:00Z"),
          cancelledAt: null,
          items: [
            { quantityOrdered: new Prisma.Decimal(100), quantityReceived: new Prisma.Decimal(40) },
          ],
        },
      ]);

      const result = await service.getPurchaseOrderReport(orgId, {
        page: 1,
        limit: 10,
        sortBy: "orderDate",
        sortOrder: "desc",
      });

      // Committed value is 1200 + 800 = 2000; cancelled is 500 (segregated)
      expect(result.summary.totalCommittedValue).toBe("2000.0000");
      expect(result.summary.totalCancelledValue).toBe("500.0000");
      expect(result.summary.outstandingLinesCount).toBe(1);
      expect(result.summary.totalQuantityOrdered).toBe("150.0000");
      expect(result.summary.totalQuantityReceived).toBe("90.0000");
      expect(result.summary.totalQuantityOutstanding).toBe("60.0000");

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.orderNumber).toBe("PO-20261027-001");
      expect(result.items[0]?.totalOutstandingQuantity).toBe("60.0000");
    });
  });

  describe("getRecentActivity", () => {
    it("should return latest ledger activity up to limit", async () => {
      mockPrisma.inventoryTransaction.findMany.mockResolvedValueOnce([
        {
          id: "tx-1",
          productId: "prod-1",
          type: InventoryTransactionType.RECEIPT,
          quantity: new Prisma.Decimal(10),
          quantityDelta: new Prisma.Decimal(10),
          warehouseId: warehouseId1,
          sourceLocationId: null,
          destinationLocationId: "loc-1",
          reference: "REC-01",
          notes: null,
          performedByUserId: "user-1",
          createdAt: new Date("2026-10-27T10:00:00Z"),
          product: { sku: "SKU-01", name: "Bolt", unitOfMeasure: "PCS" },
          warehouse: { name: "Main" },
          sourceLocation: null,
          destinationLocation: { code: "A-01" },
          performedByUser: { name: "Alice" },
        },
      ]);

      const result = await service.getRecentActivity(orgId, { limit: 5 });

      expect(result.items).toHaveLength(1);
      expect(result.limit).toBe(5);
    });
  });
});
