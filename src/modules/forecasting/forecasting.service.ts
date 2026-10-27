import {
  Prisma,
  ForecastRunStatus,
  type PrismaClient,
  type DemandForecastRun,
  type DemandForecastPoint,
} from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { NotFoundError, BadRequestError } from "../../common/errors/http-errors";
import { logger } from "../../infrastructure/logging/logger";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditResourceType } from "../audit/audit.types";
import { ForecastingDataAccess, forecastingDataAccess } from "./forecasting.data-access";
import { WeightedMovingAverageModel } from "./engine/weighted-moving-average.model";
import { Backtester } from "./engine/backtester";
import type { IForecastingModel } from "./engine/forecasting-model.interface";
import type {
  CreateDemandForecastInput,
  DemandForecastRunDetailDto,
  PaginatedForecastRunsResult,
  ListDemandForecastRunsQuery,
  SafeDemandForecastRunDto,
  SafeDemandForecastPointDto,
  DemandForecastEvaluationDto,
} from "./forecasting.types";

/**
 * Maps a Prisma DemandForecastRun to a safe external DTO.
 */
export function toSafeForecastRun(run: DemandForecastRun): SafeDemandForecastRunDto {
  return {
    id: run.id,
    organizationId: run.organizationId,
    status: run.status,
    modelName: run.modelName,
    modelVersion: run.modelVersion,
    horizonDays: run.horizonDays,
    lookbackDays: run.lookbackDays,
    granularity: run.granularity,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    initiatedByUserId: run.initiatedByUserId ?? null,
    errorCode: run.errorCode ?? null,
    errorMessage: run.errorMessage ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

/**
 * Maps a Prisma DemandForecastPoint to a safe external DTO.
 */
export function toSafeForecastPoint(
  point: DemandForecastPoint & { product?: { name: string; sku: string } },
): SafeDemandForecastPointDto {
  return {
    id: point.id,
    forecastRunId: point.forecastRunId,
    productId: point.productId,
    productName: point.product?.name,
    productSku: point.product?.sku,
    periodStart: point.periodStart.toISOString(),
    periodEnd: point.periodEnd.toISOString(),
    predictedDemand: new Prisma.Decimal(point.predictedDemand).toFixed(4),
    lowerBound: point.lowerBound ? new Prisma.Decimal(point.lowerBound).toFixed(4) : null,
    upperBound: point.upperBound ? new Prisma.Decimal(point.upperBound).toFixed(4) : null,
    unitOfMeasure: point.unitOfMeasure,
    createdAt: point.createdAt.toISOString(),
  };
}

/**
 * Core business orchestration for deterministic demand forecasting, walk-forward
 * backtesting, and organization-scoped prediction persistence.
 */
export class ForecastingService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly dataAccess: ForecastingDataAccess = forecastingDataAccess,
    private readonly model: IForecastingModel = new WeightedMovingAverageModel(),
    private readonly backtester: Backtester = new Backtester(),
    audit?: AuditService,
  ) {
    this.audit = audit ?? new AuditService(this.db);
  }

  /**
   * Generates a demand forecast run for specified or all active products in an organization.
   * Labeled strictly as "observed consumption" from historical ledger issue records.
   */
  public async generateForecast(params: {
    organizationId: string;
    userId: string;
    input: CreateDemandForecastInput;
    asOfDate?: Date;
  }): Promise<DemandForecastRunDetailDto> {
    const { organizationId, userId, input, asOfDate } = params;
    const horizonDays = input.horizonDays ?? 14;
    const lookbackDays = input.lookbackDays ?? 30;
    const granularity = input.granularity ?? "DAILY";
    const startedAt = new Date();

    // 1. Verify organization exists and is active
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundError("Organization not found.");
    }
    if (org.status !== "ACTIVE") {
      throw new BadRequestError(
        "Cannot generate forecasts for an inactive or suspended organization.",
      );
    }

    // 2. Normalize and validate target products
    let targetProductIds = input.productIds;
    if (input.productId && (!targetProductIds || targetProductIds.length === 0)) {
      targetProductIds = [input.productId];
    }

    if (targetProductIds && targetProductIds.length > 0) {
      const existingProducts = await this.db.product.findMany({
        where: {
          id: { in: targetProductIds },
          organizationId,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      if (existingProducts.length !== targetProductIds.length) {
        throw new NotFoundError(
          "One or more specified products not found or inactive in this organization.",
        );
      }
    }

    // 3. Extract historical observed consumption
    const productSeries = await this.dataAccess.getHistoricalConsumption({
      organizationId,
      productIds: targetProductIds,
      lookbackDays,
      asOfDate,
    });

    if (productSeries.length === 0) {
      throw new BadRequestError("No active products found in organization to forecast.");
    }

    // 4. Check historical data sufficiency
    const totalObservations = productSeries.reduce((acc, curr) => {
      const nonZeroDays = curr.observations.filter((obs) => obs.quantity > 0).length;
      return acc + nonZeroDays;
    }, 0);

    // If completely zero consumption across entire history, mark as INSUFFICIENT_HISTORY
    if (totalObservations === 0) {
      const run = await this.db.demandForecastRun.create({
        data: {
          organizationId,
          status: ForecastRunStatus.INSUFFICIENT_HISTORY,
          modelName: this.model.name,
          modelVersion: this.model.version,
          horizonDays,
          lookbackDays,
          granularity,
          startedAt,
          completedAt: new Date(),
          initiatedByUserId: userId,
          errorCode: "INSUFFICIENT_HISTORY",
          errorMessage:
            "Insufficient historical consumption records found in lookback window to compute reliable forecasts.",
        },
      });

      await this.audit.recordAudit({
        organizationId,
        actorUserId: userId,
        action: AuditAction.DEMAND_FORECAST_GENERATED,
        resourceType: AuditResourceType.DEMAND_FORECAST_RUN,
        resourceId: run.id,
        metadata: {
          status: ForecastRunStatus.INSUFFICIENT_HISTORY,
          horizonDays,
          lookbackDays,
          productCount: productSeries.length,
          modelName: this.model.name,
        },
      });

      return {
        ...toSafeForecastRun(run),
        points: [],
        totalPoints: 0,
        productCount: productSeries.length,
        evaluation: null,
      };
    }

    // 5. Generate deterministic predictions per product
    const pointsToCreate: Array<{
      productId: string;
      productName: string;
      productSku: string;
      periodStart: Date;
      periodEnd: Date;
      predictedDemand: Prisma.Decimal;
      lowerBound: Prisma.Decimal | null;
      upperBound: Prisma.Decimal | null;
      unitOfMeasure: string;
    }> = [];

    for (const series of productSeries) {
      const modelOutput = this.model.predict({
        productId: series.productId,
        historicalData: series.observations,
        horizonDays,
        referenceDate: asOfDate,
      });

      for (const pt of modelOutput.points) {
        pointsToCreate.push({
          productId: series.productId,
          productName: series.productName,
          productSku: series.productSku,
          periodStart: pt.periodStart,
          periodEnd: pt.periodEnd,
          predictedDemand: new Prisma.Decimal(pt.predictedQuantity),
          lowerBound: pt.lowerBound !== undefined ? new Prisma.Decimal(pt.lowerBound) : null,
          upperBound: pt.upperBound !== undefined ? new Prisma.Decimal(pt.upperBound) : null,
          unitOfMeasure: series.unitOfMeasure,
        });
      }
    }

    // 6. Execute walk-forward backtesting evaluation
    const evaluationReport = this.backtester.generateEvaluationReport({
      forecastRunId: "", // Will be assigned to run.id
      model: this.model,
      horizonDays,
      productHistories: productSeries.map((s) => ({
        productId: s.productId,
        productName: s.productName,
        productSku: s.productSku,
        historicalData: s.observations,
      })),
    });

    const completedAt = new Date();

    // 7. Persist run and time-series points atomically
    const run = await this.db.$transaction(async (tx) => {
      const createdRun = await tx.demandForecastRun.create({
        data: {
          organizationId,
          status: ForecastRunStatus.COMPLETED,
          modelName: this.model.name,
          modelVersion: this.model.version,
          horizonDays,
          lookbackDays,
          granularity,
          startedAt,
          completedAt,
          initiatedByUserId: userId,
          metadata: evaluationReport as unknown as Prisma.InputJsonValue,
        },
      });

      evaluationReport.forecastRunId = createdRun.id;

      if (pointsToCreate.length > 0) {
        await tx.demandForecastPoint.createMany({
          data: pointsToCreate.map((p) => ({
            forecastRunId: createdRun.id,
            productId: p.productId,
            periodStart: p.periodStart,
            periodEnd: p.periodEnd,
            predictedDemand: p.predictedDemand,
            lowerBound: p.lowerBound,
            upperBound: p.upperBound,
            unitOfMeasure: p.unitOfMeasure,
          })),
        });
      }

      return createdRun;
    });

    // 8. Record immutable audit record
    await this.audit.recordAudit({
      organizationId,
      actorUserId: userId,
      action: AuditAction.DEMAND_FORECAST_GENERATED,
      resourceType: AuditResourceType.DEMAND_FORECAST_RUN,
      resourceId: run.id,
      metadata: {
        status: ForecastRunStatus.COMPLETED,
        horizonDays,
        lookbackDays,
        productCount: productSeries.length,
        pointsCount: pointsToCreate.length,
        modelName: this.model.name,
        wape: evaluationReport.aggregateMetrics.wape,
        mae: evaluationReport.aggregateMetrics.mae,
      },
    });

    logger.info(
      {
        forecastRunId: run.id,
        organizationId,
        productCount: productSeries.length,
        pointsCount: pointsToCreate.length,
        wape: evaluationReport.aggregateMetrics.wape,
      },
      "Demand forecast generated successfully",
    );

    // Fetch created points with product information
    const points = await this.db.demandForecastPoint.findMany({
      where: { forecastRunId: run.id },
      include: {
        product: {
          select: { name: true, sku: true },
        },
      },
      orderBy: [{ productId: "asc" }, { periodStart: "asc" }],
    });

    return {
      ...toSafeForecastRun(run),
      points: points.map(toSafeForecastPoint),
      totalPoints: points.length,
      productCount: productSeries.length,
      evaluation: evaluationReport,
    };
  }

  /**
   * Retrieves a paginated list of forecast runs with filters.
   */
  public async listForecastRuns(
    organizationId: string,
    query: ListDemandForecastRunsQuery,
  ): Promise<PaginatedForecastRunsResult> {
    const { page = 1, limit = 20, status, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DemandForecastRunWhereInput = {
      organizationId,
      ...(status && { status }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [total, runs] = await Promise.all([
      this.db.demandForecastRun.count({ where }),
      this.db.demandForecastRun.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      runs: runs.map(toSafeForecastRun),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves a single forecast run by ID, including its predicted time-series points.
   */
  public async getForecastRun(
    organizationId: string,
    forecastId: string,
  ): Promise<DemandForecastRunDetailDto> {
    const run = await this.db.demandForecastRun.findFirst({
      where: {
        id: forecastId,
        organizationId,
      },
      include: {
        points: {
          include: {
            product: {
              select: { name: true, sku: true },
            },
          },
          orderBy: [{ productId: "asc" }, { periodStart: "asc" }],
        },
      },
    });

    if (!run) {
      throw new NotFoundError("Demand forecast run not found.");
    }

    const uniqueProductIds = new Set(run.points.map((p) => p.productId));
    const evaluation = (run.metadata as unknown as DemandForecastEvaluationDto) ?? null;

    return {
      ...toSafeForecastRun(run),
      points: run.points.map(toSafeForecastPoint),
      totalPoints: run.points.length,
      productCount: uniqueProductIds.size,
      evaluation,
    };
  }

  /**
   * Retrieves backtesting evaluation metrics for a specific forecast run.
   */
  public async getForecastEvaluation(
    organizationId: string,
    forecastId: string,
  ): Promise<DemandForecastEvaluationDto> {
    const run = await this.db.demandForecastRun.findFirst({
      where: {
        id: forecastId,
        organizationId,
      },
    });

    if (!run) {
      throw new NotFoundError("Demand forecast run not found.");
    }

    if (run.status === ForecastRunStatus.INSUFFICIENT_HISTORY) {
      throw new BadRequestError(
        "Evaluation is not available for runs with status INSUFFICIENT_HISTORY.",
      );
    }

    if (run.status === ForecastRunStatus.FAILED) {
      throw new BadRequestError("Evaluation is not available for runs with status FAILED.");
    }

    if (!run.metadata) {
      return {
        forecastRunId: run.id,
        modelName: run.modelName,
        modelVersion: run.modelVersion,
        evaluationWindow: {
          startDate: "",
          endDate: "",
          periods: 0,
        },
        aggregateMetrics: { mae: 0, rmse: 0, wape: 0 },
        productEvaluations: [],
      };
    }

    return run.metadata as unknown as DemandForecastEvaluationDto;
  }
}

export const forecastingService = new ForecastingService();
