import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  OrganizationRole,
  AnomalyCategory,
  AnomalySeverity,
  AnomalyStatus,
  DetectionRunStatus,
  InventoryTransactionType,
  Prisma,
} from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";

describe("Feature 11: AI Inventory Anomaly Detection (Integration)", () => {
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
  };

  const warehouse1 = {
    id: "550e8400-e29b-41d4-a716-446655440201",
    organizationId: orgId,
    name: "Main Distribution Center",
    code: "WH-MDC",
  };

  const location1 = {
    id: "550e8400-e29b-41d4-a716-446655440301",
    warehouseId: warehouse1.id,
    name: "Bin A-01",
    code: "A-01",
  };

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let externalToken: string;

  interface DetectionRunRecord {
    id: string;
    organizationId: string;
    status: DetectionRunStatus;
    windowDays: number;
    startedAt: Date | null;
    completedAt: Date | null;
    initiatedByUserId: string | null;
    findingsCount: number;
    summary: unknown;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  interface AnomalyRecord {
    id: string;
    organizationId: string;
    category: AnomalyCategory;
    severity: AnomalySeverity;
    status: AnomalyStatus;
    productId: string | null;
    warehouseId: string | null;
    locationId: string | null;
    transactionId: string | null;
    strategyName: string;
    strategyVersion: string;
    score: Prisma.Decimal | null;
    explanation: string;
    evidence: unknown;
    dedupKey: string;
    detectionWindowStart: Date;
    detectionWindowEnd: Date;
    detectedAt: Date;
    acknowledgedAt: Date | null;
    acknowledgedByUserId: string | null;
    resolvedAt: Date | null;
    resolvedByUserId: string | null;
    resolutionNote: string | null;
    dismissedAt: Date | null;
    dismissedByUserId: string | null;
    detectionRunId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  interface TransactionRecord {
    id: string;
    organizationId: string;
    productId: string;
    warehouseId: string | null;
    type: InventoryTransactionType;
    quantity: Prisma.Decimal;
    quantityDelta: Prisma.Decimal;
    sourceLocationId: string | null;
    destinationLocationId: string | null;
    reason: string | null;
    reference: string | null;
    notes: string | null;
    performedByUserId: string;
    createdAt: Date;
    product?: typeof product1;
    warehouse?: typeof warehouse1;
    sourceLocation?: typeof location1;
    destinationLocation?: typeof location1;
    performedByUser?: typeof adminUser;
  }

  let runsStore: DetectionRunRecord[] = [];
  let anomaliesStore: AnomalyRecord[] = [];
  let transactionsStore: TransactionRecord[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    runsStore = [];
    anomaliesStore = [];
    transactionsStore = [];

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
    }) as unknown as typeof prisma.user.findUnique);

    // Mock organization lookup
    vi.spyOn(prisma.organization, "findUnique").mockImplementation(((args: {
      where: { id?: string };
    }) => {
      if (args.where.id === orgId) return Promise.resolve(sampleOrg);
      return Promise.resolve(null);
    }) as unknown as typeof prisma.organization.findUnique);

    // Mock membership lookup (RBAC)
    vi.spyOn(prisma.organizationMembership, "findUnique").mockImplementation(((args: {
      where: { userId_organizationId: { userId: string; organizationId: string } };
    }) => {
      const { userId, organizationId } = args.where.userId_organizationId;
      if (organizationId !== orgId) return Promise.resolve(null);

      if (userId === ownerUser.id) {
        return Promise.resolve({
          id: "mem-owner",
          organizationId: orgId,
          userId: ownerUser.id,
          role: OrganizationRole.OWNER,
          organization: sampleOrg,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
        });
      }
      if (userId === adminUser.id) {
        return Promise.resolve({
          id: "mem-admin",
          organizationId: orgId,
          userId: adminUser.id,
          role: OrganizationRole.ADMIN,
          organization: sampleOrg,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
        });
      }
      if (userId === memberUser.id) {
        return Promise.resolve({
          id: "mem-member",
          organizationId: orgId,
          userId: memberUser.id,
          role: OrganizationRole.MEMBER,
          organization: sampleOrg,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
        });
      }
      return Promise.resolve(null);
    }) as unknown as typeof prisma.organizationMembership.findUnique);

    // Mock organizationMembership.findMany for notifyOrganizationAdmins
    vi.spyOn(prisma.organizationMembership, "findMany").mockResolvedValue([
      { userId: ownerUser.id } as unknown as { userId: string },
      { userId: adminUser.id } as unknown as { userId: string },
    ] as never);

    // Mock notification creation
    vi.spyOn(prisma.notification, "create").mockResolvedValue({
      id: "notif-1",
      organizationId: orgId,
      recipientUserId: ownerUser.id,
      type: "WARNING",
      title: "Alert",
      message: "Alert msg",
      data: null,
      readAt: null,
      createdAt: new Date(),
    } as never);

    // Mock product lookup
    vi.spyOn(prisma.product, "findFirst").mockImplementation(((args: {
      where: { id?: string };
    }) => {
      if (args.where.id === product1.id) return Promise.resolve(product1);
      return Promise.resolve(null);
    }) as unknown as typeof prisma.product.findFirst);

    // Mock warehouse lookup
    vi.spyOn(prisma.warehouse, "findFirst").mockImplementation(((args: {
      where: { id?: string };
    }) => {
      if (args.where.id === warehouse1.id) return Promise.resolve(warehouse1);
      return Promise.resolve(null);
    }) as unknown as typeof prisma.warehouse.findFirst);

    // Mock auditLog.create
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({
      id: "audit-1",
      organizationId: orgId,
      actorUserId: adminUser.id,
      action: "anomaly_detection.run_created",
      resourceType: "AnomalyDetectionRun",
      resourceId: "run-1",
      metadata: null,
      requestId: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      actorUser: { id: adminUser.id, name: adminUser.name, email: adminUser.email },
    } as never);

    // Mock inventoryTransaction.findMany
    vi.spyOn(prisma.inventoryTransaction, "findMany").mockImplementation((() => {
      return Promise.resolve(transactionsStore);
    }) as unknown as typeof prisma.inventoryTransaction.findMany);

    // Mock anomalyDetectionRun.create
    vi.spyOn(prisma.anomalyDetectionRun, "create").mockImplementation(((args: {
      data: { organizationId: string; windowDays: number; initiatedByUserId?: string | null };
    }) => {
      const record: DetectionRunRecord = {
        id: "550e8400-e29b-41d4-a716-446655440901",
        organizationId: args.data.organizationId,
        status: DetectionRunStatus.RUNNING,
        windowDays: args.data.windowDays,
        startedAt: new Date(),
        completedAt: null,
        initiatedByUserId: args.data.initiatedByUserId ?? null,
        findingsCount: 0,
        summary: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      runsStore.push(record);
      return Promise.resolve(record);
    }) as unknown as typeof prisma.anomalyDetectionRun.create);

    // Mock anomalyDetectionRun.update
    vi.spyOn(prisma.anomalyDetectionRun, "update").mockImplementation(((args: {
      where: { id: string };
      data: Partial<DetectionRunRecord>;
    }) => {
      const run = runsStore.find((r) => r.id === args.where.id);
      if (!run) throw new Error("Run not found");
      Object.assign(run, args.data, { updatedAt: new Date() });
      return Promise.resolve(run);
    }) as unknown as typeof prisma.anomalyDetectionRun.update);

    // Mock anomalyDetectionRun.findFirst
    vi.spyOn(prisma.anomalyDetectionRun, "findFirst").mockImplementation(((args: {
      where: { id: string; organizationId: string };
    }) => {
      const run = runsStore.find(
        (r) => r.id === args.where.id && r.organizationId === args.where.organizationId,
      );
      if (!run) return Promise.resolve(null);
      const findings = anomaliesStore.filter((a) => a.detectionRunId === run.id);
      return Promise.resolve({
        ...run,
        initiatedByUser: adminUser,
        findings: findings.map((f) => ({
          ...f,
          product: product1,
          warehouse: warehouse1,
          location: location1,
        })),
      });
    }) as unknown as typeof prisma.anomalyDetectionRun.findFirst);

    // Mock anomalyDetectionRun.findMany
    vi.spyOn(prisma.anomalyDetectionRun, "findMany").mockImplementation((() => {
      return Promise.resolve(runsStore.map((r) => ({ ...r, initiatedByUser: adminUser })));
    }) as unknown as typeof prisma.anomalyDetectionRun.findMany);

    // Mock anomalyDetectionRun.count
    vi.spyOn(prisma.anomalyDetectionRun, "count").mockImplementation((() => {
      return Promise.resolve(runsStore.length);
    }) as unknown as typeof prisma.anomalyDetectionRun.count);

    // Mock inventoryAnomaly.createMany
    vi.spyOn(prisma.inventoryAnomaly, "createMany").mockImplementation(((args: {
      data: Array<Omit<AnomalyRecord, "id" | "detectedAt" | "createdAt" | "updatedAt">>;
      skipDuplicates?: boolean;
    }) => {
      let inserted = 0;
      for (const item of args.data) {
        const exists = anomaliesStore.some(
          (a) => a.organizationId === item.organizationId && a.dedupKey === item.dedupKey,
        );
        if (!exists) {
          anomaliesStore.push({
            ...item,
            id: `anom-${Math.random().toString(36).substring(2, 9)}`,
            status: AnomalyStatus.OPEN,
            score: item.score ?? null,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionNote: null,
            dismissedAt: null,
            dismissedByUserId: null,
            detectedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          inserted++;
        }
      }
      return Promise.resolve({ count: inserted });
    }) as unknown as typeof prisma.inventoryAnomaly.createMany);

    // Mock inventoryAnomaly.findMany
    vi.spyOn(prisma.inventoryAnomaly, "findMany").mockImplementation((() => {
      return Promise.resolve(
        anomaliesStore.map((a) => ({
          ...a,
          product: product1,
          warehouse: warehouse1,
          location: location1,
          transaction: null,
          acknowledgedByUser: null,
          resolvedByUser: null,
          dismissedByUser: null,
        })),
      );
    }) as unknown as typeof prisma.inventoryAnomaly.findMany);

    // Mock inventoryAnomaly.count
    vi.spyOn(prisma.inventoryAnomaly, "count").mockImplementation((() => {
      return Promise.resolve(anomaliesStore.length);
    }) as unknown as typeof prisma.inventoryAnomaly.count);

    // Mock inventoryAnomaly.findFirst
    vi.spyOn(prisma.inventoryAnomaly, "findFirst").mockImplementation(((args: {
      where: { id: string; organizationId: string };
    }) => {
      const finding = anomaliesStore.find(
        (a) => a.id === args.where.id && a.organizationId === args.where.organizationId,
      );
      if (!finding) return Promise.resolve(null);
      return Promise.resolve({
        ...finding,
        product: product1,
        warehouse: warehouse1,
        location: location1,
        transaction: null,
        acknowledgedByUser: null,
        resolvedByUser: null,
        dismissedByUser: null,
      });
    }) as unknown as typeof prisma.inventoryAnomaly.findFirst);

    // Mock inventoryAnomaly.update
    vi.spyOn(prisma.inventoryAnomaly, "update").mockImplementation(((args: {
      where: { id: string };
      data: Partial<AnomalyRecord>;
    }) => {
      const finding = anomaliesStore.find((a) => a.id === args.where.id);
      if (!finding) throw new Error("Anomaly not found");
      Object.assign(finding, args.data, { updatedAt: new Date() });
      return Promise.resolve({
        ...finding,
        product: product1,
        warehouse: warehouse1,
        location: location1,
        transaction: null,
        acknowledgedByUser: finding.acknowledgedByUserId ? adminUser : null,
        resolvedByUser: finding.resolvedByUserId ? adminUser : null,
        dismissedByUser: finding.dismissedByUserId ? adminUser : null,
      });
    }) as unknown as typeof prisma.inventoryAnomaly.update);
  });

  describe("Authentication & RBAC Guards", () => {
    it("should return 401 when request lacks an Authorization header", async () => {
      const res = await request(app).get(`/api/v1/organizations/${orgId}/anomalies`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 404 Not Found for non-members (preventing tenant enumeration)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/anomalies`)
        .set("Authorization", `Bearer ${externalToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should return 403 when MEMBER tries to trigger a detection run (requires ANOMALIES_WRITE)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/anomalies/detection-runs`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ windowDays: 30 });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("should allow MEMBER to view anomalies and runs (ANOMALIES_READ)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/anomalies`)
        .set("Authorization", `Bearer ${memberToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Detection Runs API", () => {
    it("should initiate a detection run and return findings", async () => {
      // Seed a baseline and outlier transaction
      const baseDate = new Date();
      transactionsStore = [
        {
          id: "txn-1",
          organizationId: orgId,
          productId: product1.id,
          warehouseId: warehouse1.id,
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal(10),
          quantityDelta: new Prisma.Decimal(-10),
          sourceLocationId: location1.id,
          destinationLocationId: null,
          reason: null,
          reference: null,
          notes: null,
          performedByUserId: adminUser.id,
          createdAt: new Date(baseDate.getTime() - 20 * 86400000),
          product: product1,
        },
        {
          id: "txn-2",
          organizationId: orgId,
          productId: product1.id,
          warehouseId: warehouse1.id,
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal(11),
          quantityDelta: new Prisma.Decimal(-11),
          sourceLocationId: location1.id,
          destinationLocationId: null,
          reason: null,
          reference: null,
          notes: null,
          performedByUserId: adminUser.id,
          createdAt: new Date(baseDate.getTime() - 15 * 86400000),
          product: product1,
        },
        {
          id: "txn-3",
          organizationId: orgId,
          productId: product1.id,
          warehouseId: warehouse1.id,
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal(10),
          quantityDelta: new Prisma.Decimal(-10),
          sourceLocationId: location1.id,
          destinationLocationId: null,
          reason: null,
          reference: null,
          notes: null,
          performedByUserId: adminUser.id,
          createdAt: new Date(baseDate.getTime() - 10 * 86400000),
          product: product1,
        },
        {
          id: "txn-4",
          organizationId: orgId,
          productId: product1.id,
          warehouseId: warehouse1.id,
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal(9),
          quantityDelta: new Prisma.Decimal(-9),
          sourceLocationId: location1.id,
          destinationLocationId: null,
          reason: null,
          reference: null,
          notes: null,
          performedByUserId: adminUser.id,
          createdAt: new Date(baseDate.getTime() - 5 * 86400000),
          product: product1,
        },
        // Extreme outlier in active window:
        {
          id: "txn-outlier",
          organizationId: orgId,
          productId: product1.id,
          warehouseId: warehouse1.id,
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal(120),
          quantityDelta: new Prisma.Decimal(-120),
          sourceLocationId: location1.id,
          destinationLocationId: null,
          reason: null,
          reference: null,
          notes: null,
          performedByUserId: adminUser.id,
          createdAt: baseDate,
          product: product1,
        },
      ];

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/anomalies/detection-runs`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ windowDays: 30 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(DetectionRunStatus.COMPLETED);
      expect(res.body.data.findingsCount).toBe(1);
      expect(res.body.data.findings[0].category).toBe(AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT);
    });

    it("should reject invalid windowDays parameter with 422", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/anomalies/detection-runs`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ windowDays: 120 }); // Max allowed is 90

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should list detection runs with pagination", async () => {
      runsStore.push({
        id: "550e8400-e29b-41d4-a716-446655440901",
        organizationId: orgId,
        status: DetectionRunStatus.COMPLETED,
        windowDays: 30,
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: adminUser.id,
        findingsCount: 0,
        summary: {},
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/anomalies/detection-runs`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runs).toHaveLength(1);
      expect(res.body.data.pagination.total).toBe(1);
    });

    it("should retrieve a single detection run by ID", async () => {
      const runId = "550e8400-e29b-41d4-a716-446655440901";
      runsStore.push({
        id: runId,
        organizationId: orgId,
        status: DetectionRunStatus.COMPLETED,
        windowDays: 30,
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: adminUser.id,
        findingsCount: 0,
        summary: {},
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/anomalies/detection-runs/${runId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(runId);
    });
  });

  describe("Anomaly Findings & Review Lifecycle", () => {
    let seededAnomalyId: string;

    beforeEach(() => {
      seededAnomalyId = "550e8400-e29b-41d4-a716-446655440801";
      anomaliesStore.push({
        id: seededAnomalyId,
        organizationId: orgId,
        category: AnomalyCategory.UNUSUAL_ADJUSTMENT,
        severity: AnomalySeverity.HIGH,
        status: AnomalyStatus.OPEN,
        productId: product1.id,
        warehouseId: warehouse1.id,
        locationId: location1.id,
        transactionId: "txn-adj-1",
        strategyName: "UNUSUAL_ADJUSTMENT",
        strategyVersion: "1.0.0",
        score: new Prisma.Decimal(65),
        explanation: "Unusual stock shrinkage recorded.",
        evidence: { delta: -65 },
        dedupKey: "dedup-adj-1",
        detectionWindowStart: new Date(),
        detectionWindowEnd: new Date(),
        detectedAt: new Date(),
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        resolvedAt: null,
        resolvedByUserId: null,
        resolutionNote: null,
        dismissedAt: null,
        dismissedByUserId: null,
        detectionRunId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("should list anomaly findings with filters and pagination", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/anomalies`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.anomalies).toHaveLength(1);
      expect(res.body.data.anomalies[0].id).toBe(seededAnomalyId);
    });

    it("should get a single anomaly finding detail by ID", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/anomalies/${seededAnomalyId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(seededAnomalyId);
      expect(res.body.data.explanation).toContain("Unusual stock shrinkage");
    });

    it("should return 404 for a non-existent anomaly ID", async () => {
      const nonExistentId = "550e8400-e29b-41d4-a716-446655449999";
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/anomalies/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should transition status to ACKNOWLEDGED", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/anomalies/${seededAnomalyId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: AnomalyStatus.ACKNOWLEDGED });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AnomalyStatus.ACKNOWLEDGED);
      expect(res.body.data.acknowledgedAt).not.toBeNull();
    });

    it("should transition status to RESOLVED with resolution note", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/anomalies/${seededAnomalyId}/status`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          status: AnomalyStatus.RESOLVED,
          resolutionNote: "Physical cycle count completed and inventory adjusted.",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AnomalyStatus.RESOLVED);
      expect(res.body.data.resolutionNote).toBe(
        "Physical cycle count completed and inventory adjusted.",
      );
      expect(res.body.data.resolvedAt).not.toBeNull();
    });

    it("should transition status to DISMISSED with justification", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/anomalies/${seededAnomalyId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: AnomalyStatus.DISMISSED,
          resolutionNote: "False positive: scheduled batch repackaging.",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AnomalyStatus.DISMISSED);
      expect(res.body.data.dismissedAt).not.toBeNull();
    });

    it("should reject invalid status with 422", async () => {
      const res = await request(app)
        .patch(`/api/v1/organizations/${orgId}/anomalies/${seededAnomalyId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "INVALID_STATUS" });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });
});
