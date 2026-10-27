import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, ForecastRunStatus, type PrismaClient } from "@prisma/client";
import { ForecastingService } from "../../src/modules/forecasting/forecasting.service";
import { ForecastingDataAccess } from "../../src/modules/forecasting/forecasting.data-access";
import { WeightedMovingAverageModel } from "../../src/modules/forecasting/engine/weighted-moving-average.model";
import { Backtester } from "../../src/modules/forecasting/engine/backtester";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotFoundError, BadRequestError } from "../../src/common/errors/http-errors";

describe("ForecastingService (Unit)", () => {
  let mockDb: unknown;
  let mockDataAccess: unknown;
  let mockAudit: unknown;
  let service: ForecastingService;

  const orgId = "org-123";
  const userId = "user-123";
  const productId = "prod-123";

  beforeEach(() => {
    mockDb = {
      organization: {
        findUnique: vi.fn(),
      },
      product: {
        findMany: vi.fn(),
      },
      demandForecastRun: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      demandForecastPoint: {
        createMany: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockDb);
      }),
    };

    mockDataAccess = {
      getHistoricalConsumption: vi.fn(),
      generateDateRange: vi.fn(),
    };

    mockAudit = {
      recordAudit: vi.fn().mockResolvedValue(null),
    };

    service = new ForecastingService(
      mockDb as PrismaClient,
      mockDataAccess as unknown as ForecastingDataAccess,
      new WeightedMovingAverageModel(),
      new Backtester(),
      mockAudit as unknown as AuditService,
    );
  });

  describe("generateForecast", () => {
    it("should throw NotFoundError if organization does not exist", async () => {
      (
        mockDb as { organization: { findUnique: ReturnType<typeof vi.fn> } }
      ).organization.findUnique.mockResolvedValue(null);

      await expect(
        service.generateForecast({
          organizationId: orgId,
          userId,
          input: { horizonDays: 14, lookbackDays: 30 },
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if organization is not active", async () => {
      (
        mockDb as { organization: { findUnique: ReturnType<typeof vi.fn> } }
      ).organization.findUnique.mockResolvedValue({ id: orgId, status: "SUSPENDED" });

      await expect(
        service.generateForecast({
          organizationId: orgId,
          userId,
          input: { horizonDays: 14, lookbackDays: 30 },
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError if a specified product does not exist in org", async () => {
      (
        mockDb as { organization: { findUnique: ReturnType<typeof vi.fn> } }
      ).organization.findUnique.mockResolvedValue({ id: orgId, status: "ACTIVE" });
      (
        mockDb as { product: { findMany: ReturnType<typeof vi.fn> } }
      ).product.findMany.mockResolvedValue([]);

      await expect(
        service.generateForecast({
          organizationId: orgId,
          userId,
          input: { productId, horizonDays: 14, lookbackDays: 30 },
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should mark run as INSUFFICIENT_HISTORY if historical records have 0 consumption", async () => {
      (
        mockDb as { organization: { findUnique: ReturnType<typeof vi.fn> } }
      ).organization.findUnique.mockResolvedValue({ id: orgId, status: "ACTIVE" });
      (
        mockDb as { product: { findMany: ReturnType<typeof vi.fn> } }
      ).product.findMany.mockResolvedValue([{ id: productId }]);
      (
        mockDataAccess as { getHistoricalConsumption: ReturnType<typeof vi.fn> }
      ).getHistoricalConsumption.mockResolvedValue([
        {
          productId,
          productName: "Widget A",
          productSku: "WGT-001",
          unitOfMeasure: "PIECE",
          observations: [
            { date: "2026-10-01", quantity: 0, transactionCount: 0 },
            { date: "2026-10-02", quantity: 0, transactionCount: 0 },
          ],
        },
      ]);

      const mockRun = {
        id: "run-zero",
        organizationId: orgId,
        status: ForecastRunStatus.INSUFFICIENT_HISTORY,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 14,
        lookbackDays: 30,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: userId,
        errorCode: "INSUFFICIENT_HISTORY",
        errorMessage:
          "Insufficient historical consumption records found in lookback window to compute reliable forecasts.",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (
        mockDb as { demandForecastRun: { create: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.create.mockResolvedValue(mockRun);

      const result = await service.generateForecast({
        organizationId: orgId,
        userId,
        input: { productId, horizonDays: 14, lookbackDays: 30 },
      });

      expect(result.status).toBe(ForecastRunStatus.INSUFFICIENT_HISTORY);
      expect(result.points).toEqual([]);
      expect(result.errorCode).toBe("INSUFFICIENT_HISTORY");
    });

    it("should successfully generate, persist points, and compute evaluation for valid history", async () => {
      (
        mockDb as { organization: { findUnique: ReturnType<typeof vi.fn> } }
      ).organization.findUnique.mockResolvedValue({ id: orgId, status: "ACTIVE" });
      (
        mockDb as { product: { findMany: ReturnType<typeof vi.fn> } }
      ).product.findMany.mockResolvedValue([{ id: productId }]);

      // 14 days of history with 10 units/day
      const observations = [];
      const baseDate = new Date("2026-10-01T00:00:00.000Z");
      for (let i = 0; i < 14; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(baseDate.getUTCDate() + i);
        observations.push({
          date: d.toISOString().split("T")[0]!,
          quantity: 10,
          transactionCount: 2,
        });
      }

      (
        mockDataAccess as { getHistoricalConsumption: ReturnType<typeof vi.fn> }
      ).getHistoricalConsumption.mockResolvedValue([
        {
          productId,
          productName: "Widget A",
          productSku: "WGT-001",
          unitOfMeasure: "PIECE",
          observations,
        },
      ]);

      const mockRun = {
        id: "run-complete",
        organizationId: orgId,
        status: ForecastRunStatus.COMPLETED,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 7,
        lookbackDays: 14,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: userId,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (
        mockDb as { demandForecastRun: { create: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.create.mockResolvedValue(mockRun);
      (
        mockDb as { demandForecastPoint: { createMany: ReturnType<typeof vi.fn> } }
      ).demandForecastPoint.createMany.mockResolvedValue({ count: 7 });

      const mockSavedPoints = [
        {
          id: "pt-1",
          forecastRunId: "run-complete",
          productId,
          periodStart: new Date("2026-10-15T00:00:00.000Z"),
          periodEnd: new Date("2026-10-15T23:59:59.999Z"),
          predictedDemand: new Prisma.Decimal("10.0000"),
          lowerBound: new Prisma.Decimal("10.0000"),
          upperBound: new Prisma.Decimal("10.0000"),
          unitOfMeasure: "PIECE",
          createdAt: new Date(),
          product: { name: "Widget A", sku: "WGT-001" },
        },
      ];
      (
        mockDb as { demandForecastPoint: { findMany: ReturnType<typeof vi.fn> } }
      ).demandForecastPoint.findMany.mockResolvedValue(mockSavedPoints);

      const result = await service.generateForecast({
        organizationId: orgId,
        userId,
        input: { productId, horizonDays: 7, lookbackDays: 14 },
      });

      expect(result.status).toBe(ForecastRunStatus.COMPLETED);
      expect(result.points.length).toBe(1);
      expect(result.points[0]?.predictedDemand).toBe("10.0000");
      expect(result.evaluation).toBeDefined();
      expect(
        (mockAudit as { recordAudit: ReturnType<typeof vi.fn> }).recordAudit,
      ).toHaveBeenCalled();
    });
  });

  describe("listForecastRuns", () => {
    it("should return paginated runs with total counts", async () => {
      (
        mockDb as { demandForecastRun: { count: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.count.mockResolvedValue(1);
      (
        mockDb as { demandForecastRun: { findMany: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.findMany.mockResolvedValue([
        {
          id: "run-1",
          organizationId: orgId,
          status: ForecastRunStatus.COMPLETED,
          modelName: "WeightedMovingAverage-DoW",
          modelVersion: "1.0.0",
          horizonDays: 14,
          lookbackDays: 30,
          granularity: "DAILY",
          startedAt: new Date(),
          completedAt: new Date(),
          initiatedByUserId: userId,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.listForecastRuns(orgId, { page: 1, limit: 10 });

      expect(result.pagination.total).toBe(1);
      expect(result.runs.length).toBe(1);
      expect(result.runs[0]?.id).toBe("run-1");
    });
  });

  describe("getForecastRun", () => {
    it("should return run detail with points when found", async () => {
      (
        mockDb as { demandForecastRun: { findFirst: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.findFirst.mockResolvedValue({
        id: "run-1",
        organizationId: orgId,
        status: ForecastRunStatus.COMPLETED,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 7,
        lookbackDays: 14,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: userId,
        errorCode: null,
        errorMessage: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        points: [
          {
            id: "pt-1",
            forecastRunId: "run-1",
            productId,
            periodStart: new Date(),
            periodEnd: new Date(),
            predictedDemand: new Prisma.Decimal("12.5000"),
            lowerBound: new Prisma.Decimal("10.0000"),
            upperBound: new Prisma.Decimal("15.0000"),
            unitOfMeasure: "PIECE",
            createdAt: new Date(),
            product: { name: "Widget A", sku: "WGT-001" },
          },
        ],
      });

      const result = await service.getForecastRun(orgId, "run-1");

      expect(result.id).toBe("run-1");
      expect(result.points.length).toBe(1);
      expect(result.points[0]?.predictedDemand).toBe("12.5000");
    });

    it("should throw NotFoundError when run does not exist", async () => {
      (
        mockDb as { demandForecastRun: { findFirst: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.findFirst.mockResolvedValue(null);

      await expect(service.getForecastRun(orgId, "non-existent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("getForecastEvaluation", () => {
    it("should throw BadRequestError if run was marked INSUFFICIENT_HISTORY", async () => {
      (
        mockDb as { demandForecastRun: { findFirst: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.findFirst.mockResolvedValue({
        id: "run-zero",
        organizationId: orgId,
        status: ForecastRunStatus.INSUFFICIENT_HISTORY,
      });

      await expect(service.getForecastEvaluation(orgId, "run-zero")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("should return evaluation payload when valid run found", async () => {
      const evaluationPayload = {
        forecastRunId: "run-valid",
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        evaluationWindow: { startDate: "2026-10-01", endDate: "2026-10-07", periods: 7 },
        aggregateMetrics: { mae: 1.2, rmse: 1.5, wape: 0.1 },
        productEvaluations: [],
      };

      (
        mockDb as { demandForecastRun: { findFirst: ReturnType<typeof vi.fn> } }
      ).demandForecastRun.findFirst.mockResolvedValue({
        id: "run-valid",
        organizationId: orgId,
        status: ForecastRunStatus.COMPLETED,
        metadata: evaluationPayload,
      });

      const result = await service.getForecastEvaluation(orgId, "run-valid");
      expect(result.aggregateMetrics.wape).toBe(0.1);
    });
  });
});
