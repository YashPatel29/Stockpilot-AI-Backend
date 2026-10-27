import { randomBytes, createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { NotFoundError, ConflictError, BadRequestError } from "../../../common/errors/http-errors";
import { logger } from "../../../infrastructure/logging/logger";
import { InventoryService, inventoryService } from "../../inventory/inventory.service";
import {
  PurchaseOrderStatus,
  toSafePurchaseOrder,
  type SafePurchaseOrderDto,
  type PaginatedPurchaseOrdersResult,
  type PurchaseOrderWithDetails,
} from "./purchase-order.types";
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ReceivePurchaseOrderItemsInput,
  ListPurchaseOrdersQuery,
} from "./purchase-order.schema";

/**
 * Service managing purchase order lifecycle, approvals, deliveries, and stock ledger synchronization.
 */
export class PurchaseOrderService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly stockService: InventoryService = inventoryService,
  ) {}

  /**
   * Generates a collision-resistant purchase order number: PO-YYYYMMDD-XXXX
   */
  public generateOrderNumber(date = new Date()): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const randomSuffix = randomBytes(2).toString("hex").toUpperCase();
    return `PO-${yyyy}${mm}${dd}-${randomSuffix}`;
  }

  /**
   * Generates a deterministic SHA-256 hash of a normalized receipt request payload
   * for idempotency verification.
   */
  public computeRequestHash(payload: Record<string, unknown>): string {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(payload).sort()) {
      if (key !== "idempotencyKey" && payload[key] !== undefined) {
        sorted[key] = payload[key];
      }
    }
    return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
  }

  /**
   * Creates a new purchase order in DRAFT status with calculated line totals.
   */
  public async createPurchaseOrder(
    organizationId: string,
    userId: string,
    input: CreatePurchaseOrderInput,
  ): Promise<SafePurchaseOrderDto> {
    // 1. Verify supplier exists and is active within organization
    const supplier = await this.db.supplier.findFirst({
      where: {
        id: input.supplierId,
        organizationId,
      },
    });

    if (!supplier) {
      throw new NotFoundError("Supplier not found in this organization.");
    }
    if (!supplier.isActive) {
      throw new BadRequestError("Cannot create a purchase order for an inactive supplier.");
    }

    // 2. Verify all products exist and are active within organization
    const productIds = input.items.map((i) => i.productId);
    const products = await this.db.product.findMany({
      where: {
        id: { in: productIds },
        organizationId,
      },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundError("One or more products were not found in this organization.");
    }

    const inactiveProduct = products.find((p) => p.status !== "ACTIVE");
    if (inactiveProduct) {
      throw new BadRequestError(
        `Cannot create purchase order with inactive or archived product '${inactiveProduct.sku}'.`,
      );
    }

    // 3. Compute item totals, subtotal, and grand total
    let subtotal = new Prisma.Decimal(0);
    const itemsData = input.items.map((item) => {
      const quantityOrdered = new Prisma.Decimal(item.quantityOrdered);
      const unitCost = new Prisma.Decimal(item.unitCost);
      const lineTotal = quantityOrdered.mul(unitCost);
      subtotal = subtotal.add(lineTotal);

      return {
        productId: item.productId,
        quantityOrdered,
        quantityReceived: new Prisma.Decimal(0),
        unitCost,
        lineTotal,
      };
    });

    const taxAmount = new Prisma.Decimal(input.taxAmount);
    const totalAmount = subtotal.add(taxAmount);
    const orderDate = input.orderDate ?? new Date();

    // 4. Persist with retry on collision of orderNumber
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      attempts++;
      const orderNumber = this.generateOrderNumber(orderDate);

      try {
        const created = await this.db.purchaseOrder.create({
          data: {
            organizationId,
            supplierId: input.supplierId,
            orderNumber,
            status: PurchaseOrderStatus.DRAFT,
            orderDate,
            expectedDeliveryDate: input.expectedDeliveryDate ?? null,
            currency: input.currency,
            subtotal,
            taxAmount,
            totalAmount,
            notes: input.notes?.trim() || null,
            createdByUserId: userId,
            items: {
              create: itemsData,
            },
          },
          include: {
            supplier: true,
            createdByUser: true,
            items: {
              include: { product: true },
            },
          },
        });

        logger.info(
          { organizationId, purchaseOrderId: created.id, orderNumber: created.orderNumber },
          "Purchase order draft created successfully",
        );

        return toSafePurchaseOrder(created as PurchaseOrderWithDetails);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: string }).code === "P2002" &&
          attempts < maxAttempts
        ) {
          logger.warn(
            { orderNumber, attempt: attempts },
            "Order number collision detected, retrying with new number",
          );
          continue;
        }
        throw error;
      }
    }

    throw new ConflictError("Failed to generate a unique order number. Please try again.");
  }

  /**
   * Retrieves a purchase order by ID including line items and delivery receipts.
   */
  public async getPurchaseOrderById(
    organizationId: string,
    purchaseOrderId: string,
  ): Promise<SafePurchaseOrderDto> {
    const po = await this.db.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        organizationId,
      },
      include: {
        supplier: true,
        createdByUser: true,
        approvedByUser: true,
        items: {
          include: { product: true },
          orderBy: { createdAt: "asc" },
        },
        receipts: {
          include: {
            location: true,
            receivedByUser: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!po) {
      throw new NotFoundError("Purchase order not found in this organization.");
    }

    return toSafePurchaseOrder(po as PurchaseOrderWithDetails);
  }

  /**
   * Retrieves a paginated list of purchase orders matching query criteria.
   */
  public async listPurchaseOrders(
    organizationId: string,
    query: ListPurchaseOrdersQuery,
  ): Promise<PaginatedPurchaseOrdersResult> {
    const { page, limit, supplierId, status, search, startDate, endDate, sortBy, sortOrder } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      ...(supplierId && { supplierId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...((startDate || endDate) && {
        orderDate: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }),
    };

    const [totalItems, orders] = await Promise.all([
      this.db.purchaseOrder.count({ where }),
      this.db.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          supplier: true,
          createdByUser: true,
          approvedByUser: true,
          items: {
            include: { product: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: orders.map((o) => toSafePurchaseOrder(o as PurchaseOrderWithDetails)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Updates fields or items of an existing DRAFT purchase order.
   */
  public async updatePurchaseOrder(
    organizationId: string,
    purchaseOrderId: string,
    input: UpdatePurchaseOrderInput,
  ): Promise<SafePurchaseOrderDto> {
    const existing = await this.db.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        organizationId,
      },
      include: {
        items: true,
      },
    });

    if (!existing) {
      throw new NotFoundError("Purchase order not found in this organization.");
    }

    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestError(
        `Only purchase orders in DRAFT status can be modified. Current status: ${existing.status}.`,
      );
    }

    // Verify supplier if updating
    if (input.supplierId && input.supplierId !== existing.supplierId) {
      const supplier = await this.db.supplier.findFirst({
        where: { id: input.supplierId, organizationId },
      });
      if (!supplier) {
        throw new NotFoundError("Supplier not found in this organization.");
      }
      if (!supplier.isActive) {
        throw new BadRequestError("Cannot assign an inactive supplier to a purchase order.");
      }
    }

    // Verify products if updating items
    if (input.items) {
      const productIds = input.items.map((i) => i.productId);
      const products = await this.db.product.findMany({
        where: {
          id: { in: productIds },
          organizationId,
        },
      });

      if (products.length !== productIds.length) {
        throw new NotFoundError("One or more products were not found in this organization.");
      }

      const inactiveProduct = products.find((p) => p.status !== "ACTIVE");
      if (inactiveProduct) {
        throw new BadRequestError(
          `Cannot update purchase order with inactive product '${inactiveProduct.sku}'.`,
        );
      }
    }

    return this.db.$transaction(async (tx) => {
      let subtotal = new Prisma.Decimal(existing.subtotal);

      if (input.items) {
        // Delete existing items and rebuild
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId },
        });

        subtotal = new Prisma.Decimal(0);
        const newItems = input.items.map((item) => {
          const quantityOrdered = new Prisma.Decimal(item.quantityOrdered);
          const unitCost = new Prisma.Decimal(item.unitCost);
          const lineTotal = quantityOrdered.mul(unitCost);
          subtotal = subtotal.add(lineTotal);

          return {
            purchaseOrderId,
            productId: item.productId,
            quantityOrdered,
            quantityReceived: new Prisma.Decimal(0),
            unitCost,
            lineTotal,
          };
        });

        await tx.purchaseOrderItem.createMany({
          data: newItems,
        });
      }

      const taxAmount =
        input.taxAmount !== undefined
          ? new Prisma.Decimal(input.taxAmount)
          : new Prisma.Decimal(existing.taxAmount);
      const totalAmount = subtotal.add(taxAmount);

      const updated = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          ...(input.supplierId && { supplierId: input.supplierId }),
          ...(input.orderDate && { orderDate: input.orderDate }),
          ...(input.expectedDeliveryDate !== undefined && {
            expectedDeliveryDate: input.expectedDeliveryDate,
          }),
          ...(input.currency && { currency: input.currency }),
          subtotal,
          taxAmount,
          totalAmount,
          ...(input.notes !== undefined && {
            notes: input.notes ? input.notes.trim() : null,
          }),
        },
        include: {
          supplier: true,
          createdByUser: true,
          items: {
            include: { product: true },
          },
        },
      });

      logger.info(
        { organizationId, purchaseOrderId, orderNumber: updated.orderNumber },
        "Purchase order updated successfully",
      );

      return toSafePurchaseOrder(updated as PurchaseOrderWithDetails);
    });
  }

  /**
   * Submits a DRAFT purchase order for managerial approval.
   */
  public async submitPurchaseOrder(
    organizationId: string,
    purchaseOrderId: string,
  ): Promise<SafePurchaseOrderDto> {
    const existing = await this.db.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Purchase order not found in this organization.");
    }

    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestError(
        `Only DRAFT purchase orders can be submitted for approval. Current status: ${existing.status}.`,
      );
    }

    const updated = await this.db.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: PurchaseOrderStatus.PENDING_APPROVAL,
      },
      include: {
        supplier: true,
        createdByUser: true,
        items: {
          include: { product: true },
        },
      },
    });

    logger.info(
      { organizationId, purchaseOrderId, orderNumber: updated.orderNumber },
      "Purchase order submitted for approval",
    );

    return toSafePurchaseOrder(updated as PurchaseOrderWithDetails);
  }

  /**
   * Approves a PENDING_APPROVAL purchase order.
   */
  public async approvePurchaseOrder(
    organizationId: string,
    userId: string,
    purchaseOrderId: string,
  ): Promise<SafePurchaseOrderDto> {
    const existing = await this.db.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Purchase order not found in this organization.");
    }

    if (existing.status !== PurchaseOrderStatus.PENDING_APPROVAL) {
      throw new BadRequestError(
        `Only purchase orders in PENDING_APPROVAL status can be approved. Current status: ${existing.status}.`,
      );
    }

    const updated = await this.db.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: PurchaseOrderStatus.APPROVED,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
      include: {
        supplier: true,
        createdByUser: true,
        approvedByUser: true,
        items: {
          include: { product: true },
        },
      },
    });

    logger.info(
      { organizationId, purchaseOrderId, approvedByUserId: userId },
      "Purchase order approved successfully",
    );

    return toSafePurchaseOrder(updated as PurchaseOrderWithDetails);
  }

  /**
   * Cancels a purchase order if no items have been received.
   */
  public async cancelPurchaseOrder(
    organizationId: string,
    purchaseOrderId: string,
  ): Promise<SafePurchaseOrderDto> {
    const existing = await this.db.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        organizationId,
      },
      include: {
        items: true,
      },
    });

    if (!existing) {
      throw new NotFoundError("Purchase order not found in this organization.");
    }

    if (existing.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestError("Purchase order is already cancelled.");
    }

    if (
      existing.status === PurchaseOrderStatus.RECEIVED ||
      existing.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestError(
        "Cannot cancel a purchase order that has already received inventory.",
      );
    }

    const hasReceivedItems = existing.items.some((i) =>
      new Prisma.Decimal(i.quantityReceived).gt(0),
    );
    if (hasReceivedItems) {
      throw new BadRequestError("Cannot cancel a purchase order with received items.");
    }

    const updated = await this.db.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: {
        supplier: true,
        createdByUser: true,
        approvedByUser: true,
        items: {
          include: { product: true },
        },
      },
    });

    logger.info(
      { organizationId, purchaseOrderId, orderNumber: updated.orderNumber },
      "Purchase order cancelled successfully",
    );

    return toSafePurchaseOrder(updated as PurchaseOrderWithDetails);
  }

  /**
   * Records a partial or complete delivery receipt against an APPROVED or PARTIALLY_RECEIVED purchase order.
   * Atomically updates received line item quantities, stock balances, and ledger transactions.
   */
  public async receiveItems(
    organizationId: string,
    userId: string,
    purchaseOrderId: string,
    input: ReceivePurchaseOrderItemsInput,
  ): Promise<SafePurchaseOrderDto> {
    const requestHash = input.idempotencyKey
      ? this.computeRequestHash(input as unknown as Record<string, unknown>)
      : null;

    // 1. Enforce idempotency check if a key was provided
    if (input.idempotencyKey) {
      const existingReceipt = await this.db.purchaseOrderReceipt.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (existingReceipt) {
        if (existingReceipt.requestHash !== requestHash) {
          throw new ConflictError(
            "Idempotency key has already been used with a different request payload.",
          );
        }

        return this.getPurchaseOrderById(organizationId, purchaseOrderId);
      }
    }

    // 2. Validate purchase order exists and is in an eligible status
    const po = await this.db.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        organizationId,
      },
      include: {
        items: true,
      },
    });

    if (!po) {
      throw new NotFoundError("Purchase order not found in this organization.");
    }

    if (
      po.status !== PurchaseOrderStatus.APPROVED &&
      po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestError(
        `Items can only be received for APPROVED or PARTIALLY_RECEIVED purchase orders. Current status: ${po.status}.`,
      );
    }

    // 3. Validate storage location exists and is active, along with parent warehouse
    const location = await this.db.storageLocation.findFirst({
      where: {
        id: input.locationId,
        organizationId,
      },
      include: { warehouse: true },
    });

    if (!location) {
      throw new NotFoundError("Storage location not found in this organization.");
    }
    if (location.status !== "ACTIVE") {
      throw new BadRequestError("Cannot receive items into an inactive storage location.");
    }
    if (location.warehouse.status !== "ACTIVE") {
      throw new BadRequestError(
        "Cannot receive items into a storage location belonging to an inactive warehouse.",
      );
    }

    // 4. Validate all received items against purchase order lines and check outstanding quantities
    const itemsByProduct = new Map(po.items.map((i) => [i.productId, i]));
    const receivingDecimals = new Map<string, Prisma.Decimal>();

    for (const item of input.items) {
      const poItem = itemsByProduct.get(item.productId);
      if (!poItem) {
        throw new BadRequestError(
          `Product ID '${item.productId}' is not part of this purchase order.`,
        );
      }

      const ordered = new Prisma.Decimal(poItem.quantityOrdered);
      const alreadyReceived = new Prisma.Decimal(poItem.quantityReceived);
      const outstanding = ordered.sub(alreadyReceived);
      const receiving = new Prisma.Decimal(item.quantity);

      if (receiving.gt(outstanding)) {
        throw new BadRequestError(
          `Received quantity (${receiving.toFixed(4)}) exceeds outstanding quantity (${outstanding.toFixed(4)}) for product ID '${item.productId}'.`,
        );
      }

      receivingDecimals.set(item.productId, receiving);
    }

    // 5. Execute atomic transaction updating lines, inventory balances, ledger, and receipt audit
    return this.db.$transaction(async (tx) => {
      // Create receipt record
      await tx.purchaseOrderReceipt.create({
        data: {
          organizationId,
          purchaseOrderId,
          locationId: input.locationId,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          idempotencyKey: input.idempotencyKey?.trim() || null,
          requestHash,
          receivedByUserId: userId,
        },
      });

      // Update line items and stock balances
      for (const [productId, receivingQty] of receivingDecimals.entries()) {
        const poItem = itemsByProduct.get(productId);
        if (!poItem) continue;

        // Update purchase order item quantityReceived
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            quantityReceived: {
              increment: receivingQty,
            },
          },
        });

        // Update inventory balance and create ledger transaction via shared service logic
        await this.stockService.recordReceiptInTx(tx, {
          organizationId,
          userId,
          warehouseId: location.warehouseId,
          locationId: input.locationId,
          productId,
          quantity: receivingQty,
          reference: input.reference?.trim() || po.orderNumber,
          notes: input.notes?.trim() || `Receipt for PO ${po.orderNumber}`,
        });
      }

      // Check whether all line items are now completely fulfilled
      let allFulfilled = true;
      for (const poItem of po.items) {
        const justReceived = receivingDecimals.get(poItem.productId) ?? new Prisma.Decimal(0);
        const totalReceived = new Prisma.Decimal(poItem.quantityReceived).add(justReceived);
        if (totalReceived.lt(new Prisma.Decimal(poItem.quantityOrdered))) {
          allFulfilled = false;
          break;
        }
      }

      const newStatus = allFulfilled
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: newStatus },
      });

      logger.info(
        {
          organizationId,
          purchaseOrderId,
          orderNumber: po.orderNumber,
          newStatus,
          itemCount: input.items.length,
        },
        "Purchase order receipt recorded and stock balances updated",
      );

      // Fetch full PO with relations
      const updated = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: purchaseOrderId },
        include: {
          supplier: true,
          createdByUser: true,
          approvedByUser: true,
          items: {
            include: { product: true },
            orderBy: { createdAt: "asc" },
          },
          receipts: {
            include: {
              location: true,
              receivedByUser: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      return toSafePurchaseOrder(updated as PurchaseOrderWithDetails);
    });
  }
}

export const purchaseOrderService = new PurchaseOrderService();
