import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Prisma,
  type PrismaClient,
  InventoryTransactionType,
  PurchaseOrderStatus,
} from "@prisma/client";
import { DashboardService } from "../../src/modules/reporting/dashboard.service";

describe("DashboardService (Unit)", () => {
  let mockPrisma: {
    product: {
      count: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      count: ReturnType<typeof vi.fn>;
    };
    storageLocation: {
      count: ReturnType<typeof vi.fn>;
    };
    inventoryBalance: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    inventoryTransaction: {
      count: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    purchaseOrder: {
      groupBy: ReturnType<typeof vi.fn>;
    };
  };

  let service: DashboardService;
  const orgId = "550e8400-e29b-41d4-a716-446655440001";

  beforeEach(() => {
    mockPrisma = {
      product: {
        count: vi.fn(),
      },
      warehouse: {
        count: vi.fn(),
      },
      storageLocation: {
        count: vi.fn(),
      },
      inventoryBalance: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      inventoryTransaction: {
        count: vi.fn(),
        groupBy: vi.fn(),
        findMany: vi.fn(),
      },
      purchaseOrder: {
        groupBy: vi.fn(),
      },
    };

    service = new DashboardService(mockPrisma as unknown as PrismaClient);
  });

  it("should calculate complete dashboard metrics for an active organization", async () => {
    mockPrisma.product.count.mockResolvedValueOnce(25);
    mockPrisma.warehouse.count.mockResolvedValueOnce(3);
    mockPrisma.storageLocation.count.mockResolvedValueOnce(18);
    mockPrisma.inventoryBalance.count
      .mockResolvedValueOnce(14) // positiveStockBalancesCount
      .mockResolvedValueOnce(4); // zeroStockBalancesCount

    mockPrisma.inventoryBalance.findMany.mockResolvedValueOnce([
      { quantityOnHand: new Prisma.Decimal(100), product: { unitOfMeasure: "PCS" } },
      { quantityOnHand: new Prisma.Decimal(50), product: { unitOfMeasure: "PCS" } },
      { quantityOnHand: new Prisma.Decimal(12.5), product: { unitOfMeasure: "KG" } },
    ]);

    mockPrisma.inventoryTransaction.count.mockResolvedValueOnce(42);

    mockPrisma.inventoryTransaction.groupBy.mockResolvedValueOnce([
      { type: InventoryTransactionType.RECEIPT, _count: { _all: 20 } },
      { type: InventoryTransactionType.ISSUE, _count: { _all: 12 } },
      { type: InventoryTransactionType.TRANSFER, _count: { _all: 6 } },
      { type: InventoryTransactionType.ADJUSTMENT, _count: { _all: 4 } },
    ]);

    mockPrisma.inventoryTransaction.findMany
      .mockResolvedValueOnce([
        {
          type: InventoryTransactionType.RECEIPT,
          quantity: new Prisma.Decimal(200),
          product: { unitOfMeasure: "PCS" },
        },
        {
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal(50),
          product: { unitOfMeasure: "PCS" },
        },
        {
          type: InventoryTransactionType.TRANSFER,
          quantity: new Prisma.Decimal(25),
          product: { unitOfMeasure: "PCS" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "tx-1",
          productId: "prod-1",
          type: InventoryTransactionType.RECEIPT,
          quantity: new Prisma.Decimal(100),
          quantityDelta: new Prisma.Decimal(100),
          warehouseId: "wh-1",
          sourceLocationId: null,
          destinationLocationId: "loc-1",
          reference: "PO-1001",
          notes: "Stock in",
          performedByUserId: "user-1",
          createdAt: new Date("2026-10-27T10:00:00Z"),
          product: { sku: "SKU-01", name: "Steel Bolt", unitOfMeasure: "PCS" },
          warehouse: { name: "Central Hub" },
          sourceLocation: null,
          destinationLocation: { code: "A-01" },
          performedByUser: { name: "Alice" },
        },
      ]);

    mockPrisma.purchaseOrder.groupBy.mockResolvedValueOnce([
      {
        status: PurchaseOrderStatus.APPROVED,
        _count: { _all: 3 },
        _sum: { totalAmount: new Prisma.Decimal(1500) },
      },
      {
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
        _count: { _all: 2 },
        _sum: { totalAmount: new Prisma.Decimal(2000) },
      },
      {
        status: PurchaseOrderStatus.RECEIVED,
        _count: { _all: 5 },
        _sum: { totalAmount: new Prisma.Decimal(5000) },
      },
      {
        status: PurchaseOrderStatus.PENDING_APPROVAL,
        _count: { _all: 1 },
        _sum: { totalAmount: new Prisma.Decimal(450) },
      },
      {
        status: PurchaseOrderStatus.DRAFT,
        _count: { _all: 2 },
        _sum: { totalAmount: new Prisma.Decimal(300) },
      },
      {
        status: PurchaseOrderStatus.CANCELLED,
        _count: { _all: 1 },
        _sum: { totalAmount: new Prisma.Decimal(700) },
      },
    ]);

    const result = await service.getInventoryDashboard(orgId, { recentLimit: 10 });

    expect(result.overview.totalActiveProducts).toBe(25);
    expect(result.overview.totalActiveWarehouses).toBe(3);
    expect(result.overview.totalActiveStorageLocations).toBe(18);
    expect(result.overview.positiveStockBalancesCount).toBe(14);
    expect(result.overview.zeroStockBalancesCount).toBe(4);

    // Units on hand grouped by distinct UOM
    expect(result.overview.unitsOnHand).toEqual([
      { unitOfMeasure: "PCS", totalQuantityOnHand: "150.0000" },
      { unitOfMeasure: "KG", totalQuantityOnHand: "12.5000" },
    ]);

    // Movement counts and quantities
    expect(result.movementsWindow.totalTransactions).toBe(42);
    expect(result.movementsWindow.countsByType[InventoryTransactionType.RECEIPT]).toBe(20);
    expect(result.movementsWindow.countsByType[InventoryTransactionType.TRANSFER]).toBe(6);

    // Purchase orders commitments (committed value includes APPROVED, PARTIALLY_RECEIVED, RECEIVED = 1500+2000+5000=8500)
    expect(result.purchaseOrdersSummary.totalOrdersCount).toBe(14);
    expect(result.purchaseOrdersSummary.totalCommittedValue).toBe("8500.0000");
    expect(result.purchaseOrdersSummary.totalDraftValue).toBe("750.0000"); // 450 + 300
    expect(result.purchaseOrdersSummary.totalCancelledValue).toBe("700.0000");
    expect(result.purchaseOrdersSummary.pendingApprovalCount).toBe(1);

    // Recent transactions
    expect(result.recentTransactions).toHaveLength(1);
    expect(result.recentTransactions[0]?.productSku).toBe("SKU-01");
    expect(result.recentTransactions[0]?.performedByUserName).toBe("Alice");
  });

  it("should handle empty organization with zeroed metrics cleanly", async () => {
    mockPrisma.product.count.mockResolvedValueOnce(0);
    mockPrisma.warehouse.count.mockResolvedValueOnce(0);
    mockPrisma.storageLocation.count.mockResolvedValueOnce(0);
    mockPrisma.inventoryBalance.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    mockPrisma.inventoryBalance.findMany.mockResolvedValueOnce([]);
    mockPrisma.inventoryTransaction.count.mockResolvedValueOnce(0);
    mockPrisma.inventoryTransaction.groupBy.mockResolvedValueOnce([]);
    mockPrisma.inventoryTransaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockPrisma.purchaseOrder.groupBy.mockResolvedValueOnce([]);

    const result = await service.getInventoryDashboard(orgId, { recentLimit: 10 });

    expect(result.overview.totalActiveProducts).toBe(0);
    expect(result.overview.totalActiveWarehouses).toBe(0);
    expect(result.overview.totalActiveStorageLocations).toBe(0);
    expect(result.overview.positiveStockBalancesCount).toBe(0);
    expect(result.overview.zeroStockBalancesCount).toBe(0);
    expect(result.overview.unitsOnHand).toEqual([]);
    expect(result.movementsWindow.totalTransactions).toBe(0);
    expect(result.purchaseOrdersSummary.totalOrdersCount).toBe(0);
    expect(result.purchaseOrdersSummary.totalCommittedValue).toBe("0.0000");
    expect(result.recentTransactions).toEqual([]);
  });
});
