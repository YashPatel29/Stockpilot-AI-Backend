import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { NotFoundError, ConflictError, BadRequestError } from "../../common/errors/http-errors";
import { logger } from "../../infrastructure/logging/logger";
import {
  InventoryTransactionType,
  toSafeBalance,
  toSafeTransaction,
  type SafeInventoryBalanceDto,
  type PaginatedBalancesResult,
  type PaginatedTransactionsResult,
  type MutationResult,
} from "./inventory.types";
import type {
  ReceiptInput,
  IssueInput,
  AdjustmentInput,
  TransferInput,
  ListBalancesQuery,
  ListTransactionsQuery,
} from "./inventory.schema";

/**
 * Service managing concurrency-safe inventory balances, append-only ledger transactions,
 * and multi-tenant stock receipts, issues, adjustments, and transfers.
 */
export class InventoryService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Generates a deterministic SHA-256 hash of a normalized mutation payload to detect
   * conflicting reuse of client idempotency keys.
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
   * Retrieves a paginated list of inventory balances filtered by product, warehouse, location, or search.
   */
  public async listBalances(
    organizationId: string,
    query: ListBalancesQuery,
  ): Promise<PaginatedBalancesResult> {
    const { page, limit, productId, warehouseId, locationId, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryBalanceWhereInput = {
      organizationId,
      ...(productId && { productId }),
      ...(warehouseId && { warehouseId }),
      ...(locationId && { locationId }),
      ...(search && {
        product: {
          OR: [
            { sku: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        },
      }),
    };

    const [totalItems, balances] = await Promise.all([
      this.db.inventoryBalance.count({ where }),
      this.db.inventoryBalance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              unitOfMeasure: true,
              status: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
            },
          },
          location: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: balances.map((b) => toSafeBalance(b)),
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
   * Receives stock into a location, atomically increasing the balance and recording a RECEIPT ledger entry.
   */
  public async receiveStock(
    organizationId: string,
    userId: string,
    input: ReceiptInput,
  ): Promise<MutationResult> {
    const requestHash = input.idempotencyKey
      ? this.computeRequestHash(input as unknown as Record<string, unknown>)
      : null;

    // 1. Enforce idempotency check if a key was provided
    if (input.idempotencyKey) {
      const existing = await this.db.inventoryTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: {
          product: true,
          warehouse: true,
          destinationLocation: true,
          performedByUser: true,
        },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictError(
            "Idempotency key has already been used with a different request payload.",
          );
        }

        const currentBalance = await this.db.inventoryBalance.findUnique({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.locationId,
            },
          },
          include: {
            product: true,
            warehouse: true,
            location: true,
          },
        });

        return {
          transaction: toSafeTransaction(existing),
          balance: currentBalance ? toSafeBalance(currentBalance) : undefined,
        };
      }
    }

    // 2. Validate product exists in org and is ACTIVE
    const product = await this.db.product.findFirst({
      where: { id: input.productId, organizationId },
    });
    if (!product) {
      throw new NotFoundError("Product not found in this organization.");
    }
    if (product.status !== "ACTIVE") {
      throw new BadRequestError("Cannot receive stock for an inactive or archived product.");
    }

    // 3. Validate storage location exists in org and is ACTIVE, along with parent warehouse
    const location = await this.db.storageLocation.findFirst({
      where: { id: input.locationId, organizationId },
      include: { warehouse: true },
    });
    if (!location) {
      throw new NotFoundError("Storage location not found in this organization.");
    }
    if (location.status !== "ACTIVE") {
      throw new BadRequestError("Cannot receive stock into an inactive storage location.");
    }
    if (location.warehouse.status !== "ACTIVE") {
      throw new BadRequestError(
        "Cannot receive stock into a storage location belonging to an inactive warehouse.",
      );
    }

    const qtyDecimal = new Prisma.Decimal(input.quantity);

    // 4. Atomic balance upsert and ledger creation in a database transaction
    return this.executeWithRetry(async () => {
      return this.db.$transaction(async (tx) => {
        const { balance, transaction } = await this.recordReceiptInTx(tx, {
          organizationId,
          userId,
          warehouseId: location.warehouseId,
          locationId: input.locationId,
          productId: input.productId,
          quantity: qtyDecimal,
          reference: input.reference,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          requestHash,
        });

        logger.info(
          {
            organizationId,
            productId: input.productId,
            locationId: input.locationId,
            quantity: qtyDecimal.toFixed(4),
            transactionId: transaction.id,
          },
          "Stock received successfully",
        );

        return {
          transaction: toSafeTransaction(transaction),
          balance: toSafeBalance(balance),
        };
      });
    });
  }

  /**
   * Internal method allowing transactional stock receipt updates from external orchestrators (e.g., PurchaseOrderService).
   * Atomically upserts InventoryBalance and creates an InventoryTransaction ledger record.
   */
  public async recordReceiptInTx(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      userId: string;
      warehouseId: string;
      locationId: string;
      productId: string;
      quantity: Prisma.Decimal;
      reference?: string | null;
      notes?: string | null;
      idempotencyKey?: string | null;
      requestHash?: string | null;
    },
  ) {
    const balance = await tx.inventoryBalance.upsert({
      where: {
        productId_locationId: {
          productId: params.productId,
          locationId: params.locationId,
        },
      },
      create: {
        organizationId: params.organizationId,
        productId: params.productId,
        warehouseId: params.warehouseId,
        locationId: params.locationId,
        quantityOnHand: params.quantity,
      },
      update: {
        quantityOnHand: {
          increment: params.quantity,
        },
      },
      include: {
        product: true,
        warehouse: true,
        location: true,
      },
    });

    const transaction = await tx.inventoryTransaction.create({
      data: {
        organizationId: params.organizationId,
        productId: params.productId,
        warehouseId: params.warehouseId,
        type: InventoryTransactionType.RECEIPT,
        quantity: params.quantity,
        quantityDelta: params.quantity,
        destinationLocationId: params.locationId,
        reference: params.reference?.trim() || null,
        notes: params.notes?.trim() || null,
        idempotencyKey: params.idempotencyKey?.trim() || null,
        requestHash: params.requestHash ?? null,
        performedByUserId: params.userId,
      },
      include: {
        product: true,
        warehouse: true,
        destinationLocation: true,
        performedByUser: true,
      },
    });

    return { balance, transaction };
  }

  /**
   * Issues stock from a location, atomically decreasing the balance and recording an ISSUE ledger entry.
   * Rejects if available stock is insufficient, preventing overselling.
   */
  public async issueStock(
    organizationId: string,
    userId: string,
    input: IssueInput,
  ): Promise<MutationResult> {
    const requestHash = input.idempotencyKey
      ? this.computeRequestHash(input as unknown as Record<string, unknown>)
      : null;

    // 1. Enforce idempotency check if key provided
    if (input.idempotencyKey) {
      const existing = await this.db.inventoryTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: {
          product: true,
          warehouse: true,
          sourceLocation: true,
          performedByUser: true,
        },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictError(
            "Idempotency key has already been used with a different request payload.",
          );
        }

        const currentBalance = await this.db.inventoryBalance.findUnique({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.locationId,
            },
          },
          include: {
            product: true,
            warehouse: true,
            location: true,
          },
        });

        return {
          transaction: toSafeTransaction(existing),
          balance: currentBalance ? toSafeBalance(currentBalance) : undefined,
        };
      }
    }

    // 2. Validate product exists in org and is ACTIVE
    const product = await this.db.product.findFirst({
      where: { id: input.productId, organizationId },
    });
    if (!product) {
      throw new NotFoundError("Product not found in this organization.");
    }
    if (product.status !== "ACTIVE") {
      throw new BadRequestError("Cannot issue stock for an inactive or archived product.");
    }

    // 3. Validate storage location exists in org and is ACTIVE, along with parent warehouse
    const location = await this.db.storageLocation.findFirst({
      where: { id: input.locationId, organizationId },
      include: { warehouse: true },
    });
    if (!location) {
      throw new NotFoundError("Storage location not found in this organization.");
    }
    if (location.status !== "ACTIVE") {
      throw new BadRequestError("Cannot issue stock from an inactive storage location.");
    }
    if (location.warehouse.status !== "ACTIVE") {
      throw new BadRequestError(
        "Cannot issue stock from a storage location belonging to an inactive warehouse.",
      );
    }

    const qtyDecimal = new Prisma.Decimal(input.quantity);

    // 4. Atomic conditional decrement and ledger recording
    return this.executeWithRetry(async () => {
      return this.db.$transaction(async (tx) => {
        const current = await tx.inventoryBalance.findUnique({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.locationId,
            },
          },
        });

        if (!current || new Prisma.Decimal(current.quantityOnHand).lt(qtyDecimal)) {
          const available = current
            ? new Prisma.Decimal(current.quantityOnHand).toFixed(4)
            : "0.0000";
          throw new BadRequestError(
            `Insufficient stock at location. Requested: ${qtyDecimal.toFixed(4)}, available: ${available}.`,
          );
        }

        // Conditional atomic decrement: guarantees balance never drops below zero even under concurrency
        const updateResult = await tx.inventoryBalance.updateMany({
          where: {
            productId: input.productId,
            locationId: input.locationId,
            quantityOnHand: {
              gte: qtyDecimal,
            },
          },
          data: {
            quantityOnHand: {
              decrement: qtyDecimal,
            },
          },
        });

        if (updateResult.count === 0) {
          throw new BadRequestError(
            "Insufficient stock available to complete the issue operation.",
          );
        }

        const updatedBalance = await tx.inventoryBalance.findUniqueOrThrow({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.locationId,
            },
          },
          include: {
            product: true,
            warehouse: true,
            location: true,
          },
        });

        const transaction = await tx.inventoryTransaction.create({
          data: {
            organizationId,
            productId: input.productId,
            warehouseId: location.warehouseId,
            type: InventoryTransactionType.ISSUE,
            quantity: qtyDecimal,
            quantityDelta: qtyDecimal.negated(),
            sourceLocationId: input.locationId,
            reason: input.reason?.trim() || null,
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            idempotencyKey: input.idempotencyKey?.trim() || null,
            requestHash,
            performedByUserId: userId,
          },
          include: {
            product: true,
            warehouse: true,
            sourceLocation: true,
            performedByUser: true,
          },
        });

        logger.info(
          {
            organizationId,
            productId: input.productId,
            locationId: input.locationId,
            quantity: qtyDecimal.toFixed(4),
            transactionId: transaction.id,
          },
          "Stock issued successfully",
        );

        return {
          transaction: toSafeTransaction(transaction),
          balance: toSafeBalance(updatedBalance),
        };
      });
    });
  }

  /**
   * Adjusts stock at a location using a signed delta, ensuring negative stock is prevented.
   */
  public async adjustStock(
    organizationId: string,
    userId: string,
    input: AdjustmentInput,
  ): Promise<MutationResult> {
    const requestHash = input.idempotencyKey
      ? this.computeRequestHash(input as unknown as Record<string, unknown>)
      : null;

    // 1. Enforce idempotency check if key provided
    if (input.idempotencyKey) {
      const existing = await this.db.inventoryTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: {
          product: true,
          warehouse: true,
          sourceLocation: true,
          destinationLocation: true,
          performedByUser: true,
        },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictError(
            "Idempotency key has already been used with a different request payload.",
          );
        }

        const currentBalance = await this.db.inventoryBalance.findUnique({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.locationId,
            },
          },
          include: {
            product: true,
            warehouse: true,
            location: true,
          },
        });

        return {
          transaction: toSafeTransaction(existing),
          balance: currentBalance ? toSafeBalance(currentBalance) : undefined,
        };
      }
    }

    // 2. Validate product exists in org and is ACTIVE
    const product = await this.db.product.findFirst({
      where: { id: input.productId, organizationId },
    });
    if (!product) {
      throw new NotFoundError("Product not found in this organization.");
    }
    if (product.status !== "ACTIVE") {
      throw new BadRequestError("Cannot adjust stock for an inactive or archived product.");
    }

    // 3. Validate storage location exists in org and is ACTIVE, along with parent warehouse
    const location = await this.db.storageLocation.findFirst({
      where: { id: input.locationId, organizationId },
      include: { warehouse: true },
    });
    if (!location) {
      throw new NotFoundError("Storage location not found in this organization.");
    }
    if (location.status !== "ACTIVE") {
      throw new BadRequestError("Cannot adjust stock at an inactive storage location.");
    }
    if (location.warehouse.status !== "ACTIVE") {
      throw new BadRequestError(
        "Cannot adjust stock at a storage location belonging to an inactive warehouse.",
      );
    }

    const deltaDecimal = new Prisma.Decimal(input.quantityDelta);
    const absQty = deltaDecimal.abs();
    const isPositive = deltaDecimal.isPositive();

    // 4. Atomic balance adjustment and ledger recording
    return this.executeWithRetry(async () => {
      return this.db.$transaction(async (tx) => {
        let updatedBalance: SafeInventoryBalanceDto;

        if (isPositive) {
          // Positive adjustment: upsert balance increment
          const balance = await tx.inventoryBalance.upsert({
            where: {
              productId_locationId: {
                productId: input.productId,
                locationId: input.locationId,
              },
            },
            create: {
              organizationId,
              productId: input.productId,
              warehouseId: location.warehouseId,
              locationId: input.locationId,
              quantityOnHand: deltaDecimal,
            },
            update: {
              quantityOnHand: {
                increment: deltaDecimal,
              },
            },
            include: {
              product: true,
              warehouse: true,
              location: true,
            },
          });
          updatedBalance = toSafeBalance(balance);
        } else {
          // Negative adjustment: check and atomically decrement
          const current = await tx.inventoryBalance.findUnique({
            where: {
              productId_locationId: {
                productId: input.productId,
                locationId: input.locationId,
              },
            },
          });

          if (!current || new Prisma.Decimal(current.quantityOnHand).lt(absQty)) {
            const available = current
              ? new Prisma.Decimal(current.quantityOnHand).toFixed(4)
              : "0.0000";
            throw new BadRequestError(
              `Stock adjustment would result in negative stock. Required: ${absQty.toFixed(4)}, available: ${available}.`,
            );
          }

          const updateResult = await tx.inventoryBalance.updateMany({
            where: {
              productId: input.productId,
              locationId: input.locationId,
              quantityOnHand: {
                gte: absQty,
              },
            },
            data: {
              quantityOnHand: {
                decrement: absQty,
              },
            },
          });

          if (updateResult.count === 0) {
            throw new BadRequestError("Stock adjustment would result in negative stock.");
          }

          const rawBalance = await tx.inventoryBalance.findUniqueOrThrow({
            where: {
              productId_locationId: {
                productId: input.productId,
                locationId: input.locationId,
              },
            },
            include: {
              product: true,
              warehouse: true,
              location: true,
            },
          });
          updatedBalance = toSafeBalance(rawBalance);
        }

        const transaction = await tx.inventoryTransaction.create({
          data: {
            organizationId,
            productId: input.productId,
            warehouseId: location.warehouseId,
            type: InventoryTransactionType.ADJUSTMENT,
            quantity: absQty,
            quantityDelta: deltaDecimal,
            sourceLocationId: !isPositive ? input.locationId : null,
            destinationLocationId: isPositive ? input.locationId : null,
            reason: input.reason.trim(),
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            idempotencyKey: input.idempotencyKey?.trim() || null,
            requestHash,
            performedByUserId: userId,
          },
          include: {
            product: true,
            warehouse: true,
            sourceLocation: true,
            destinationLocation: true,
            performedByUser: true,
          },
        });

        logger.info(
          {
            organizationId,
            productId: input.productId,
            locationId: input.locationId,
            delta: deltaDecimal.toFixed(4),
            transactionId: transaction.id,
          },
          "Stock adjusted successfully",
        );

        return {
          transaction: toSafeTransaction(transaction),
          balance: updatedBalance,
        };
      });
    });
  }

  /**
   * Transfers stock between distinct locations atomically, updating both balances and
   * creating exactly ONE logical ledger transaction entry.
   */
  public async transferStock(
    organizationId: string,
    userId: string,
    input: TransferInput,
  ): Promise<MutationResult> {
    if (input.sourceLocationId === input.destinationLocationId) {
      throw new BadRequestError("Source and destination storage locations must be distinct.");
    }

    const requestHash = input.idempotencyKey
      ? this.computeRequestHash(input as unknown as Record<string, unknown>)
      : null;

    // 1. Enforce idempotency check if key provided
    if (input.idempotencyKey) {
      const existing = await this.db.inventoryTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: {
          product: true,
          warehouse: true,
          sourceLocation: true,
          destinationLocation: true,
          performedByUser: true,
        },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictError(
            "Idempotency key has already been used with a different request payload.",
          );
        }

        const [sourceBal, destBal] = await Promise.all([
          this.db.inventoryBalance.findUnique({
            where: {
              productId_locationId: {
                productId: input.productId,
                locationId: input.sourceLocationId,
              },
            },
            include: { product: true, warehouse: true, location: true },
          }),
          this.db.inventoryBalance.findUnique({
            where: {
              productId_locationId: {
                productId: input.productId,
                locationId: input.destinationLocationId,
              },
            },
            include: { product: true, warehouse: true, location: true },
          }),
        ]);

        return {
          transaction: toSafeTransaction(existing),
          sourceBalance: sourceBal ? toSafeBalance(sourceBal) : undefined,
          destinationBalance: destBal ? toSafeBalance(destBal) : undefined,
        };
      }
    }

    // 2. Validate product exists in org and is ACTIVE
    const product = await this.db.product.findFirst({
      where: { id: input.productId, organizationId },
    });
    if (!product) {
      throw new NotFoundError("Product not found in this organization.");
    }
    if (product.status !== "ACTIVE") {
      throw new BadRequestError("Cannot transfer stock for an inactive or archived product.");
    }

    // 3. Validate source location exists in org and is ACTIVE, along with warehouse
    const sourceLocation = await this.db.storageLocation.findFirst({
      where: { id: input.sourceLocationId, organizationId },
      include: { warehouse: true },
    });
    if (!sourceLocation) {
      throw new NotFoundError("Source storage location not found in this organization.");
    }
    if (sourceLocation.status !== "ACTIVE") {
      throw new BadRequestError("Cannot transfer stock from an inactive storage location.");
    }
    if (sourceLocation.warehouse.status !== "ACTIVE") {
      throw new BadRequestError(
        "Cannot transfer stock from a storage location belonging to an inactive warehouse.",
      );
    }

    // 4. Validate destination location exists in org and is ACTIVE, along with warehouse
    const destLocation = await this.db.storageLocation.findFirst({
      where: { id: input.destinationLocationId, organizationId },
      include: { warehouse: true },
    });
    if (!destLocation) {
      throw new NotFoundError("Destination storage location not found in this organization.");
    }
    if (destLocation.status !== "ACTIVE") {
      throw new BadRequestError("Cannot transfer stock to an inactive storage location.");
    }
    if (destLocation.warehouse.status !== "ACTIVE") {
      throw new BadRequestError(
        "Cannot transfer stock to a storage location belonging to an inactive warehouse.",
      );
    }

    const qtyDecimal = new Prisma.Decimal(input.quantity);

    // 5. Atomic transfer transaction: decrement source, increment destination, create 1 ledger record
    return this.executeWithRetry(async () => {
      return this.db.$transaction(async (tx) => {
        const sourceCurrent = await tx.inventoryBalance.findUnique({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.sourceLocationId,
            },
          },
        });

        if (!sourceCurrent || new Prisma.Decimal(sourceCurrent.quantityOnHand).lt(qtyDecimal)) {
          const available = sourceCurrent
            ? new Prisma.Decimal(sourceCurrent.quantityOnHand).toFixed(4)
            : "0.0000";
          throw new BadRequestError(
            `Insufficient stock at source location. Requested: ${qtyDecimal.toFixed(4)}, available: ${available}.`,
          );
        }

        const sourceUpdate = await tx.inventoryBalance.updateMany({
          where: {
            productId: input.productId,
            locationId: input.sourceLocationId,
            quantityOnHand: {
              gte: qtyDecimal,
            },
          },
          data: {
            quantityOnHand: {
              decrement: qtyDecimal,
            },
          },
        });

        if (sourceUpdate.count === 0) {
          throw new BadRequestError("Insufficient stock at source location to complete transfer.");
        }

        const destinationBalance = await tx.inventoryBalance.upsert({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.destinationLocationId,
            },
          },
          create: {
            organizationId,
            productId: input.productId,
            warehouseId: destLocation.warehouseId,
            locationId: input.destinationLocationId,
            quantityOnHand: qtyDecimal,
          },
          update: {
            quantityOnHand: {
              increment: qtyDecimal,
            },
          },
          include: {
            product: true,
            warehouse: true,
            location: true,
          },
        });

        const updatedSourceBalance = await tx.inventoryBalance.findUniqueOrThrow({
          where: {
            productId_locationId: {
              productId: input.productId,
              locationId: input.sourceLocationId,
            },
          },
          include: {
            product: true,
            warehouse: true,
            location: true,
          },
        });

        const transaction = await tx.inventoryTransaction.create({
          data: {
            organizationId,
            productId: input.productId,
            warehouseId: sourceLocation.warehouseId,
            type: InventoryTransactionType.TRANSFER,
            quantity: qtyDecimal,
            quantityDelta: new Prisma.Decimal(0),
            sourceLocationId: input.sourceLocationId,
            destinationLocationId: input.destinationLocationId,
            reason: "TRANSFER",
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            idempotencyKey: input.idempotencyKey?.trim() || null,
            requestHash,
            performedByUserId: userId,
          },
          include: {
            product: true,
            warehouse: true,
            sourceLocation: true,
            destinationLocation: true,
            performedByUser: true,
          },
        });

        logger.info(
          {
            organizationId,
            productId: input.productId,
            sourceLocationId: input.sourceLocationId,
            destinationLocationId: input.destinationLocationId,
            quantity: qtyDecimal.toFixed(4),
            transactionId: transaction.id,
          },
          "Stock transferred successfully",
        );

        return {
          transaction: toSafeTransaction(transaction),
          sourceBalance: toSafeBalance(updatedSourceBalance),
          destinationBalance: toSafeBalance(destinationBalance),
        };
      });
    });
  }

  /**
   * Retrieves a paginated history of inventory transactions with comprehensive filters.
   */
  public async listTransactions(
    organizationId: string,
    query: ListTransactionsQuery,
  ): Promise<PaginatedTransactionsResult> {
    const { page, limit, productId, warehouseId, locationId, type, startDate, endDate, search } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryTransactionWhereInput = {
      organizationId,
      ...(productId && { productId }),
      ...(warehouseId && { warehouseId }),
      ...(locationId && {
        OR: [{ sourceLocationId: locationId }, { destinationLocationId: locationId }],
      }),
      ...(type && { type }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
          { reason: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [totalItems, transactions] = await Promise.all([
      this.db.inventoryTransaction.count({ where }),
      this.db.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              unitOfMeasure: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          sourceLocation: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          destinationLocation: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          performedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: transactions.map((t) => toSafeTransaction(t)),
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
   * Executes an operation with bounded retry on transient concurrency conflicts or deadlocks.
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries || !this.isRetryableError(error)) {
          throw error;
        }

        logger.warn(
          { attempt, error: error instanceof Error ? error.message : String(error) },
          "Transient inventory concurrency conflict, retrying operation",
        );

        const delayMs = Math.pow(2, attempt) * 10 + Math.floor(Math.random() * 20);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Identifies transient, retryable transaction conflicts.
   */
  private isRetryableError(error: unknown): boolean {
    if (typeof error === "object" && error !== null) {
      const err = error as { code?: string };
      // P2034: Prisma write conflict/serialization failure
      // 40001: Postgres serialization failure
      // 40P01: Postgres deadlock detected
      if (err.code === "P2034" || err.code === "40001" || err.code === "40P01") {
        return true;
      }
    }
    return false;
  }
}

export const inventoryService = new InventoryService();
