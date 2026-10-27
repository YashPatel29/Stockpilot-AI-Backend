import {
  type PrismaClient,
  type Prisma,
  type AnomalyDetectionRun,
  DetectionRunStatus,
} from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import type {
  RichInventoryTransaction,
  InventoryAnomalyWithRelations,
  AnomalyDetectionRunWithRelations,
} from "./anomaly.types";

/**
 * Data access layer for querying ledger records and persisting anomaly findings.
 */
export class AnomalyDataAccess {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Fetches rich inventory transactions for detection evaluation within a timeframe.
   */
  public async findTransactions(params: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
    warehouseId?: string;
    productId?: string;
  }): Promise<RichInventoryTransaction[]> {
    const { organizationId, startDate, endDate, warehouseId, productId } = params;

    const where: Prisma.InventoryTransactionWhereInput = {
      organizationId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (productId) {
      where.productId = productId;
    }

    if (warehouseId) {
      where.OR = [
        { warehouseId },
        { sourceLocation: { warehouseId } },
        { destinationLocation: { warehouseId } },
      ];
    }

    return this.db.inventoryTransaction.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        sourceLocation: { select: { id: true, name: true, code: true, warehouseId: true } },
        destinationLocation: { select: { id: true, name: true, code: true, warehouseId: true } },
        performedByUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Creates an execution tracking record for an anomaly detection run.
   */
  public async createDetectionRun(data: {
    organizationId: string;
    windowDays: number;
    initiatedByUserId?: string;
  }): Promise<AnomalyDetectionRun> {
    return this.db.anomalyDetectionRun.create({
      data: {
        organizationId: data.organizationId,
        windowDays: data.windowDays,
        initiatedByUserId: data.initiatedByUserId ?? null,
        status: DetectionRunStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Updates an anomaly detection run record.
   */
  public async updateDetectionRun(
    id: string,
    data: Prisma.AnomalyDetectionRunUpdateInput,
  ): Promise<AnomalyDetectionRun> {
    return this.db.anomalyDetectionRun.update({
      where: { id },
      data,
    });
  }

  /**
   * Persists anomaly findings with idempotency / deduplication.
   */
  public async saveAnomalies(
    anomalies: Prisma.InventoryAnomalyCreateManyInput[],
  ): Promise<{ count: number }> {
    if (anomalies.length === 0) {
      return { count: 0 };
    }

    return this.db.inventoryAnomaly.createMany({
      data: anomalies,
      skipDuplicates: true,
    });
  }

  /**
   * Queries paginated anomaly findings with filtering and relations.
   */
  public async findAnomalies(params: {
    organizationId: string;
    where: Prisma.InventoryAnomalyWhereInput;
    orderBy: Prisma.InventoryAnomalyOrderByWithRelationInput;
    skip: number;
    take: number;
  }): Promise<{ items: InventoryAnomalyWithRelations[]; total: number }> {
    const { organizationId, where, orderBy, skip, take } = params;
    const finalWhere: Prisma.InventoryAnomalyWhereInput = {
      ...where,
      organizationId,
    };

    const [items, total] = await Promise.all([
      this.db.inventoryAnomaly.findMany({
        where: finalWhere,
        orderBy,
        skip,
        take,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true, code: true } },
          transaction: {
            select: {
              id: true,
              type: true,
              quantity: true,
              quantityDelta: true,
              createdAt: true,
              performedByUserId: true,
            },
          },
          acknowledgedByUser: { select: { id: true, name: true, email: true } },
          resolvedByUser: { select: { id: true, name: true, email: true } },
          dismissedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      this.db.inventoryAnomaly.count({ where: finalWhere }),
    ]);

    return { items, total };
  }

  /**
   * Fetches a single anomaly finding by ID within an organization.
   */
  public async findAnomalyById(
    organizationId: string,
    anomalyId: string,
  ): Promise<InventoryAnomalyWithRelations | null> {
    return this.db.inventoryAnomaly.findFirst({
      where: { id: anomalyId, organizationId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        transaction: {
          select: {
            id: true,
            type: true,
            quantity: true,
            quantityDelta: true,
            createdAt: true,
            performedByUserId: true,
          },
        },
        acknowledgedByUser: { select: { id: true, name: true, email: true } },
        resolvedByUser: { select: { id: true, name: true, email: true } },
        dismissedByUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Updates an anomaly finding status and reviewer notes.
   */
  public async updateAnomaly(
    _organizationId: string,
    anomalyId: string,
    data: Prisma.InventoryAnomalyUpdateInput,
  ): Promise<InventoryAnomalyWithRelations> {
    return this.db.inventoryAnomaly.update({
      where: { id: anomalyId },
      data,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        transaction: {
          select: {
            id: true,
            type: true,
            quantity: true,
            quantityDelta: true,
            createdAt: true,
            performedByUserId: true,
          },
        },
        acknowledgedByUser: { select: { id: true, name: true, email: true } },
        resolvedByUser: { select: { id: true, name: true, email: true } },
        dismissedByUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Queries paginated anomaly detection runs.
   */
  public async findDetectionRuns(params: {
    organizationId: string;
    where: Prisma.AnomalyDetectionRunWhereInput;
    skip: number;
    take: number;
  }): Promise<{ items: AnomalyDetectionRunWithRelations[]; total: number }> {
    const { organizationId, where, skip, take } = params;
    const finalWhere: Prisma.AnomalyDetectionRunWhereInput = {
      ...where,
      organizationId,
    };

    const [items, total] = await Promise.all([
      this.db.anomalyDetectionRun.findMany({
        where: finalWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          initiatedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      this.db.anomalyDetectionRun.count({ where: finalWhere }),
    ]);

    return { items, total };
  }

  /**
   * Fetches a detection run by ID with findings.
   */
  public async findDetectionRunById(
    organizationId: string,
    runId: string,
  ): Promise<AnomalyDetectionRunWithRelations | null> {
    return this.db.anomalyDetectionRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        initiatedByUser: { select: { id: true, name: true, email: true } },
        findings: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            warehouse: { select: { id: true, name: true, code: true } },
            location: { select: { id: true, name: true, code: true } },
            transaction: {
              select: {
                id: true,
                type: true,
                quantity: true,
                quantityDelta: true,
                createdAt: true,
                performedByUserId: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }
}

export const anomalyDataAccess = new AnomalyDataAccess();
