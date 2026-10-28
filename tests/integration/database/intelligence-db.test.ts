import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { Prisma, AnomalyStatus } from "@prisma/client";
import { app } from "../../../src/app";
import {
  assertTestDatabaseConnection,
  getTestPrisma,
  cleanTestTenant,
} from "../../helpers/test-db-guard";
import {
  createTestUser,
  createTestOrganization,
  createTestProduct,
  createTestWarehouse,
  createTestLocation,
  seedTestStock,
} from "../../helpers/test-factories";
import { InventoryTransactionType } from "../../../src/modules/inventory/inventory.types";
import { aiProvider, MockChatModel } from "../../../src/infrastructure/ai/ai.factory";

describe("Intelligence, Forecasting & Copilot against PostgreSQL (Integration DB)", () => {
  const prisma = getTestPrisma();
  const cleanupOrgIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    const dbName = await assertTestDatabaseConnection(prisma);
    expect(dbName).toContain("test");
  });

  afterAll(async () => {
    for (const orgId of cleanupOrgIds) {
      await cleanTestTenant(prisma, orgId);
    }
    if (cleanupUserIds.length > 0) {
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: cleanupUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }
  });

  it("should execute anomaly detection run, detect unusual movement, and process review workflow in PostgreSQL", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id);
    const warehouse = await createTestWarehouse(prisma, org.id);
    const location = await createTestLocation(prisma, org.id, warehouse.id);

    // Seed historical baseline: 10 ISSUE transactions averaging ~5 units over past 20 days
    const now = new Date();
    const quantities = [
      "4.0000",
      "5.0000",
      "6.0000",
      "5.0000",
      "4.0000",
      "6.0000",
      "5.0000",
      "5.0000",
    ];
    for (let i = 0; i < quantities.length; i++) {
      const pastDate = new Date(now.getTime() - (i + 2) * 24 * 60 * 60 * 1000);
      const qtyStr = quantities[i]!;
      await prisma.inventoryTransaction.create({
        data: {
          organizationId: org.id,
          warehouseId: warehouse.id,
          sourceLocationId: location.id,
          productId: product.id,
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal(qtyStr),
          quantityDelta: new Prisma.Decimal(qtyStr).negated(),
          performedByUserId: user.id,
          createdAt: pastDate,
        },
      });
    }

    // Insert an unusually large anomaly movement (500 units)
    await prisma.inventoryTransaction.create({
      data: {
        organizationId: org.id,
        warehouseId: warehouse.id,
        sourceLocationId: location.id,
        productId: product.id,
        type: InventoryTransactionType.ISSUE,
        quantity: new Prisma.Decimal("500.0000"),
        quantityDelta: new Prisma.Decimal("-500.0000"),
        performedByUserId: user.id,
        reason: "Suspect sudden bulk removal",
        createdAt: new Date(now.getTime() - 10000),
      },
    });

    // 1. Trigger anomaly detection run
    const detectRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/anomalies/detection-runs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ windowDays: 30 });

    expect(detectRes.status).toBe(201);
    expect(detectRes.body.success).toBe(true);

    const runId = detectRes.body.data.id;

    // Verify detection run was persisted in PostgreSQL
    const dbRun = await prisma.anomalyDetectionRun.findUnique({
      where: { id: runId },
      include: { findings: true },
    });
    expect(dbRun).toBeDefined();
    expect(dbRun?.findings.length).toBeGreaterThanOrEqual(1);

    const anomaly = dbRun!.findings[0];
    expect(anomaly?.status).toBe(AnomalyStatus.OPEN);

    // 2. Acknowledge anomaly via API
    const ackRes = await request(app)
      .patch(`/api/v1/organizations/${org.id}/anomalies/${anomaly?.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "ACKNOWLEDGED" });

    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.status).toBe(AnomalyStatus.ACKNOWLEDGED);

    // 3. Resolve anomaly with resolution note
    const resolveRes = await request(app)
      .patch(`/api/v1/organizations/${org.id}/anomalies/${anomaly?.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        status: "RESOLVED",
        resolutionNote: "Verified legitimate seasonal bulk sale to key partner.",
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe(AnomalyStatus.RESOLVED);
    expect(resolveRes.body.data.resolutionNote).toBe(
      "Verified legitimate seasonal bulk sale to key partner.",
    );

    // Verify directly in PostgreSQL
    const dbResolved = await prisma.inventoryAnomaly.findUnique({
      where: { id: anomaly?.id },
    });
    expect(dbResolved?.status).toBe(AnomalyStatus.RESOLVED);
    expect(dbResolved?.resolvedByUserId).toBe(user.id);
    expect(dbResolved?.resolvedAt).not.toBeNull();
  });

  it("should trigger demand forecast run, generate points from consumption, and persist in PostgreSQL", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id);
    const warehouse = await createTestWarehouse(prisma, org.id);
    const location = await createTestLocation(prisma, org.id, warehouse.id);

    // Seed 14 days of historical issues (consumption)
    const now = new Date();
    for (let day = 14; day >= 1; day--) {
      const issueDate = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
      await prisma.inventoryTransaction.create({
        data: {
          organizationId: org.id,
          warehouseId: warehouse.id,
          sourceLocationId: location.id,
          productId: product.id,
          type: InventoryTransactionType.ISSUE,
          quantity: new Prisma.Decimal("12.0000"),
          quantityDelta: new Prisma.Decimal("-12.0000"),
          performedByUserId: user.id,
          createdAt: issueDate,
        },
      });
    }

    // Trigger forecast generation via API
    const forecastRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/forecasts/demand`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        horizonDays: 7,
        lookbackDays: 14,
        granularity: "DAILY",
        productIds: [product.id],
      });

    expect(forecastRes.status).toBe(201);
    expect(forecastRes.body.success).toBe(true);

    const forecastId = forecastRes.body.data.id;

    // Verify points generated in PostgreSQL
    const dbPoints = await prisma.demandForecastPoint.findMany({
      where: { forecastRunId: forecastId },
      orderBy: { periodStart: "asc" },
    });

    expect(dbPoints.length).toBeGreaterThanOrEqual(1);
    expect(dbPoints[0]?.productId).toBe(product.id);
    expect(Number(dbPoints[0]?.predictedDemand)).toBeGreaterThan(0);

    // Retrieve via GET endpoint
    const getRunRes = await request(app)
      .get(`/api/v1/organizations/${org.id}/forecasts/demand/${forecastId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(getRunRes.status).toBe(200);
    expect(getRunRes.body.data.id).toBe(forecastId);
    expect(getRunRes.body.data.points.length).toBe(dbPoints.length);
  });

  it("should record conversation and message in PostgreSQL when executing AI Copilot chat", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id, {
      name: "Wireless Headphones",
      sku: "WH-HEADPHONE-01",
    });
    const warehouse = await createTestWarehouse(prisma, org.id);
    const location = await createTestLocation(prisma, org.id, warehouse.id);

    await seedTestStock(prisma, {
      organizationId: org.id,
      warehouseId: warehouse.id,
      locationId: location.id,
      productId: product.id,
      quantity: "35.0000",
      userId: user.id,
    });

    // Mock AI provider for deterministic execution without external network latency
    vi.spyOn(aiProvider, "isAvailable").mockReturnValue(true);
    vi.spyOn(aiProvider, "getChatModel").mockReturnValue(new MockChatModel());

    // Send query to Copilot chat
    const chatRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/copilot/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: "What products are in inventory?",
      });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body.success).toBe(true);
    expect(chatRes.body.data.conversationId).toBeDefined();
    expect(chatRes.body.data.message).toBeDefined();

    const conversationId = chatRes.body.data.conversationId;

    // Verify conversation row in PostgreSQL
    const dbConv = await prisma.copilotConversation.findUnique({
      where: { id: conversationId },
      include: { messages: true },
    });

    expect(dbConv).toBeDefined();
    expect(dbConv?.organizationId).toBe(org.id);
    expect(dbConv?.userId).toBe(user.id);
    // At least 2 messages: USER prompt and ASSISTANT reply
    expect(dbConv?.messages.length).toBeGreaterThanOrEqual(2);
  });
});
