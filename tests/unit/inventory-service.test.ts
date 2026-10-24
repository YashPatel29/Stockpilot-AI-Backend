import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { InventoryService } from "../../src/modules/inventory/inventory.service";
import { InventoryTransactionType } from "../../src/modules/inventory/inventory.types";
import { NotFoundError, ConflictError, BadRequestError } from "../../src/common/errors/http-errors";

describe("InventoryService (Unit)", () => {
  let mockPrisma: {
    inventoryBalance: {
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    inventoryTransaction: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    product: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    storageLocation: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  let service: InventoryService;

  const orgId = "org-uuid-100";
  const userId = "user-uuid-200";
  const productId = "prod-uuid-300";
  const warehouseId = "wh-uuid-400";
  const locationId = "loc-uuid-500";
  const destLocationId = "loc-uuid-600";

  const sampleProduct = {
    id: productId,
    organizationId: orgId,
    sku: "SKU-TEST-001",
    name: "Test Widget",
    unitOfMeasure: "PCS",
    status: "ACTIVE",
    costPrice: new Prisma.Decimal("10.0000"),
    sellingPrice: new Prisma.Decimal("20.0000"),
    lowStockThreshold: 5,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleWarehouse = {
    id: warehouseId,
    organizationId: orgId,
    code: "WH-01",
    name: "Main Facility",
    status: "ACTIVE",
  };

  const sampleLocation = {
    id: locationId,
    organizationId: orgId,
    warehouseId,
    code: "LOC-A1",
    name: "Aisle A, Shelf 1",
    type: "SHELF",
    status: "ACTIVE",
    warehouse: sampleWarehouse,
  };

  const sampleDestLocation = {
    id: destLocationId,
    organizationId: orgId,
    warehouseId,
    code: "LOC-B2",
    name: "Aisle B, Shelf 2",
    type: "SHELF",
    status: "ACTIVE",
    warehouse: sampleWarehouse,
  };

  const sampleBalance = {
    id: "bal-uuid-001",
    organizationId: orgId,
    productId,
    warehouseId,
    locationId,
    quantityOnHand: new Prisma.Decimal("25.0000"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    product: sampleProduct,
    warehouse: sampleWarehouse,
    location: sampleLocation,
  };

  beforeEach(() => {
    mockPrisma = {
      inventoryBalance: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        upsert: vi.fn(),
        updateMany: vi.fn(),
      },
      inventoryTransaction: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      product: {
        findFirst: vi.fn(),
      },
      storageLocation: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((callback) => {
        if (typeof callback === "function") {
          return callback(mockPrisma);
        }
        return Promise.all(callback);
      }),
    };

    service = new InventoryService(mockPrisma as unknown as PrismaClient);
  });

  describe("receiveStock()", () => {
    it("should atomically receive stock, create/increment balance, and record RECEIPT ledger", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue(sampleLocation);
      mockPrisma.inventoryBalance.upsert.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("35.0000"),
      });
      mockPrisma.inventoryTransaction.create.mockResolvedValue({
        id: "tx-uuid-001",
        organizationId: orgId,
        productId,
        warehouseId,
        type: InventoryTransactionType.RECEIPT,
        quantity: new Prisma.Decimal("10.0000"),
        quantityDelta: new Prisma.Decimal("10.0000"),
        destinationLocationId: locationId,
        sourceLocationId: null,
        reason: null,
        reference: "PO-1001",
        notes: "Shipment delivery",
        idempotencyKey: null,
        performedByUserId: userId,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        product: sampleProduct,
        warehouse: sampleWarehouse,
        destinationLocation: sampleLocation,
        performedByUser: { id: userId, name: "Alice", email: "alice@stockpilot.io" },
      });

      const result = await service.receiveStock(orgId, userId, {
        productId,
        locationId,
        quantity: "10.0000",
        reference: "PO-1001",
        notes: "Shipment delivery",
      });

      expect(result.transaction.type).toBe(InventoryTransactionType.RECEIPT);
      expect(result.transaction.quantity).toBe("10.0000");
      expect(result.balance?.quantityOnHand).toBe("35.0000");
      expect(mockPrisma.inventoryBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId_locationId: { productId, locationId } },
          create: expect.objectContaining({
            quantityOnHand: new Prisma.Decimal("10.0000"),
          }),
          update: expect.objectContaining({
            quantityOnHand: { increment: new Prisma.Decimal("10.0000") },
          }),
        }),
      );
    });

    it("should reject receiving stock if product is not found in organization (anti-IDOR)", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.receiveStock(orgId, userId, {
          productId: "foreign-prod-id",
          locationId,
          quantity: "10.0000",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should reject receiving stock if product is archived/inactive", async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        ...sampleProduct,
        status: "ARCHIVED",
      });

      await expect(
        service.receiveStock(orgId, userId, {
          productId,
          locationId,
          quantity: "10.0000",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject receiving stock if storage location is inactive", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue({
        ...sampleLocation,
        status: "INACTIVE",
      });

      await expect(
        service.receiveStock(orgId, userId, {
          productId,
          locationId,
          quantity: "10.0000",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject receiving stock if storage location belongs to an inactive warehouse", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue({
        ...sampleLocation,
        warehouse: { ...sampleWarehouse, status: "INACTIVE" },
      });

      await expect(
        service.receiveStock(orgId, userId, {
          productId,
          locationId,
          quantity: "10.0000",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("issueStock()", () => {
    it("should atomically decrease balance and record ISSUE ledger when stock is sufficient", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue(sampleLocation);
      mockPrisma.inventoryBalance.findUnique.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("25.0000"),
      });
      mockPrisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.inventoryBalance.findUniqueOrThrow.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("20.0000"),
      });
      mockPrisma.inventoryTransaction.create.mockResolvedValue({
        id: "tx-uuid-002",
        organizationId: orgId,
        productId,
        warehouseId,
        type: InventoryTransactionType.ISSUE,
        quantity: new Prisma.Decimal("5.0000"),
        quantityDelta: new Prisma.Decimal("-5.0000"),
        sourceLocationId: locationId,
        destinationLocationId: null,
        reason: "DAMAGED",
        reference: "ISSUE-1001",
        notes: null,
        idempotencyKey: null,
        performedByUserId: userId,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        product: sampleProduct,
        warehouse: sampleWarehouse,
        sourceLocation: sampleLocation,
        performedByUser: { id: userId, name: "Alice", email: "alice@stockpilot.io" },
      });

      const result = await service.issueStock(orgId, userId, {
        productId,
        locationId,
        quantity: "5.0000",
        reason: "DAMAGED",
        reference: "ISSUE-1001",
      });

      expect(result.transaction.type).toBe(InventoryTransactionType.ISSUE);
      expect(result.transaction.quantity).toBe("5.0000");
      expect(result.balance?.quantityOnHand).toBe("20.0000");
      expect(mockPrisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
        where: {
          productId,
          locationId,
          quantityOnHand: { gte: new Prisma.Decimal("5.0000") },
        },
        data: {
          quantityOnHand: { decrement: new Prisma.Decimal("5.0000") },
        },
      });
    });

    it("should reject issuing stock when available stock is insufficient", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue(sampleLocation);
      mockPrisma.inventoryBalance.findUnique.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("3.0000"),
      });

      await expect(
        service.issueStock(orgId, userId, {
          productId,
          locationId,
          quantity: "5.0000",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject issuing stock if no balance record exists (zero stock)", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue(sampleLocation);
      mockPrisma.inventoryBalance.findUnique.mockResolvedValue(null);

      await expect(
        service.issueStock(orgId, userId, {
          productId,
          locationId,
          quantity: "1.0000",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("adjustStock()", () => {
    it("should support positive adjustment to increment stock", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue(sampleLocation);
      mockPrisma.inventoryBalance.upsert.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("30.0000"),
      });
      mockPrisma.inventoryTransaction.create.mockResolvedValue({
        id: "tx-uuid-003",
        organizationId: orgId,
        productId,
        warehouseId,
        type: InventoryTransactionType.ADJUSTMENT,
        quantity: new Prisma.Decimal("5.0000"),
        quantityDelta: new Prisma.Decimal("5.0000"),
        destinationLocationId: locationId,
        sourceLocationId: null,
        reason: "STOCK_COUNT",
        reference: "AUDIT-01",
        notes: null,
        idempotencyKey: null,
        performedByUserId: userId,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        product: sampleProduct,
        warehouse: sampleWarehouse,
        destinationLocation: sampleLocation,
        performedByUser: { id: userId, name: "Alice", email: "alice@stockpilot.io" },
      });

      const result = await service.adjustStock(orgId, userId, {
        productId,
        locationId,
        quantityDelta: "5.0000",
        reason: "STOCK_COUNT",
        reference: "AUDIT-01",
      });

      expect(result.transaction.type).toBe(InventoryTransactionType.ADJUSTMENT);
      expect(result.transaction.quantityDelta).toBe("5.0000");
      expect(result.balance?.quantityOnHand).toBe("30.0000");
    });

    it("should support negative adjustment to decrement stock", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue(sampleLocation);
      mockPrisma.inventoryBalance.findUnique.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("10.0000"),
      });
      mockPrisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.inventoryBalance.findUniqueOrThrow.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("8.0000"),
      });
      mockPrisma.inventoryTransaction.create.mockResolvedValue({
        id: "tx-uuid-004",
        organizationId: orgId,
        productId,
        warehouseId,
        type: InventoryTransactionType.ADJUSTMENT,
        quantity: new Prisma.Decimal("2.0000"),
        quantityDelta: new Prisma.Decimal("-2.0000"),
        sourceLocationId: locationId,
        destinationLocationId: null,
        reason: "DAMAGED",
        reference: null,
        notes: null,
        idempotencyKey: null,
        performedByUserId: userId,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        product: sampleProduct,
        warehouse: sampleWarehouse,
        sourceLocation: sampleLocation,
        performedByUser: { id: userId, name: "Alice", email: "alice@stockpilot.io" },
      });

      const result = await service.adjustStock(orgId, userId, {
        productId,
        locationId,
        quantityDelta: "-2.0000",
        reason: "DAMAGED",
      });

      expect(result.transaction.type).toBe(InventoryTransactionType.ADJUSTMENT);
      expect(result.transaction.quantityDelta).toBe("-2.0000");
      expect(result.balance?.quantityOnHand).toBe("8.0000");
    });

    it("should reject negative adjustment that would produce negative stock", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst.mockResolvedValue(sampleLocation);
      mockPrisma.inventoryBalance.findUnique.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("2.0000"),
      });

      await expect(
        service.adjustStock(orgId, userId, {
          productId,
          locationId,
          quantityDelta: "-5.0000",
          reason: "CORRECTION",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("transferStock()", () => {
    it("should atomically transfer stock between distinct locations and create 1 ledger entry", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst
        .mockResolvedValueOnce(sampleLocation)
        .mockResolvedValueOnce(sampleDestLocation);

      mockPrisma.inventoryBalance.findUnique.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("20.0000"),
      });
      mockPrisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.inventoryBalance.upsert.mockResolvedValue({
        id: "bal-uuid-002",
        organizationId: orgId,
        productId,
        warehouseId,
        locationId: destLocationId,
        quantityOnHand: new Prisma.Decimal("8.0000"),
        createdAt: new Date("2026-01-01T10:00:00Z"),
        updatedAt: new Date("2026-01-01T10:00:00Z"),
        product: sampleProduct,
        warehouse: sampleWarehouse,
        location: sampleDestLocation,
      });
      mockPrisma.inventoryBalance.findUniqueOrThrow.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("12.0000"),
      });
      mockPrisma.inventoryTransaction.create.mockResolvedValue({
        id: "tx-uuid-005",
        organizationId: orgId,
        productId,
        warehouseId,
        type: InventoryTransactionType.TRANSFER,
        quantity: new Prisma.Decimal("8.0000"),
        quantityDelta: new Prisma.Decimal("0.0000"),
        sourceLocationId: locationId,
        destinationLocationId: destLocationId,
        reason: "TRANSFER",
        reference: "TRANSFER-1001",
        notes: null,
        idempotencyKey: null,
        performedByUserId: userId,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        product: sampleProduct,
        warehouse: sampleWarehouse,
        sourceLocation: sampleLocation,
        destinationLocation: sampleDestLocation,
        performedByUser: { id: userId, name: "Alice", email: "alice@stockpilot.io" },
      });

      const result = await service.transferStock(orgId, userId, {
        productId,
        sourceLocationId: locationId,
        destinationLocationId: destLocationId,
        quantity: "8.0000",
        reference: "TRANSFER-1001",
      });

      expect(result.transaction.type).toBe(InventoryTransactionType.TRANSFER);
      expect(result.transaction.quantity).toBe("8.0000");
      expect(result.sourceBalance?.quantityOnHand).toBe("12.0000");
      expect(result.destinationBalance?.quantityOnHand).toBe("8.0000");
      expect(result.transaction.sourceLocationId).toBe(locationId);
      expect(result.transaction.destinationLocationId).toBe(destLocationId);
    });

    it("should reject same-location transfers", async () => {
      await expect(
        service.transferStock(orgId, userId, {
          productId,
          sourceLocationId: locationId,
          destinationLocationId: locationId,
          quantity: "5.0000",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject transfer if source location has insufficient stock", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(sampleProduct);
      mockPrisma.storageLocation.findFirst
        .mockResolvedValueOnce(sampleLocation)
        .mockResolvedValueOnce(sampleDestLocation);

      mockPrisma.inventoryBalance.findUnique.mockResolvedValue({
        ...sampleBalance,
        quantityOnHand: new Prisma.Decimal("3.0000"),
      });

      await expect(
        service.transferStock(orgId, userId, {
          productId,
          sourceLocationId: locationId,
          destinationLocationId: destLocationId,
          quantity: "5.0000",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("Idempotency Handling", () => {
    it("should replay existing transaction when key and payload match identically", async () => {
      const idempotencyKey = "client-key-123";
      const payload = {
        productId,
        locationId,
        quantity: "10.0000",
        reference: "PO-1001",
        notes: null,
        idempotencyKey,
      };
      const requestHash = service.computeRequestHash(payload);

      mockPrisma.inventoryTransaction.findUnique.mockResolvedValue({
        id: "tx-uuid-existing",
        organizationId: orgId,
        productId,
        warehouseId,
        type: InventoryTransactionType.RECEIPT,
        quantity: new Prisma.Decimal("10.0000"),
        quantityDelta: new Prisma.Decimal("10.0000"),
        destinationLocationId: locationId,
        sourceLocationId: null,
        reason: null,
        reference: "PO-1001",
        notes: null,
        idempotencyKey,
        requestHash,
        performedByUserId: userId,
        createdAt: new Date("2026-01-01T10:00:00Z"),
        product: sampleProduct,
        warehouse: sampleWarehouse,
        destinationLocation: sampleLocation,
        performedByUser: { id: userId, name: "Alice", email: "alice@stockpilot.io" },
      });

      mockPrisma.inventoryBalance.findUnique.mockResolvedValue(sampleBalance);

      const result = await service.receiveStock(orgId, userId, payload);

      expect(result.transaction.id).toBe("tx-uuid-existing");
      expect(mockPrisma.inventoryBalance.upsert).not.toHaveBeenCalled();
    });

    it("should reject reusing idempotency key with conflicting payload (409 Conflict)", async () => {
      const idempotencyKey = "client-key-123";
      const originalPayload = {
        productId,
        locationId,
        quantity: "10.0000",
        idempotencyKey,
      };
      const differentPayload = {
        productId,
        locationId,
        quantity: "99.0000",
        idempotencyKey,
      };

      mockPrisma.inventoryTransaction.findUnique.mockResolvedValue({
        id: "tx-uuid-existing",
        organizationId: orgId,
        productId,
        warehouseId,
        type: InventoryTransactionType.RECEIPT,
        quantity: new Prisma.Decimal("10.0000"),
        quantityDelta: new Prisma.Decimal("10.0000"),
        destinationLocationId: locationId,
        sourceLocationId: null,
        reason: null,
        reference: null,
        notes: null,
        idempotencyKey,
        requestHash: service.computeRequestHash(originalPayload),
        performedByUserId: userId,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      });

      await expect(service.receiveStock(orgId, userId, differentPayload)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe("listBalances()", () => {
    it("should return paginated balances with exact string decimals", async () => {
      mockPrisma.inventoryBalance.count.mockResolvedValue(1);
      mockPrisma.inventoryBalance.findMany.mockResolvedValue([sampleBalance]);

      const result = await service.listBalances(orgId, { page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.quantityOnHand).toBe("25.0000");
      expect(result.pagination.totalItems).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });
  });

  describe("listTransactions()", () => {
    it("should return paginated transactions with location-aware filtering", async () => {
      mockPrisma.inventoryTransaction.count.mockResolvedValue(1);
      mockPrisma.inventoryTransaction.findMany.mockResolvedValue([
        {
          id: "tx-uuid-001",
          organizationId: orgId,
          productId,
          warehouseId,
          type: InventoryTransactionType.TRANSFER,
          quantity: new Prisma.Decimal("5.0000"),
          quantityDelta: new Prisma.Decimal("0.0000"),
          sourceLocationId: locationId,
          destinationLocationId: destLocationId,
          reason: "TRANSFER",
          reference: "REF-101",
          notes: null,
          idempotencyKey: null,
          performedByUserId: userId,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          product: sampleProduct,
          warehouse: sampleWarehouse,
          sourceLocation: sampleLocation,
          destinationLocation: sampleDestLocation,
          performedByUser: { id: userId, name: "Alice", email: "alice@stockpilot.io" },
        },
      ]);

      const result = await service.listTransactions(orgId, {
        page: 1,
        limit: 20,
        locationId,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.type).toBe(InventoryTransactionType.TRANSFER);
      expect(result.items[0]?.quantity).toBe("5.0000");
    });
  });
});
