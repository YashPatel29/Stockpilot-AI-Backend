import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { OrganizationRole } from "@prisma/client";
import { app } from "../../../src/app";
import {
  assertTestDatabaseConnection,
  getTestPrisma,
  cleanTestTenant,
} from "../../helpers/test-db-guard";
import {
  createTestUser,
  createTestOrganization,
  createTestCategory,
  createTestProduct,
  createTestWarehouse,
} from "../../helpers/test-factories";

describe("Multi-Tenancy, Isolation & RBAC against PostgreSQL (Integration DB)", () => {
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

  it("should create an organization in PostgreSQL and assign caller as OWNER", async () => {
    const { user, token } = await createTestUser(prisma);
    cleanupUserIds.push(user.id);

    const orgName = `Enterprise ${Date.now()}`;
    const response = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: orgName,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.organization.name).toBe(orgName);

    const orgId = response.body.data.organization.id;
    cleanupOrgIds.push(orgId);

    // Verify database membership assignment
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
    });

    expect(membership).toBeDefined();
    expect(membership?.role).toBe(OrganizationRole.OWNER);
  });

  it("should enforce cross-tenant IDOR non-disclosure (404) across products and warehouses", async () => {
    // Tenant A
    const { user: userA } = await createTestUser(prisma);
    const orgA = await createTestOrganization(prisma, userA.id);
    cleanupUserIds.push(userA.id);
    cleanupOrgIds.push(orgA.id);

    const categoryA = await createTestCategory(prisma, orgA.id);
    const productA = await createTestProduct(prisma, orgA.id, { categoryId: categoryA.id });
    const warehouseA = await createTestWarehouse(prisma, orgA.id);

    // Tenant B
    const { user: userB, token: tokenB } = await createTestUser(prisma);
    const orgB = await createTestOrganization(prisma, userB.id);
    cleanupUserIds.push(userB.id);
    cleanupOrgIds.push(orgB.id);

    // Tenant B attempts to read Tenant A's product
    const readProdRes = await request(app)
      .get(`/api/v1/organizations/${orgA.id}/products/${productA.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(readProdRes.status).toBe(404);
    expect(readProdRes.body.success).toBe(false);
    expect(readProdRes.body.error.code).toBe("NOT_FOUND");
    expect(readProdRes.body.error.message).toContain("Organization not found");

    // Tenant B attempts to update Tenant A's warehouse
    const updateWhRes = await request(app)
      .patch(`/api/v1/organizations/${orgA.id}/warehouses/${warehouseA.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Hacked Warehouse" });

    expect(updateWhRes.status).toBe(404);
    expect(updateWhRes.body.success).toBe(false);

    // Tenant B attempts to delete Tenant A's category
    const deleteCatRes = await request(app)
      .delete(`/api/v1/organizations/${orgA.id}/categories/${categoryA.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(deleteCatRes.status).toBe(404);
    expect(deleteCatRes.body.success).toBe(false);

    // Verify row in database was NOT altered
    const dbProduct = await prisma.product.findUnique({ where: { id: productA.id } });
    expect(dbProduct?.name).toBe(productA.name);
  });

  it("should enforce RBAC: prevent MEMBER from creating products, allow after promotion to ADMIN", async () => {
    const { user: owner, token: ownerToken } = await createTestUser(prisma);
    const org = await createTestOrganization(prisma, owner.id);
    cleanupUserIds.push(owner.id);
    cleanupOrgIds.push(org.id);

    // Create a regular member
    const { user: member, token: memberToken } = await createTestUser(prisma);
    cleanupUserIds.push(member.id);

    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: member.id,
        role: OrganizationRole.MEMBER,
      },
    });

    // 1. MEMBER attempts to create a product -> 403 Forbidden
    const memberCreateRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/products`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        sku: "PROD-BLOCKED-01",
        name: "Blocked Product",
        costPrice: 15,
        sellingPrice: 30,
      });

    expect(memberCreateRes.status).toBe(403);
    expect(memberCreateRes.body.success).toBe(false);
    expect(memberCreateRes.body.error.code).toBe("FORBIDDEN");

    // 2. OWNER promotes MEMBER to ADMIN
    const promoteRes = await request(app)
      .patch(`/api/v1/organizations/${org.id}/members/${membership.id}/role`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        role: "ADMIN",
      });

    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.success).toBe(true);
    expect(promoteRes.body.data.role).toBe("ADMIN");

    // Verify role in PostgreSQL
    const dbMembership = await prisma.organizationMembership.findUnique({
      where: { id: membership.id },
    });
    expect(dbMembership?.role).toBe(OrganizationRole.ADMIN);

    // 3. Promoted ADMIN now creates product -> 201 Created
    const adminCreateRes = await request(app)
      .post(`/api/v1/organizations/${org.id}/products`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        sku: "PROD-ALLOWED-01",
        name: "Allowed Admin Product",
        costPrice: 20,
        sellingPrice: 40,
      });

    expect(adminCreateRes.status).toBe(201);
    expect(adminCreateRes.body.success).toBe(true);
    expect(adminCreateRes.body.data.sku).toBe("PROD-ALLOWED-01");
  });

  it("should list all organizations an authenticated identity holds active memberships in", async () => {
    const { user, token } = await createTestUser(prisma);
    cleanupUserIds.push(user.id);

    const org1 = await createTestOrganization(prisma, user.id, { name: "Org Alpha" });
    const org2 = await createTestOrganization(prisma, user.id, { name: "Org Beta" });
    cleanupOrgIds.push(org1.id, org2.id);

    const response = await request(app)
      .get("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeInstanceOf(Array);

    const returnedOrgIds = response.body.data.map((item: { id: string }) => item.id);
    expect(returnedOrgIds).toContain(org1.id);
    expect(returnedOrgIds).toContain(org2.id);
  });
});
