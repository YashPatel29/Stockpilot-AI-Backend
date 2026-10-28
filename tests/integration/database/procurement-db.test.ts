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
  createTestSupplier,
} from "../../helpers/test-factories";
import { PurchaseOrderStatus } from "../../../src/modules/procurement/purchase-orders/purchase-order.types";
import { InventoryTransactionType } from "../../../src/modules/inventory/inventory.types";

describe("Procurement & Receiving Workflows against PostgreSQL (Integration DB)", () => {
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

  it("should execute the full procurement workflow: DRAFT -> SUBMIT -> APPROVE -> PARTIAL RECEIPT -> FULL RECEIPT", async () => {
    const { user, token } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, user.id);
    cleanupUserIds.push(user.id);
    cleanupOrgIds.push(org.id);

    const product = await createTestProduct(prisma, org.id, { costPrice: "25.0000" });
    const supplier = await createTestSupplier(prisma, org.id);
    const warehouse = await createTestWarehouse(prisma, org.id);
    const location = await createTestLocation(prisma, org.id, warehouse.id);

    // 1. Create Purchase Order in DRAFT status
    const createRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/purchase-orders`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        supplierId: supplier.id,
        items: [
          {
            productId: product.id,
            quantityOrdered: 20,
            unitCost: 25.0,
          },
        ],
        taxAmount: 50.0,
        currency: "USD",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.status).toBe(PurchaseOrderStatus.DRAFT);
    expect(createRes.body.data.subtotal).toBe("500.0000");
    expect(createRes.body.data.totalAmount).toBe("550.0000");

    const poId = createRes.body.data.id;

    // 2. Submit for approval -> PENDING_APPROVAL
    const submitRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/purchase-orders/${poId}/submit`)
      .set("Authorization", `Bearer ${token}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe(PurchaseOrderStatus.PENDING_APPROVAL);

    // Attempting to receive before approval must fail -> 400 Bad Request
    const prematureReceiveRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/purchase-orders/${poId}/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: location.id,
        items: [{ productId: product.id, quantity: 10 }],
      });
    expect(prematureReceiveRes.status).toBe(400);

    // 3. Approve order -> APPROVED
    const approveRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/purchase-orders/${poId}/approve`)
      .set("Authorization", `Bearer ${token}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe(PurchaseOrderStatus.APPROVED);

    // 4. Partial receiving: receive 8 of 20 units
    const partialReceiveRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/purchase-orders/${poId}/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: location.id,
        items: [{ productId: product.id, quantity: 8 }],
        reference: "PARTIAL-DELIVERY-1",
      });

    expect(partialReceiveRes.status).toBe(200);
    expect(partialReceiveRes.body.data.status).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);

    // Verify InventoryBalance in PostgreSQL was incremented to 8
    const balanceAfterPartial = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: { productId: product.id, locationId: location.id },
      },
    });
    expect(new Prisma.Decimal(balanceAfterPartial!.quantityOnHand).toFixed(4)).toBe("8.0000");

    // Verify ledger transaction was recorded in PostgreSQL
    const ledgerTx = await prisma.inventoryTransaction.findFirst({
      where: {
        organizationId: org.id,
        productId: product.id,
        destinationLocationId: location.id,
        type: InventoryTransactionType.RECEIPT,
      },
    });
    expect(ledgerTx).toBeDefined();

    // 5. Final receiving: receive remaining 12 units
    const finalReceiveRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/purchase-orders/${poId}/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: location.id,
        items: [{ productId: product.id, quantity: 12 }],
        reference: "FINAL-DELIVERY-2",
      });

    expect(finalReceiveRes.status).toBe(200);
    expect(finalReceiveRes.body.data.status).toBe(PurchaseOrderStatus.RECEIVED);

    // Verify total InventoryBalance is now 20
    const finalBalance = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: { productId: product.id, locationId: location.id },
      },
    });
    expect(new Prisma.Decimal(finalBalance!.quantityOnHand).toFixed(4)).toBe("20.0000");

    // 6. Over-receiving check: Attempting to receive more units on fulfilled PO -> 400 Bad Request
    const overReceiveRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/purchase-orders/${poId}/receipts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: location.id,
        items: [{ productId: product.id, quantity: 1 }],
      });

    expect(overReceiveRes.status).toBe(400);
  });

  it("should reject purchase order creation referencing a supplier from another tenant with 404", async () => {
    // Org A
    const { user: userA, token: tokenA } = await createTestUser(prisma);
    const orgA = await createTestOrganization(prisma, userA.id);
    const productA = await createTestProduct(prisma, orgA.id);
    cleanupUserIds.push(userA.id);
    cleanupOrgIds.push(orgA.id);

    // Org B
    const { user: userB } = await createTestUser(prisma);
    const orgB = await createTestOrganization(prisma, userB.id);
    const supplierB = await createTestSupplier(prisma, orgB.id);
    cleanupUserIds.push(userB.id);
    cleanupOrgIds.push(orgB.id);

    const crossSupplierRes = await request(app)
      .post(`/api/v1/organizations/${orgA.id}/purchase-orders`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        supplierId: supplierB.id, // belongs to Org B!
        items: [
          {
            productId: productA.id,
            quantityOrdered: 10,
            unitCost: 15.0,
          },
        ],
      });

    expect(crossSupplierRes.status).toBe(404);
    expect(crossSupplierRes.body.success).toBe(false);
    expect(crossSupplierRes.body.error.message).toContain(
      "Supplier not found in this organization",
    );
  });

  it("should reject receiving goods into a location belonging to another tenant with 404", async () => {
    // Org A
    const { user: userA, token: tokenA } = await createTestUser(prisma);
    const orgA = await createTestOrganization(prisma, userA.id);
    const productA = await createTestProduct(prisma, orgA.id);
    const supplierA = await createTestSupplier(prisma, orgA.id);
    cleanupUserIds.push(userA.id);
    cleanupOrgIds.push(orgA.id);

    // Org B
    const { user: userB } = await createTestUser(prisma);
    const orgB = await createTestOrganization(prisma, userB.id);
    const warehouseB = await createTestWarehouse(prisma, orgB.id);
    const locationB = await createTestLocation(prisma, orgB.id, warehouseB.id);
    cleanupUserIds.push(userB.id);
    cleanupOrgIds.push(orgB.id);

    // Create & Approve PO in Org A
    const poRes = await request(app)
      .post(`/api/v1/organizations/${orgA.id}/purchase-orders`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        supplierId: supplierA.id,
        items: [{ productId: productA.id, quantityOrdered: 5, unitCost: 10 }],
      });
    const poId = poRes.body.data.id;

    await request(app)
      .post(`/api/v1/organizations/${orgA.id}/purchase-orders/${poId}/submit`)
      .set("Authorization", `Bearer ${tokenA}`);
    await request(app)
      .post(`/api/v1/organizations/${orgA.id}/purchase-orders/${poId}/approve`)
      .set("Authorization", `Bearer ${tokenA}`);

    // Attempt to receive into locationB (belongs to Org B) -> 404 Not Found
    const receiveRes = await request(app)
      .post(`/api/v1/organizations/${orgA.id}/purchase-orders/${poId}/receipts`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        locationId: locationB.id, // belongs to Org B!
        items: [{ productId: productA.id, quantity: 5 }],
      });

    expect(receiveRes.status).toBe(404);
    expect(receiveRes.body.success).toBe(false);
    expect(receiveRes.body.error.message).toContain(
      "Storage location not found in this organization",
    );
  });
});
