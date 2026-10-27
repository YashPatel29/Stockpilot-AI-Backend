import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { PurchaseOrderService } from "../../src/modules/procurement/purchase-orders/purchase-order.service";
import { PurchaseOrderStatus } from "../../src/modules/procurement/purchase-orders/purchase-order.types";
import type { InventoryService } from "../../src/modules/inventory/inventory.service";
import { NotFoundError, BadRequestError, ConflictError } from "../../src/common/errors/http-errors";

describe("PurchaseOrderService (Unit)", () => {
  let mockPrisma: {
    supplier: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    product: {
      findMany: ReturnType<typeof vi.fn>;
    };
    purchaseOrder: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    purchaseOrderItem: {
      createMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    purchaseOrderReceipt: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    storageLocation: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  let mockStockService: {
    recordReceiptInTx: ReturnType<typeof vi.fn>;
  };

  let service: PurchaseOrderService;

  const orgId = "org-uuid-111";
  const otherOrgId = "org-uuid-999";
  const userId = "user-uuid-123";
  const approverUserId = "user-uuid-456";
  const supplierId = "sup-uuid-222";
  const poId = "po-uuid-333";
  const productId1 = "prod-uuid-1";
  const productId2 = "prod-uuid-2";
  const locationId = "loc-uuid-555";
  const warehouseId = "wh-uuid-777";

  const sampleSupplier = {
    id: supplierId,
    organizationId: orgId,
    name: "Apex Supplies",
    code: "SUP-APEX",
    isActive: true,
  };

  const sampleProducts = [
    {
      id: productId1,
      organizationId: orgId,
      sku: "PROD-01",
      name: "Steel Bolts",
      status: "ACTIVE",
    },
    { id: productId2, organizationId: orgId, sku: "PROD-02", name: "Brass Nuts", status: "ACTIVE" },
  ];

  const sampleLocation = {
    id: locationId,
    organizationId: orgId,
    warehouseId,
    code: "A-01",
    status: "ACTIVE",
    warehouse: {
      id: warehouseId,
      status: "ACTIVE",
    },
  };

  const samplePo = {
    id: poId,
    organizationId: orgId,
    supplierId,
    orderNumber: "PO-20261027-ABCD",
    status: PurchaseOrderStatus.DRAFT,
    orderDate: new Date("2026-10-27T10:00:00Z"),
    expectedDeliveryDate: null,
    currency: "USD",
    subtotal: new Prisma.Decimal(250),
    taxAmount: new Prisma.Decimal(25),
    totalAmount: new Prisma.Decimal(275),
    notes: "Urgent replenishment",
    createdByUserId: userId,
    approvedByUserId: null,
    approvedAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-10-27T10:00:00Z"),
    updatedAt: new Date("2026-10-27T10:00:00Z"),
    supplier: sampleSupplier,
    createdByUser: { id: userId, email: "buyer@stockpilot.io", name: "Bob Buyer" },
    approvedByUser: null,
    items: [
      {
        id: "poi-1",
        purchaseOrderId: poId,
        productId: productId1,
        quantityOrdered: new Prisma.Decimal(10),
        quantityReceived: new Prisma.Decimal(0),
        unitCost: new Prisma.Decimal(15),
        lineTotal: new Prisma.Decimal(150),
        createdAt: new Date("2026-10-27T10:00:00Z"),
        updatedAt: new Date("2026-10-27T10:00:00Z"),
        product: sampleProducts[0],
      },
      {
        id: "poi-2",
        purchaseOrderId: poId,
        productId: productId2,
        quantityOrdered: new Prisma.Decimal(20),
        quantityReceived: new Prisma.Decimal(0),
        unitCost: new Prisma.Decimal(5),
        lineTotal: new Prisma.Decimal(100),
        createdAt: new Date("2026-10-27T10:00:00Z"),
        updatedAt: new Date("2026-10-27T10:00:00Z"),
        product: sampleProducts[1],
      },
    ],
    receipts: [],
  };

  beforeEach(() => {
    mockPrisma = {
      supplier: {
        findFirst: vi.fn(),
      },
      product: {
        findMany: vi.fn(),
      },
      purchaseOrder: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      purchaseOrderItem: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
      },
      purchaseOrderReceipt: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      storageLocation: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockStockService = {
      recordReceiptInTx: vi.fn().mockResolvedValue({}),
    };

    service = new PurchaseOrderService(
      mockPrisma as unknown as PrismaClient,
      mockStockService as unknown as InventoryService,
    );
  });

  describe("createPurchaseOrder", () => {
    it("should successfully create a draft purchase order with line calculations", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(sampleSupplier);
      mockPrisma.product.findMany.mockResolvedValueOnce(sampleProducts);
      mockPrisma.purchaseOrder.create.mockResolvedValueOnce(samplePo);

      const result = await service.createPurchaseOrder(orgId, userId, {
        supplierId,
        currency: "USD",
        taxAmount: 25,
        notes: "Urgent replenishment",
        items: [
          { productId: productId1, quantityOrdered: 10, unitCost: 15 },
          { productId: productId2, quantityOrdered: 20, unitCost: 5 },
        ],
      });

      expect(mockPrisma.supplier.findFirst).toHaveBeenCalledWith({
        where: { id: supplierId, organizationId: orgId },
      });
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
        where: { id: { in: [productId1, productId2] }, organizationId: orgId },
      });
      expect(mockPrisma.purchaseOrder.create).toHaveBeenCalled();
      expect(result.id).toBe(poId);
      expect(result.status).toBe(PurchaseOrderStatus.DRAFT);
      expect(result.subtotal).toBe("250.0000");
      expect(result.totalAmount).toBe("275.0000");
      expect(result.items).toHaveLength(2);
    });

    it("should throw NotFoundError if supplier not found in organization", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createPurchaseOrder(orgId, userId, {
          supplierId: "missing-sup",
          currency: "USD",
          taxAmount: 0,
          items: [{ productId: productId1, quantityOrdered: 1, unitCost: 10 }],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if supplier is inactive", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce({
        ...sampleSupplier,
        isActive: false,
      });

      await expect(
        service.createPurchaseOrder(orgId, userId, {
          supplierId,
          currency: "USD",
          taxAmount: 0,
          items: [{ productId: productId1, quantityOrdered: 1, unitCost: 10 }],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError if one or more products do not exist in organization", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(sampleSupplier);
      mockPrisma.product.findMany.mockResolvedValueOnce([sampleProducts[0]]); // only 1 returned out of 2

      await expect(
        service.createPurchaseOrder(orgId, userId, {
          supplierId,
          currency: "USD",
          taxAmount: 0,
          items: [
            { productId: productId1, quantityOrdered: 1, unitCost: 10 },
            { productId: productId2, quantityOrdered: 2, unitCost: 20 },
          ],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if any product is not active", async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(sampleSupplier);
      mockPrisma.product.findMany.mockResolvedValueOnce([
        sampleProducts[0],
        { ...sampleProducts[1], status: "ARCHIVED" },
      ]);

      await expect(
        service.createPurchaseOrder(orgId, userId, {
          supplierId,
          currency: "USD",
          taxAmount: 0,
          items: [
            { productId: productId1, quantityOrdered: 1, unitCost: 10 },
            { productId: productId2, quantityOrdered: 2, unitCost: 20 },
          ],
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("getPurchaseOrderById", () => {
    it("should return purchase order details with items and receipts", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(samplePo);

      const result = await service.getPurchaseOrderById(orgId, poId);

      expect(mockPrisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
        where: { id: poId, organizationId: orgId },
        include: expect.any(Object),
      });
      expect(result.id).toBe(poId);
      expect(result.orderNumber).toBe(samplePo.orderNumber);
    });

    it("should throw NotFoundError when accessing cross-tenant order (anti-IDOR)", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(null);

      await expect(service.getPurchaseOrderById(otherOrgId, poId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updatePurchaseOrder", () => {
    it("should update draft purchase order and replace line items atomically", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(samplePo);
      mockPrisma.product.findMany.mockResolvedValueOnce([sampleProducts[0]]);
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        notes: "Updated delivery instructions",
        subtotal: new Prisma.Decimal(75),
        totalAmount: new Prisma.Decimal(75),
        items: [
          {
            ...samplePo.items[0],
            quantityOrdered: new Prisma.Decimal(5),
            unitCost: new Prisma.Decimal(15),
            lineTotal: new Prisma.Decimal(75),
          },
        ],
      });

      const result = await service.updatePurchaseOrder(orgId, poId, {
        notes: "Updated delivery instructions",
        items: [{ productId: productId1, quantityOrdered: 5, unitCost: 15 }],
      });

      expect(mockPrisma.purchaseOrderItem.deleteMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: poId },
      });
      expect(mockPrisma.purchaseOrderItem.createMany).toHaveBeenCalled();
      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalled();
      expect(result.notes).toBe("Updated delivery instructions");
    });

    it("should reject modifying non-DRAFT purchase order", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.APPROVED,
      });

      await expect(
        service.updatePurchaseOrder(orgId, poId, {
          notes: "Attempted edit after approval",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("submitPurchaseOrder", () => {
    it("should transition DRAFT to PENDING_APPROVAL", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(samplePo);
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.PENDING_APPROVAL,
      });

      const result = await service.submitPurchaseOrder(orgId, poId);

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: poId },
        data: { status: PurchaseOrderStatus.PENDING_APPROVAL },
        include: expect.any(Object),
      });
      expect(result.status).toBe(PurchaseOrderStatus.PENDING_APPROVAL);
    });

    it("should throw BadRequestError if purchase order is not DRAFT", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.PENDING_APPROVAL,
      });

      await expect(service.submitPurchaseOrder(orgId, poId)).rejects.toThrow(BadRequestError);
    });
  });

  describe("approvePurchaseOrder", () => {
    it("should approve PENDING_APPROVAL order and record approver audit info", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.PENDING_APPROVAL,
      });
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.APPROVED,
        approvedByUserId: approverUserId,
        approvedAt: new Date("2026-10-27T12:00:00Z"),
      });

      const result = await service.approvePurchaseOrder(orgId, approverUserId, poId);

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: poId },
        data: expect.objectContaining({
          status: PurchaseOrderStatus.APPROVED,
          approvedByUserId: approverUserId,
        }),
        include: expect.any(Object),
      });
      expect(result.status).toBe(PurchaseOrderStatus.APPROVED);
    });

    it("should throw BadRequestError when attempting to approve a DRAFT order directly", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(samplePo);

      await expect(service.approvePurchaseOrder(orgId, approverUserId, poId)).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  describe("cancelPurchaseOrder", () => {
    it("should cancel an APPROVED order when zero quantities have been received", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.APPROVED,
      });
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.CANCELLED,
        cancelledAt: new Date(),
      });

      const result = await service.cancelPurchaseOrder(orgId, poId);

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: poId },
        data: expect.objectContaining({
          status: PurchaseOrderStatus.CANCELLED,
        }),
        include: expect.any(Object),
      });
      expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    });

    it("should reject cancellation if order has received quantities", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
        ...samplePo,
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
        items: [
          {
            ...samplePo.items[0],
            quantityReceived: new Prisma.Decimal(5),
          },
        ],
      });

      await expect(service.cancelPurchaseOrder(orgId, poId)).rejects.toThrow(BadRequestError);
    });
  });

  describe("receiveItems", () => {
    it("should record a partial delivery receipt and update stock balance atomically", async () => {
      const approvedPo = {
        ...samplePo,
        status: PurchaseOrderStatus.APPROVED,
      };

      mockPrisma.purchaseOrderReceipt.findUnique.mockResolvedValueOnce(null);
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(approvedPo);
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(sampleLocation);

      mockPrisma.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({
        ...approvedPo,
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
        items: [
          {
            ...approvedPo.items[0],
            quantityReceived: new Prisma.Decimal(5),
          },
          approvedPo.items[1],
        ],
      });

      const result = await service.receiveItems(orgId, userId, poId, {
        locationId,
        reference: "DELIVERY-BOL-99",
        notes: "First pallet received",
        items: [{ productId: productId1, quantity: 5 }],
      });

      expect(mockPrisma.purchaseOrderReceipt.create).toHaveBeenCalled();
      expect(mockPrisma.purchaseOrderItem.update).toHaveBeenCalledWith({
        where: { id: "poi-1" },
        data: {
          quantityReceived: {
            increment: expect.any(Prisma.Decimal),
          },
        },
      });
      expect(mockStockService.recordReceiptInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          organizationId: orgId,
          productId: productId1,
          locationId,
          quantity: expect.any(Prisma.Decimal),
        }),
      );
      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: poId },
        data: { status: PurchaseOrderStatus.PARTIALLY_RECEIVED },
      });
      expect(result.status).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    });

    it("should transition status to RECEIVED when all items are fully delivered", async () => {
      const partiallyReceivedPo = {
        ...samplePo,
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
        items: [
          {
            ...samplePo.items[0],
            quantityOrdered: new Prisma.Decimal(10),
            quantityReceived: new Prisma.Decimal(10), // already full
          },
          {
            ...samplePo.items[1],
            quantityOrdered: new Prisma.Decimal(20),
            quantityReceived: new Prisma.Decimal(0), // needs 20
          },
        ],
      };

      mockPrisma.purchaseOrderReceipt.findUnique.mockResolvedValueOnce(null);
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(partiallyReceivedPo);
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(sampleLocation);

      mockPrisma.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({
        ...partiallyReceivedPo,
        status: PurchaseOrderStatus.RECEIVED,
        items: [
          partiallyReceivedPo.items[0],
          {
            ...partiallyReceivedPo.items[1],
            quantityReceived: new Prisma.Decimal(20),
          },
        ],
      });

      const result = await service.receiveItems(orgId, userId, poId, {
        locationId,
        items: [{ productId: productId2, quantity: 20 }],
      });

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: poId },
        data: { status: PurchaseOrderStatus.RECEIVED },
      });
      expect(result.status).toBe(PurchaseOrderStatus.RECEIVED);
    });

    it("should reject receiving quantity exceeding outstanding order balance", async () => {
      const approvedPo = {
        ...samplePo,
        status: PurchaseOrderStatus.APPROVED,
      };

      mockPrisma.purchaseOrderReceipt.findUnique.mockResolvedValueOnce(null);
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(approvedPo);
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce(sampleLocation);

      // ordered is 10, receiving 15
      await expect(
        service.receiveItems(orgId, userId, poId, {
          locationId,
          items: [{ productId: productId1, quantity: 15 }],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject receiving against a DRAFT order", async () => {
      mockPrisma.purchaseOrderReceipt.findUnique.mockResolvedValueOnce(null);
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(samplePo); // status DRAFT

      await expect(
        service.receiveItems(orgId, userId, poId, {
          locationId,
          items: [{ productId: productId1, quantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should reject receiving into an inactive warehouse location", async () => {
      const approvedPo = {
        ...samplePo,
        status: PurchaseOrderStatus.APPROVED,
      };

      mockPrisma.purchaseOrderReceipt.findUnique.mockResolvedValueOnce(null);
      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(approvedPo);
      mockPrisma.storageLocation.findFirst.mockResolvedValueOnce({
        ...sampleLocation,
        status: "INACTIVE",
      });

      await expect(
        service.receiveItems(orgId, userId, poId, {
          locationId,
          items: [{ productId: productId1, quantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should return existing purchase order on idempotent retry with matching payload", async () => {
      const payload = {
        locationId,
        idempotencyKey: "idempotent-key-123",
        items: [{ productId: productId1, quantity: 5 }],
      };
      const hash = service.computeRequestHash(payload as Record<string, unknown>);

      mockPrisma.purchaseOrderReceipt.findUnique.mockResolvedValueOnce({
        id: "receipt-uuid-999",
        organizationId: orgId,
        purchaseOrderId: poId,
        idempotencyKey: "idempotent-key-123",
        requestHash: hash,
      });

      mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(samplePo);

      const result = await service.receiveItems(orgId, userId, poId, payload);

      expect(mockPrisma.purchaseOrderItem.update).not.toHaveBeenCalled();
      expect(result.id).toBe(poId);
    });

    it("should throw ConflictError on idempotent retry with mismatched payload", async () => {
      const payload = {
        locationId,
        idempotencyKey: "idempotent-key-123",
        items: [{ productId: productId1, quantity: 5 }],
      };

      mockPrisma.purchaseOrderReceipt.findUnique.mockResolvedValueOnce({
        id: "receipt-uuid-999",
        organizationId: orgId,
        purchaseOrderId: poId,
        idempotencyKey: "idempotent-key-123",
        requestHash: "different-hash-value",
      });

      await expect(service.receiveItems(orgId, userId, poId, payload)).rejects.toThrow(
        ConflictError,
      );
    });
  });
});
