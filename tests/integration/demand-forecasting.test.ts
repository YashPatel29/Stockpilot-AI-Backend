import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { OrganizationRole, ForecastRunStatus, ProductStatus, Prisma } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";

describe("Feature 10: AI Demand Forecasting (Integration)", () => {
  const orgId = "550e8400-e29b-41d4-a716-446655440001";

  const ownerUser = {
    id: "550e8400-e29b-41d4-a716-446655440010",
    email: "owner@stockpilot.io",
    name: "Owner Alice",
    status: "ACTIVE",
  };

  const adminUser = {
    id: "550e8400-e29b-41d4-a716-446655440020",
    email: "admin@stockpilot.io",
    name: "Admin Bob",
    status: "ACTIVE",
  };

  const memberUser = {
    id: "550e8400-e29b-41d4-a716-446655440030",
    email: "member@stockpilot.io",
    name: "Member Charlie",
    status: "ACTIVE",
  };

  const externalUser = {
    id: "550e8400-e29b-41d4-a716-446655440040",
    email: "external@stockpilot.io",
    name: "External Eve",
    status: "ACTIVE",
  };

  const sampleOrg = {
    id: orgId,
    name: "Alpha Logistics Corp",
    slug: "alpha-logistics-corp",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const product1 = {
    id: "550e8400-e29b-41d4-a716-446655440101",
    organizationId: orgId,
    sku: "WGT-ALPHA",
    name: "Alpha Industrial Widget",
    unitOfMeasure: "PIECE",
    status: ProductStatus.ACTIVE,
  };

  const product2 = {
    id: "550e8400-e29b-41d4-a716-446655440102",
    organizationId: orgId,
    sku: "WGT-BETA",
    name: "Beta Bolt Pack",
    unitOfMeasure: "BOX",
    status: ProductStatus.ACTIVE,
  };

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let externalToken: string;

  interface ForecastRunRecord {
    id: string;
    organizationId: string;
    status: ForecastRunStatus;
    modelName: string;
    modelVersion: string;
    horizonDays: number;
    lookbackDays: number;
    granularity: string;
    startedAt: Date | null;
    completedAt: Date | null;
    initiatedByUserId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }

  interface ForecastPointRecord {
    id: string;
    forecastRunId: string;
    productId: string;
    periodStart: Date;
    periodEnd: Date;
    predictedDemand: Prisma.Decimal;
    lowerBound: Prisma.Decimal | null;
    upperBound: Prisma.Decimal | null;
    unitOfMeasure: string;
    createdAt: Date;
    product?: {
      name: string;
      sku: string;
    };
  }

  let runsStore: ForecastRunRecord[] = [];
  let pointsStore: ForecastPointRecord[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    runsStore = [];
    pointsStore = [];

    ownerToken = signAccessToken({
      sub: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
    });
    adminToken = signAccessToken({
      sub: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
    });
    memberToken = signAccessToken({
      sub: memberUser.id,
      email: memberUser.email,
      name: memberUser.name,
    });
    externalToken = signAccessToken({
      sub: externalUser.id,
      email: externalUser.email,
      name: externalUser.name,
    });

    // Mock authenticate middleware
    vi.spyOn(prisma.user, "findUnique").mockImplementation(((args: { where: { id?: string } }) => {
      const id = args.where.id;
      if (id === ownerUser.id) return Promise.resolve(ownerUser);
      if (id === adminUser.id) return Promise.resolve(adminUser);
      if (id === memberUser.id) return Promise.resolve(memberUser);
      if (id === externalUser.id) return Promise.resolve(externalUser);
      return Promise.resolve(null);
    }) as never);

    // Mock requireOrgMember middleware
    vi.spyOn(prisma.organizationMembership, "findUnique").mockImplementation(((args: {
      where: { userId_organizationId: { userId: string; organizationId: string } };
    }) => {
      const { userId, organizationId } = args.where.userId_organizationId;

      if (organizationId === orgId) {
        if (userId === ownerUser.id) {
          return Promise.resolve({
            id: "mem-owner-1",
            userId: ownerUser.id,
            organizationId: orgId,
            role: OrganizationRole.OWNER,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
        if (userId === adminUser.id) {
          return Promise.resolve({
            id: "mem-admin-1",
            userId: adminUser.id,
            organizationId: orgId,
            role: OrganizationRole.ADMIN,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
        if (userId === memberUser.id) {
          return Promise.resolve({
            id: "mem-member-1",
            userId: memberUser.id,
            organizationId: orgId,
            role: OrganizationRole.MEMBER,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
      }

      return Promise.resolve(null);
    }) as never);

    // Mock Organization findUnique
    vi.spyOn(prisma.organization, "findUnique").mockImplementation(((args: {
      where: { id: string };
    }) => {
      if (args.where.id === orgId) return Promise.resolve(sampleOrg);
      return Promise.resolve(null);
    }) as never);

    // Mock Product findMany
    vi.spyOn(prisma.product, "findMany").mockImplementation(((args: {
      where?: { id?: { in?: string[] }; organizationId?: string };
    }) => {
      const all = [product1, product2];
      if (args.where?.organizationId && args.where.organizationId !== orgId) {
        return Promise.resolve([]);
      }
      if (args.where?.id?.in) {
        return Promise.resolve(all.filter((p) => args.where?.id?.in?.includes(p.id)));
      }
      return Promise.resolve(all);
    }) as never);

    // Mock AuditLog create
    vi.spyOn(prisma.auditLog, "create").mockImplementation((() => {
      return Promise.resolve({
        id: "audit-1",
        organizationId: orgId,
        actorUserId: ownerUser.id,
        action: "demand_forecast.generated",
        resourceType: "DemandForecastRun",
        resourceId: "run-1",
        metadata: {},
        requestId: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
        actorUser: null,
      });
    }) as never);

    // Mock Transaction
    vi.spyOn(prisma, "$transaction").mockImplementation((async (
      cb: (tx: typeof prisma) => Promise<unknown>,
    ) => {
      return cb(prisma);
    }) as never);

    // Mock DemandForecastRun queries
    vi.spyOn(prisma.demandForecastRun, "create").mockImplementation(((args: {
      data: {
        organizationId: string;
        status: ForecastRunStatus;
        modelName: string;
        modelVersion: string;
        horizonDays: number;
        lookbackDays: number;
        granularity?: string;
        startedAt?: Date | null;
        completedAt?: Date | null;
        initiatedByUserId?: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
        metadata?: unknown;
      };
    }) => {
      const now = new Date();
      const record: ForecastRunRecord = {
        id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        organizationId: args.data.organizationId,
        status: args.data.status,
        modelName: args.data.modelName,
        modelVersion: args.data.modelVersion,
        horizonDays: args.data.horizonDays,
        lookbackDays: args.data.lookbackDays,
        granularity: args.data.granularity ?? "DAILY",
        startedAt: args.data.startedAt ?? now,
        completedAt: args.data.completedAt ?? now,
        initiatedByUserId: args.data.initiatedByUserId ?? null,
        errorCode: args.data.errorCode ?? null,
        errorMessage: args.data.errorMessage ?? null,
        metadata: args.data.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      };
      runsStore.push(record);
      return Promise.resolve(record);
    }) as never);

    vi.spyOn(prisma.demandForecastRun, "count").mockImplementation(((args?: {
      where?: { organizationId?: string; status?: ForecastRunStatus };
    }) => {
      let filtered = runsStore;
      if (args?.where?.organizationId) {
        filtered = filtered.filter((r) => r.organizationId === args.where?.organizationId);
      }
      if (args?.where?.status) {
        filtered = filtered.filter((r) => r.status === args.where?.status);
      }
      return Promise.resolve(filtered.length);
    }) as never);

    vi.spyOn(prisma.demandForecastRun, "findMany").mockImplementation(((args?: {
      where?: { organizationId?: string; status?: ForecastRunStatus };
    }) => {
      let filtered = runsStore;
      if (args?.where?.organizationId) {
        filtered = filtered.filter((r) => r.organizationId === args.where?.organizationId);
      }
      if (args?.where?.status) {
        filtered = filtered.filter((r) => r.status === args.where?.status);
      }
      return Promise.resolve(filtered);
    }) as never);

    vi.spyOn(prisma.demandForecastRun, "findFirst").mockImplementation(((args: {
      where: { id: string; organizationId: string };
      include?: { points?: { include?: { product?: boolean } } };
    }) => {
      const run = runsStore.find(
        (r) => r.id === args.where.id && r.organizationId === args.where.organizationId,
      );
      if (!run) return Promise.resolve(null);

      if (args.include?.points) {
        const runPoints = pointsStore
          .filter((p) => p.forecastRunId === run.id)
          .map((pt) => {
            const prod = [product1, product2].find((pr) => pr.id === pt.productId);
            return {
              ...pt,
              product: prod ? { name: prod.name, sku: prod.sku } : { name: "Unknown", sku: "UNK" },
            };
          });
        return Promise.resolve({
          ...run,
          points: runPoints,
        });
      }

      return Promise.resolve(run);
    }) as never);

    // Mock DemandForecastPoint queries
    vi.spyOn(prisma.demandForecastPoint, "createMany").mockImplementation(((args: {
      data: Array<{
        forecastRunId: string;
        productId: string;
        periodStart: Date;
        periodEnd: Date;
        predictedDemand: Prisma.Decimal;
        lowerBound: Prisma.Decimal | null;
        upperBound: Prisma.Decimal | null;
        unitOfMeasure: string;
      }>;
    }) => {
      const now = new Date();
      for (const item of args.data) {
        pointsStore.push({
          id: `pt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          forecastRunId: item.forecastRunId,
          productId: item.productId,
          periodStart: item.periodStart,
          periodEnd: item.periodEnd,
          predictedDemand: item.predictedDemand,
          lowerBound: item.lowerBound,
          upperBound: item.upperBound,
          unitOfMeasure: item.unitOfMeasure,
          createdAt: now,
        });
      }
      return Promise.resolve({ count: args.data.length });
    }) as never);

    vi.spyOn(prisma.demandForecastPoint, "findMany").mockImplementation(((args: {
      where: { forecastRunId: string };
      include?: { product?: boolean };
    }) => {
      const runPoints = pointsStore
        .filter((p) => p.forecastRunId === args.where.forecastRunId)
        .map((pt) => {
          const prod = [product1, product2].find((pr) => pr.id === pt.productId);
          return {
            ...pt,
            product: prod ? { name: prod.name, sku: prod.sku } : { name: "Unknown", sku: "UNK" },
          };
        });
      return Promise.resolve(runPoints);
    }) as never);
  });

  describe("Authentication & RBAC Authorization", () => {
    it("should return 401 Unauthorized when no auth token is provided", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .send({ horizonDays: 14, lookbackDays: 30 });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 404 Not Found for non-members (preventing tenant enumeration)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .set("Authorization", `Bearer ${externalToken}`)
        .send({ horizonDays: 14, lookbackDays: 30 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should return 403 Forbidden when MEMBER attempts to generate forecast (FORECASTS_WRITE required)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ horizonDays: 14, lookbackDays: 30 });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("should allow MEMBER to read forecast runs (FORECASTS_READ granted)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runs).toBeDefined();
    });
  });

  describe("POST /api/v1/organizations/:organizationId/forecasts/demand", () => {
    it("should reject invalid inputs with 422 Unprocessable Entity", async () => {
      // Horizon > 90
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ horizonDays: 100, lookbackDays: 30 });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should return 404 when requested product does not exist in org", async () => {
      const nonExistentProductId = "550e8400-e29b-41d4-a716-446655440999";

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ productId: nonExistentProductId, horizonDays: 14, lookbackDays: 30 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should return INSUFFICIENT_HISTORY status when no consumption ledger records exist", async () => {
      // Mock ledger having 0 transactions
      vi.spyOn(prisma.inventoryTransaction, "findMany").mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ productId: product1.id, horizonDays: 14, lookbackDays: 30 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(ForecastRunStatus.INSUFFICIENT_HISTORY);
      expect(res.body.data.points).toEqual([]);
      expect(res.body.data.errorCode).toBe("INSUFFICIENT_HISTORY");
    });

    it("should successfully generate forecast with predictions and backtesting when consumption exists", async () => {
      // Mock 14 days of historical transactions for product1
      const now = new Date();
      const mockTransactions = [];
      for (let i = 0; i < 14; i++) {
        const txDate = new Date(now);
        txDate.setUTCDate(now.getUTCDate() - 14 + i);
        mockTransactions.push({
          productId: product1.id,
          quantity: new Prisma.Decimal("10.0000"),
          createdAt: txDate,
        });
      }

      vi.spyOn(prisma.inventoryTransaction, "findMany").mockResolvedValue(
        mockTransactions as never,
      );

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/forecasts/demand`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ productId: product1.id, horizonDays: 7, lookbackDays: 14 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(ForecastRunStatus.COMPLETED);
      expect(res.body.data.modelName).toBe("WeightedMovingAverage-DoW");
      expect(res.body.data.points.length).toBe(7);
      expect(res.body.data.points[0].predictedDemand).toBeDefined();
      expect(res.body.data.evaluation).toBeDefined();
      expect(res.body.data.evaluation.aggregateMetrics).toBeDefined();
      expect(res.body.data.evaluation.aggregateMetrics.mae).toBeDefined();
      expect(res.body.data.evaluation.aggregateMetrics.rmse).toBeDefined();
      expect(res.body.data.evaluation.aggregateMetrics.wape).toBeDefined();
    });
  });

  describe("GET /api/v1/organizations/:organizationId/forecasts/demand", () => {
    it("should return paginated runs filtered by status", async () => {
      // Insert one completed and one insufficient
      runsStore.push({
        id: "run-comp",
        organizationId: orgId,
        status: ForecastRunStatus.COMPLETED,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 14,
        lookbackDays: 30,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: ownerUser.id,
        errorCode: null,
        errorMessage: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      runsStore.push({
        id: "run-insuf",
        organizationId: orgId,
        status: ForecastRunStatus.INSUFFICIENT_HISTORY,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 14,
        lookbackDays: 30,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: ownerUser.id,
        errorCode: "INSUFFICIENT_HISTORY",
        errorMessage: "No data",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/forecasts/demand?status=COMPLETED`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runs.length).toBe(1);
      expect(res.body.data.runs[0].status).toBe(ForecastRunStatus.COMPLETED);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/forecasts/demand/:forecastId", () => {
    it("should return 404 when run does not exist", async () => {
      const nonExistentRunId = "550e8400-e29b-41d4-a716-446655440999";
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/forecasts/demand/${nonExistentRunId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should return full run detail with points when found", async () => {
      const runId = "550e8400-e29b-41d4-a716-446655440888";
      runsStore.push({
        id: runId,
        organizationId: orgId,
        status: ForecastRunStatus.COMPLETED,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 7,
        lookbackDays: 14,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: ownerUser.id,
        errorCode: null,
        errorMessage: null,
        metadata: {
          forecastRunId: runId,
          modelName: "WeightedMovingAverage-DoW",
          modelVersion: "1.0.0",
          evaluationWindow: { startDate: "2026-10-01", endDate: "2026-10-07", periods: 7 },
          aggregateMetrics: { mae: 0.5, rmse: 0.8, wape: 0.05 },
          productEvaluations: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      pointsStore.push({
        id: "pt-888",
        forecastRunId: runId,
        productId: product1.id,
        periodStart: new Date("2026-10-15T00:00:00.000Z"),
        periodEnd: new Date("2026-10-15T23:59:59.999Z"),
        predictedDemand: new Prisma.Decimal("15.5000"),
        lowerBound: new Prisma.Decimal("12.0000"),
        upperBound: new Prisma.Decimal("19.0000"),
        unitOfMeasure: "PIECE",
        createdAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/forecasts/demand/${runId}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(runId);
      expect(res.body.data.points.length).toBe(1);
      expect(res.body.data.points[0].predictedDemand).toBe("15.5000");
      expect(res.body.data.points[0].productName).toBe(product1.name);
    });
  });

  describe("GET /api/v1/organizations/:organizationId/forecasts/demand/:forecastId/evaluation", () => {
    it("should return 400 Bad Request for runs with INSUFFICIENT_HISTORY status", async () => {
      const runId = "550e8400-e29b-41d4-a716-446655440777";
      runsStore.push({
        id: runId,
        organizationId: orgId,
        status: ForecastRunStatus.INSUFFICIENT_HISTORY,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 14,
        lookbackDays: 30,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: ownerUser.id,
        errorCode: "INSUFFICIENT_HISTORY",
        errorMessage: "No data",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/forecasts/demand/${runId}/evaluation`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("should return evaluation report metrics for completed runs", async () => {
      const runId = "550e8400-e29b-41d4-a716-446655440666";
      const evalData = {
        forecastRunId: runId,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        evaluationWindow: { startDate: "2026-10-01", endDate: "2026-10-07", periods: 7 },
        aggregateMetrics: { mae: 1.25, rmse: 1.85, wape: 0.12 },
        productEvaluations: [],
      };

      runsStore.push({
        id: runId,
        organizationId: orgId,
        status: ForecastRunStatus.COMPLETED,
        modelName: "WeightedMovingAverage-DoW",
        modelVersion: "1.0.0",
        horizonDays: 7,
        lookbackDays: 14,
        granularity: "DAILY",
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: ownerUser.id,
        errorCode: null,
        errorMessage: null,
        metadata: evalData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/forecasts/demand/${runId}/evaluation`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.aggregateMetrics.mae).toBe(1.25);
      expect(res.body.data.aggregateMetrics.wape).toBe(0.12);
    });
  });
});
