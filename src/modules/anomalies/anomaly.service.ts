import {
  Prisma,
  type PrismaClient,
  AnomalyStatus,
  DetectionRunStatus,
  AnomalySeverity,
  NotificationType,
} from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { NotFoundError } from "../../common/errors/http-errors";
import { logger } from "../../infrastructure/logging/logger";
import { AuditService } from "../audit/audit.service";
import { type AuditActionType, AuditAction, AuditResourceType } from "../audit/audit.types";
import { NotificationService } from "../notifications/notification.service";
import { AnomalyDataAccess, anomalyDataAccess } from "./anomaly.data-access";
import {
  type IDetectionStrategy,
  type DetectionStrategyContext,
} from "./strategies/detection-strategy.interface";
import { UnusuallyLargeMovementStrategy } from "./strategies/unusually-large-movement.strategy";
import { UnusualAdjustmentStrategy } from "./strategies/unusual-adjustment.strategy";
import { RepeatedAdjustmentsStrategy } from "./strategies/repeated-adjustments.strategy";
import { UnusualTransferPatternStrategy } from "./strategies/unusual-transfer-pattern.strategy";
import {
  type SafeInventoryAnomalyDto,
  type AnomalyDetectionRunDetailDto,
  type PaginatedAnomaliesResult,
  type PaginatedDetectionRunsResult,
  type RawAnomalyCandidate,
  toSafeInventoryAnomaly,
  toSafeAnomalyDetectionRun,
} from "./anomaly.types";
import type {
  TriggerAnomalyDetectionSchema,
  ListAnomaliesQuery,
  ListDetectionRunsQuery,
  UpdateAnomalyStatusSchema,
} from "./anomaly.schema";

const SEVERITY_WEIGHT: Record<AnomalySeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Service orchestrating inventory anomaly detection runs, lifecycle management,
 * and review workflows.
 */
export class AnomalyService {
  private readonly audit: AuditService;
  private readonly notifications: NotificationService;
  private readonly strategies: IDetectionStrategy[];

  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly dataAccess: AnomalyDataAccess = anomalyDataAccess,
    strategies?: IDetectionStrategy[],
    audit?: AuditService,
    notifications?: NotificationService,
  ) {
    this.strategies = strategies ?? [
      new UnusuallyLargeMovementStrategy(),
      new UnusualAdjustmentStrategy(),
      new RepeatedAdjustmentsStrategy(),
      new UnusualTransferPatternStrategy(),
    ];
    this.audit = audit ?? new AuditService(this.db);
    this.notifications = notifications ?? new NotificationService(this.db);
  }

  /**
   * Executes a bounded, deterministic inventory anomaly detection run.
   */
  public async triggerDetectionRun(params: {
    organizationId: string;
    userId: string;
    input: TriggerAnomalyDetectionSchema;
    asOfDate?: Date;
  }): Promise<AnomalyDetectionRunDetailDto> {
    const { organizationId, userId, input, asOfDate } = params;
    const windowDays = input.windowDays ?? 30;

    // 1. Verify organization exists and is active
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundError("Organization not found.");
    }

    // 2. Validate optional product or warehouse if specified
    if (input.productId) {
      const product = await this.db.product.findFirst({
        where: { id: input.productId, organizationId },
      });
      if (!product) {
        throw new NotFoundError("Specified product not found in this organization.");
      }
    }

    if (input.warehouseId) {
      const warehouse = await this.db.warehouse.findFirst({
        where: { id: input.warehouseId, organizationId },
      });
      if (!warehouse) {
        throw new NotFoundError("Specified warehouse not found in this organization.");
      }
    }

    // 3. Create initial detection run record
    const run = await this.dataAccess.createDetectionRun({
      organizationId,
      windowDays,
      initiatedByUserId: userId,
    });

    try {
      const windowEnd = asOfDate ?? new Date();
      const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const baselineLookbackDays = Math.max(90, windowDays * 3);
      const baselineStart = new Date(
        windowEnd.getTime() - baselineLookbackDays * 24 * 60 * 60 * 1000,
      );

      // 4. Retrieve ledger records
      const [transactionsInWindow, historicalTransactions] = await Promise.all([
        this.dataAccess.findTransactions({
          organizationId,
          startDate: windowStart,
          endDate: windowEnd,
          warehouseId: input.warehouseId,
          productId: input.productId,
        }),
        this.dataAccess.findTransactions({
          organizationId,
          startDate: baselineStart,
          endDate: windowEnd,
          warehouseId: input.warehouseId,
          productId: input.productId,
        }),
      ]);

      // 5. Select active strategies
      const activeStrategies = input.categories
        ? this.strategies.filter((s) => input.categories?.includes(s.category))
        : this.strategies;

      const context: DetectionStrategyContext = {
        organizationId,
        windowDays,
        windowStart,
        windowEnd,
        transactionsInWindow,
        historicalTransactions,
        filterWarehouseId: input.warehouseId,
        filterProductId: input.productId,
      };

      // 6. Execute strategies
      const strategyResults = await Promise.all(
        activeStrategies.map(async (strategy) => {
          try {
            return await strategy.detect(context);
          } catch (err) {
            logger.error(
              { err, strategy: strategy.name, organizationId },
              "Anomaly detection strategy execution failed",
            );
            return [] as RawAnomalyCandidate[];
          }
        }),
      );

      let allCandidates = strategyResults.flat();

      // Filter by minSeverity if requested
      if (input.minSeverity) {
        const minWeight = SEVERITY_WEIGHT[input.minSeverity];
        allCandidates = allCandidates.filter((c) => SEVERITY_WEIGHT[c.severity] >= minWeight);
      }

      // 7. Map candidates to Prisma create inputs
      const anomalyRecords: Prisma.InventoryAnomalyCreateManyInput[] = allCandidates.map((c) => ({
        organizationId,
        category: c.category,
        severity: c.severity,
        status: AnomalyStatus.OPEN,
        productId: c.productId ?? null,
        warehouseId: c.warehouseId ?? null,
        locationId: c.locationId ?? null,
        transactionId: c.transactionId ?? null,
        strategyName: c.strategyName,
        strategyVersion: c.strategyVersion,
        score: new Prisma.Decimal(c.score),
        explanation: c.explanation,
        evidence: c.evidence as unknown as Prisma.InputJsonValue,
        dedupKey: c.dedupKey,
        detectionWindowStart: windowStart,
        detectionWindowEnd: windowEnd,
        detectionRunId: run.id,
      }));

      // 8. Persist findings with deduplication
      const { count: savedCount } = await this.dataAccess.saveAnomalies(anomalyRecords);

      // 9. Update detection run to COMPLETED
      const summaryData = {
        evaluatedWindowTransactions: transactionsInWindow.length,
        historicalBaselineTransactions: historicalTransactions.length,
        totalCandidatesEmitted: allCandidates.length,
        newFindingsPersisted: savedCount,
        executedStrategies: activeStrategies.map((s) => s.name),
      };

      await this.dataAccess.updateDetectionRun(run.id, {
        status: DetectionRunStatus.COMPLETED,
        findingsCount: savedCount,
        completedAt: new Date(),
        summary: summaryData as unknown as Prisma.InputJsonValue,
      });

      // 10. Audit log tracking
      await this.audit.recordAudit({
        organizationId,
        actorUserId: userId,
        action: AuditAction.ANOMALY_DETECTION_RUN_CREATED,
        resourceType: AuditResourceType.ANOMALY_DETECTION_RUN,
        resourceId: run.id,
        metadata: {
          windowDays,
          findingsCount: savedCount,
          totalCandidates: allCandidates.length,
        },
      });

      // 11. Dispatch notifications for HIGH or CRITICAL findings
      const highSeverityFindings = allCandidates.filter(
        (c) => c.severity === AnomalySeverity.HIGH || c.severity === AnomalySeverity.CRITICAL,
      );
      if (highSeverityFindings.length > 0) {
        await this.notifications.notifyOrganizationAdmins(organizationId, {
          type: NotificationType.WARNING,
          title: "High-Severity Inventory Anomalies Detected",
          message:
            `Anomaly detection run detected ${highSeverityFindings.length} high/critical operational findings ` +
            `requiring administrative review.`,
          data: {
            runId: run.id,
            highSeverityCount: highSeverityFindings.length,
          },
        });
      }

      // 12. Fetch final run detail with relations
      const finalRun = await this.dataAccess.findDetectionRunById(organizationId, run.id);
      if (!finalRun) {
        throw new NotFoundError("Detection run not found after completion.");
      }

      const safeRun = toSafeAnomalyDetectionRun(finalRun);
      const safeFindings = (finalRun.findings ?? []).map(toSafeInventoryAnomaly);

      return {
        ...safeRun,
        findings: safeFindings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown detection error";
      await this.dataAccess.updateDetectionRun(run.id, {
        status: DetectionRunStatus.FAILED,
        completedAt: new Date(),
        errorCode: "DETECTION_RUN_FAILED",
        errorMessage,
      });
      throw error;
    }
  }

  /**
   * Retrieves a paginated list of inventory anomalies for an organization.
   */
  public async listAnomalies(
    organizationId: string,
    query: ListAnomaliesQuery,
  ): Promise<PaginatedAnomaliesResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryAnomalyWhereInput = { organizationId };

    if (query.category) {
      where.category = query.category;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.detectionRunId) {
      where.detectionRunId = query.detectionRunId;
    }
    if (query.startDate || query.endDate) {
      where.detectedAt = {};
      if (query.startDate) {
        where.detectedAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.detectedAt.lte = new Date(query.endDate);
      }
    }

    const sortField = query.sortBy ?? "createdAt";
    const sortDirection = query.sortOrder ?? "desc";
    const orderBy: Prisma.InventoryAnomalyOrderByWithRelationInput = {
      [sortField]: sortDirection,
    };

    const { items, total } = await this.dataAccess.findAnomalies({
      organizationId,
      where,
      orderBy,
      skip,
      take: limit,
    });

    return {
      anomalies: items.map(toSafeInventoryAnomaly),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves a single anomaly finding by ID.
   */
  public async getAnomalyById(
    organizationId: string,
    anomalyId: string,
  ): Promise<SafeInventoryAnomalyDto> {
    const anomaly = await this.dataAccess.findAnomalyById(organizationId, anomalyId);
    if (!anomaly) {
      throw new NotFoundError("Anomaly finding not found.");
    }
    return toSafeInventoryAnomaly(anomaly);
  }

  /**
   * Updates an anomaly finding status (ACKNOWLEDGED, RESOLVED, DISMISSED)
   * with resolution notes and reviewer tracking.
   */
  public async updateAnomalyStatus(params: {
    organizationId: string;
    anomalyId: string;
    userId: string;
    input: UpdateAnomalyStatusSchema;
  }): Promise<SafeInventoryAnomalyDto> {
    const { organizationId, anomalyId, userId, input } = params;

    const existing = await this.dataAccess.findAnomalyById(organizationId, anomalyId);
    if (!existing) {
      throw new NotFoundError("Anomaly finding not found.");
    }

    const currentStatus = existing.status;
    const targetStatus = input.status;

    // Validate lifecycle transitions:
    // OPEN -> ACKNOWLEDGED, RESOLVED, DISMISSED
    // ACKNOWLEDGED -> RESOLVED, DISMISSED
    // RESOLVED / DISMISSED -> terminal
    if (currentStatus === targetStatus) {
      return toSafeInventoryAnomaly(existing);
    }

    const now = new Date();
    const updateData: Prisma.InventoryAnomalyUpdateInput = {
      status: targetStatus,
    };

    let auditAction: AuditActionType = AuditAction.ANOMALY_ACKNOWLEDGED;

    if (targetStatus === AnomalyStatus.ACKNOWLEDGED) {
      updateData.acknowledgedAt = now;
      updateData.acknowledgedByUser = { connect: { id: userId } };
      auditAction = AuditAction.ANOMALY_ACKNOWLEDGED;
    } else if (targetStatus === AnomalyStatus.RESOLVED) {
      updateData.resolvedAt = now;
      updateData.resolvedByUser = { connect: { id: userId } };
      updateData.resolutionNote = input.resolutionNote?.trim() ?? null;
      auditAction = AuditAction.ANOMALY_RESOLVED;
    } else if (targetStatus === AnomalyStatus.DISMISSED) {
      updateData.dismissedAt = now;
      updateData.dismissedByUser = { connect: { id: userId } };
      updateData.resolutionNote = input.resolutionNote?.trim() ?? null;
      auditAction = AuditAction.ANOMALY_DISMISSED;
    }

    const updated = await this.dataAccess.updateAnomaly(organizationId, anomalyId, updateData);

    // Record audit event
    await this.audit.recordAudit({
      organizationId,
      actorUserId: userId,
      action: auditAction,
      resourceType: AuditResourceType.INVENTORY_ANOMALY,
      resourceId: anomalyId,
      metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        resolutionNote: input.resolutionNote?.trim() ?? null,
      },
    });

    return toSafeInventoryAnomaly(updated);
  }

  /**
   * Retrieves a paginated list of detection runs for an organization.
   */
  public async listDetectionRuns(
    organizationId: string,
    query: ListDetectionRunsQuery,
  ): Promise<PaginatedDetectionRunsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AnomalyDetectionRunWhereInput = { organizationId };
    if (query.status) {
      where.status = query.status;
    }

    const { items, total } = await this.dataAccess.findDetectionRuns({
      organizationId,
      where,
      skip,
      take: limit,
    });

    return {
      runs: items.map(toSafeAnomalyDetectionRun),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves a single detection run by ID.
   */
  public async getDetectionRunById(
    organizationId: string,
    runId: string,
  ): Promise<AnomalyDetectionRunDetailDto> {
    const run = await this.dataAccess.findDetectionRunById(organizationId, runId);
    if (!run) {
      throw new NotFoundError("Anomaly detection run not found.");
    }

    const safeRun = toSafeAnomalyDetectionRun(run);
    const safeFindings = (run.findings ?? []).map(toSafeInventoryAnomaly);

    return {
      ...safeRun,
      findings: safeFindings,
    };
  }
}

export const anomalyService = new AnomalyService();
