import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
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

describe("Inventory Ledger, Balances & Concurrency against PostgreSQL (Integration DB)", () => {
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

  it("should record a stock receipt, creating an append-only ledger transaction and updating balance in PostgreSQL", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id);
    const warehouse = await createTestWarehouse(prisma, org.id);
    const location = await createTestLocation(prisma, org.id, warehouse.id);

    const response = await request(app)
      .post(`/api/v1/organizations/${org.id}/inventory/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.id,
        locationId: location.id,
        quantity: "50.0000",
        reference: "PO-REC-001",
        notes: "Initial inventory delivery",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.balance.quantityOnHand).toBe("50.0000");
    expect(response.body.data.transaction.type).toBe(InventoryTransactionType.RECEIPT);

    // Verify directly in PostgreSQL
    const dbBalance = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId: product.id,
          locationId: location.id,
        },
      },
    });
    expect(dbBalance).toBeDefined();
    expect(new Prisma.Decimal(dbBalance!.quantityOnHand).toFixed(4)).toBe("50.0000");

    const dbTx = await prisma.inventoryTransaction.findFirst({
      where: {
        organizationId: org.id,
        productId: product.id,
        destinationLocationId: location.id,
      },
    });
    expect(dbTx).toBeDefined();
    expect(dbTx?.performedByUserId).toBe(user.id);
    expect(new Prisma.Decimal(dbTx!.quantity).toFixed(4)).toBe("50.0000");
  });

  it("should issue stock, decrement balance, and prevent negative stock under excessive issue request", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id);
    const warehouse = await createTestWarehouse(prisma, org.id);
    const location = await createTestLocation(prisma, org.id, warehouse.id);

    // Seed 25 units
    await seedTestStock(prisma, {
      organizationId: org.id,
      warehouseId: warehouse.id,
      locationId: location.id,
      productId: product.id,
      quantity: "25.0000",
      userId: user.id,
    });

    // 1. Issue 10 units successfully
    const issueRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/inventory/issues`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.id,
        locationId: location.id,
        quantity: "10.0000",
        reason: "Customer order #1001",
      });

    expect(issueRes.status).toBe(201);
    expect(issueRes.body.success).toBe(true);
    expect(issueRes.body.data.balance.quantityOnHand).toBe("15.0000");

    // 2. Attempt to issue 20 units when only 15 remain -> 400 Bad Request
    const failedIssueRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/inventory/issues`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.id,
        locationId: location.id,
        quantity: "20.0000",
        reason: "Excessive demand",
      });

    expect(failedIssueRes.status).toBe(400);
    expect(failedIssueRes.body.success).toBe(false);
    expect(failedIssueRes.body.error.message).toContain("Insufficient stock at location");

    // Verify balance in PostgreSQL remains exactly 15.0000 and was not modified
    const dbBalance = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId: product.id,
          locationId: location.id,
        },
      },
    });
    expect(new Prisma.Decimal(dbBalance!.quantityOnHand).toFixed(4)).toBe("15.0000");
  });

  it("should enforce idempotency: duplicate requests return cached result without duplicate balance increment", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id);
    const warehouse = await createTestWarehouse(prisma, org.id);
    const location = await createTestLocation(prisma, org.id, warehouse.id);

    const idempotencyKey = `idemp-test-${Date.now()}`;
    const payload = {
      productId: product.id,
      locationId: location.id,
      quantity: "30.0000",
      idempotencyKey,
      reference: "BATCH-REC-01",
    };

    // First request: receives 30 units
    const firstRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/inventory/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(firstRes.status).toBe(201);
    const initialTxId = firstRes.body.data.transaction.id;

    // Second request with exact same idempotency key and payload
    const secondRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/inventory/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(secondRes.status).toBe(201);
    expect(secondRes.body.data.transaction.id).toBe(initialTxId);

    // Verify balance in PostgreSQL is 30.0000 (NOT 60.0000)
    const dbBalance = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId: product.id,
          locationId: location.id,
        },
      },
    });
    expect(new Prisma.Decimal(dbBalance!.quantityOnHand).toFixed(4)).toBe("30.0000");

    // Third request with same idempotency key but DIFFERENT quantity -> 409 Conflict
    const conflictingRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/inventory/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...payload,
        quantity: "45.0000",
      });

    expect(conflictingRes.status).toBe(409);
    expect(conflictingRes.body.success).toBe(false);
    expect(conflictingRes.body.error.code).toBe("CONFLICT");
  });

  it("should atomically transfer stock between locations in PostgreSQL", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id);
    const warehouse = await createTestWarehouse(prisma, org.id);
    const sourceLoc = await createTestLocation(prisma, org.id, warehouse.id, { code: "SRC-01" });
    const destLoc = await createTestLocation(prisma, org.id, warehouse.id, { code: "DST-02" });

    // Seed 40 units at source
    await seedTestStock(prisma, {
      organizationId: org.id,
      warehouseId: warehouse.id,
      locationId: sourceLoc.id,
      productId: product.id,
      quantity: "40.0000",
      userId: user.id,
    });

    // Transfer 15 units from source to destination
    const transferRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/inventory/transfers`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.id,
        sourceLocationId: sourceLoc.id,
        destinationLocationId: destLoc.id,
        quantity: "15.0000",
        reference: "INTERNAL-TRANSFER-01",
      });

    expect(transferRes.status).toBe(201);
    expect(transferRes.body.success).toBe(true);

    // Verify balances in PostgreSQL
    const sourceBal = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: { productId: product.id, locationId: sourceLoc.id },
      },
    });
    const destBal = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: { productId: product.id, locationId: destLoc.id },
      },
    });

    expect(new Prisma.Decimal(sourceBal!.quantityOnHand).toFixed(4)).toBe("25.0000");
    expect(new Prisma.Decimal(destBal!.quantityOnHand).toFixed(4)).toBe("15.0000");

    // Verify exactly 1 TRANSFER transaction recorded
    const tx = await prisma.inventoryTransaction.findUnique({
      where: { id: transferRes.body.data.transaction.id },
    });
    expect(tx?.type).toBe(InventoryTransactionType.TRANSFER);
    expect(tx?.sourceLocationId).toBe(sourceLoc.id);
    expect(tx?.destinationLocationId).toBe(destLoc.id);
    expect(new Prisma.Decimal(tx!.quantity).toFixed(4)).toBe("15.0000");
  });

  it("should reject cross-tenant stock transfers with 404 when destination location belongs to another tenant", async () => {
    // Org A
    const { user: userA, token: tokenA } = await createTestUser(prisma);
    const orgA = await createTestOrganization(prisma, userA.id);
    const productA = await createTestProduct(prisma, orgA.id);
    const warehouseA = await createTestWarehouse(prisma, orgA.id);
    const sourceLocA = await createTestLocation(prisma, orgA.id, warehouseA.id);
    cleanupUserIds.push(userA.id);
    cleanupOrgIds.push(orgA.id);

    // Org B
    const { user: userB } = await createTestUser(prisma);
    const orgB = await createTestOrganization(prisma, userB.id);
    const warehouseB = await createTestWarehouse(prisma, orgB.id);
    const destLocB = await createTestLocation(prisma, orgB.id, warehouseB.id);
    cleanupUserIds.push(userB.id);
    cleanupOrgIds.push(orgB.id);

    await seedTestStock(prisma, {
      organizationId: orgA.id,
      warehouseId: warehouseA.id,
      locationId: sourceLocA.id,
      productId: productA.id,
      quantity: "20.0000",
      userId: userA.id,
    });

    const crossTransferRes = await request(app)
      .post(`/api/v1/organizations/${orgA.id}/inventory/transfers`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        productId: productA.id,
        sourceLocationId: sourceLocA.id,
        destinationLocationId: destLocB.id, // belongs to Org B!
        quantity: "10.0000",
      });

    expect(crossTransferRes.status).toBe(404);
    expect(crossTransferRes.body.success).toBe(false);
    expect(crossTransferRes.body.error.message).toContain(
      "Destination storage location not found in this organization",
    );
  });
});
