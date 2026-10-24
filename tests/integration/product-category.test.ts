import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { OrganizationRole, ProductStatus, Prisma } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";

describe("Feature 4: Product and Category Management (Integration)", () => {
  const orgId = "550e8400-e29b-41d4-a716-446655440001";
  const otherOrgId = "550e8400-e29b-41d4-a716-446655440002";

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
    name: "Alpha Corp Logistics",
    slug: "alpha-corp-logistics",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleOtherOrg = {
    id: otherOrgId,
    name: "Beta Global Supply",
    slug: "beta-global-supply",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let externalToken: string;

  // In-memory data structures for realistic multi-tenant verification
  interface CategoryRecord {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  interface ProductRecord {
    id: string;
    organizationId: string;
    categoryId: string | null;
    sku: string;
    name: string;
    description: string | null;
    unitOfMeasure: string;
    costPrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    lowStockThreshold: number;
    status: ProductStatus;
    createdAt: Date;
    updatedAt: Date;
  }

  let categoriesStore: CategoryRecord[] = [];
  let productsStore: ProductRecord[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    categoriesStore = [];
    productsStore = [];

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
            id: "mem-admin-2",
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
            id: "mem-member-3",
            userId: memberUser.id,
            organizationId: orgId,
            role: OrganizationRole.MEMBER,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOrg,
          });
        }
      }

      if (organizationId === otherOrgId && userId === externalUser.id) {
        return Promise.resolve({
          id: "mem-external-4",
          userId: externalUser.id,
          organizationId: otherOrgId,
          role: OrganizationRole.MEMBER,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
          organization: sampleOtherOrg,
        });
      }

      return Promise.resolve(null);
    }) as never);

    // Mock prisma.productCategory
    vi.spyOn(prisma.productCategory, "findFirst").mockImplementation(((args: {
      where: {
        id?: string;
        organizationId?: string;
        name?: { equals?: string; mode?: string };
        NOT?: { id?: string };
      };
      include?: { _count?: { select: { products: boolean } } };
    }) => {
      const match = categoriesStore.find((c) => {
        if (args.where.id && c.id !== args.where.id) return false;
        if (args.where.organizationId && c.organizationId !== args.where.organizationId)
          return false;
        if (args.where.NOT?.id && c.id === args.where.NOT.id) return false;
        if (args.where.name?.equals) {
          if (c.name.toLowerCase() !== args.where.name.equals.toLowerCase()) return false;
        }
        return true;
      });

      if (!match) return Promise.resolve(null);

      const productCount = productsStore.filter((p) => p.categoryId === match.id).length;
      return Promise.resolve({
        ...match,
        ...(args.include?._count && { _count: { products: productCount } }),
      });
    }) as never);

    vi.spyOn(prisma.productCategory, "create").mockImplementation(((args: {
      data: { organizationId: string; name: string; description?: string | null };
    }) => {
      const record: CategoryRecord = {
        id: randomUUID(),
        organizationId: args.data.organizationId,
        name: args.data.name,
        description: args.data.description || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      categoriesStore.push(record);
      return Promise.resolve({
        ...record,
        _count: { products: 0 },
      });
    }) as never);

    vi.spyOn(prisma.productCategory, "findMany").mockImplementation(((args: {
      where: { organizationId: string; name?: { contains: string } };
      skip?: number;
      take?: number;
      orderBy?: Record<string, string>;
    }) => {
      let filtered = categoriesStore.filter((c) => {
        if (c.organizationId !== args.where.organizationId) return false;
        if (
          args.where.name?.contains &&
          !c.name.toLowerCase().includes(args.where.name.contains.toLowerCase())
        ) {
          return false;
        }
        return true;
      });

      if (args.skip !== undefined && args.take !== undefined) {
        filtered = filtered.slice(args.skip, args.skip + args.take);
      }

      const result = filtered.map((c) => ({
        ...c,
        _count: { products: productsStore.filter((p) => p.categoryId === c.id).length },
      }));

      return Promise.resolve(result);
    }) as never);

    vi.spyOn(prisma.productCategory, "count").mockImplementation(((args: {
      where: { organizationId: string; name?: { contains: string } };
    }) => {
      const count = categoriesStore.filter((c) => {
        if (c.organizationId !== args.where.organizationId) return false;
        if (
          args.where.name?.contains &&
          !c.name.toLowerCase().includes(args.where.name.contains.toLowerCase())
        ) {
          return false;
        }
        return true;
      }).length;
      return Promise.resolve(count);
    }) as never);

    vi.spyOn(prisma.productCategory, "update").mockImplementation(((args: {
      where: { id: string };
      data: { name?: string; description?: string | null };
    }) => {
      const idx = categoriesStore.findIndex((c) => c.id === args.where.id);
      if (idx === -1) return Promise.reject(new Error("Not found"));
      const current = categoriesStore[idx]!;
      const updated: CategoryRecord = {
        ...current,
        name: args.data.name ?? current.name,
        description:
          args.data.description !== undefined ? args.data.description : current.description,
        updatedAt: new Date(),
      };
      categoriesStore[idx] = updated;
      const count = productsStore.filter((p) => p.categoryId === updated.id).length;
      return Promise.resolve({
        ...updated,
        _count: { products: count },
      });
    }) as never);

    vi.spyOn(prisma.productCategory, "delete").mockImplementation(((args: {
      where: { id: string };
    }) => {
      const idx = categoriesStore.findIndex((c) => c.id === args.where.id);
      if (idx !== -1) {
        categoriesStore.splice(idx, 1);
      }
      return Promise.resolve({ id: args.where.id });
    }) as never);

    // Mock prisma.product
    vi.spyOn(prisma.product, "findFirst").mockImplementation(((args: {
      where: {
        id?: string;
        organizationId?: string;
        sku?: string;
        NOT?: { id?: string };
      };
    }) => {
      const match = productsStore.find((p) => {
        if (args.where.id && p.id !== args.where.id) return false;
        if (args.where.organizationId && p.organizationId !== args.where.organizationId)
          return false;
        if (args.where.sku && p.sku !== args.where.sku) return false;
        if (args.where.NOT?.id && p.id === args.where.NOT.id) return false;
        return true;
      });

      if (!match) return Promise.resolve(null);

      const cat = categoriesStore.find((c) => c.id === match.categoryId);
      return Promise.resolve({
        ...match,
        category: cat ? { id: cat.id, name: cat.name } : null,
      });
    }) as never);

    vi.spyOn(prisma.product, "create").mockImplementation(((args: {
      data: {
        organizationId: string;
        sku: string;
        name: string;
        description?: string | null;
        categoryId?: string | null;
        unitOfMeasure?: string;
        costPrice: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
        lowStockThreshold?: number;
        status?: ProductStatus;
      };
    }) => {
      const record: ProductRecord = {
        id: randomUUID(),
        organizationId: args.data.organizationId,
        sku: args.data.sku,
        name: args.data.name,
        description: args.data.description ?? null,
        categoryId: args.data.categoryId ?? null,
        unitOfMeasure: args.data.unitOfMeasure ?? "PCS",
        costPrice: args.data.costPrice,
        sellingPrice: args.data.sellingPrice,
        lowStockThreshold: args.data.lowStockThreshold ?? 0,
        status: args.data.status ?? ProductStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      productsStore.push(record);
      const cat = categoriesStore.find((c) => c.id === record.categoryId);
      return Promise.resolve({
        ...record,
        category: cat ? { id: cat.id, name: cat.name } : null,
      });
    }) as never);

    vi.spyOn(prisma.product, "findMany").mockImplementation(((args: {
      where: Prisma.ProductWhereInput;
      skip?: number;
      take?: number;
      orderBy?: Record<string, string>;
    }) => {
      let filtered = productsStore.filter((p) => {
        if (args.where.organizationId && p.organizationId !== args.where.organizationId)
          return false;
        if (args.where.status && p.status !== args.where.status) return false;
        if (args.where.categoryId && p.categoryId !== args.where.categoryId) return false;
        if (args.where.OR) {
          const searchClause = args.where.OR as Array<{
            name?: { contains: string };
            sku?: { contains: string };
          }>;
          const searchTarget = (
            searchClause[0]?.name?.contains ??
            searchClause[1]?.sku?.contains ??
            ""
          ).toLowerCase();
          const matches =
            p.name.toLowerCase().includes(searchTarget) ||
            p.sku.toLowerCase().includes(searchTarget);
          if (!matches) return false;
        }
        if (args.where.sellingPrice) {
          const spClause = args.where.sellingPrice as {
            gte?: Prisma.Decimal;
            lte?: Prisma.Decimal;
          };
          if (spClause.gte && p.sellingPrice.toNumber() < spClause.gte.toNumber()) return false;
          if (spClause.lte && p.sellingPrice.toNumber() > spClause.lte.toNumber()) return false;
        }
        return true;
      });

      if (args.skip !== undefined && args.take !== undefined) {
        filtered = filtered.slice(args.skip, args.skip + args.take);
      }

      const result = filtered.map((p) => {
        const cat = categoriesStore.find((c) => c.id === p.categoryId);
        return {
          ...p,
          category: cat ? { id: cat.id, name: cat.name } : null,
        };
      });

      return Promise.resolve(result);
    }) as never);

    vi.spyOn(prisma.product, "count").mockImplementation(((args: {
      where: Prisma.ProductWhereInput;
    }) => {
      const count = productsStore.filter((p) => {
        if (args.where.organizationId && p.organizationId !== args.where.organizationId)
          return false;
        if (args.where.status && p.status !== args.where.status) return false;
        if (args.where.categoryId && p.categoryId !== args.where.categoryId) return false;
        if (args.where.OR) {
          const searchClause = args.where.OR as Array<{
            name?: { contains: string };
            sku?: { contains: string };
          }>;
          const searchTarget = (
            searchClause[0]?.name?.contains ??
            searchClause[1]?.sku?.contains ??
            ""
          ).toLowerCase();
          const matches =
            p.name.toLowerCase().includes(searchTarget) ||
            p.sku.toLowerCase().includes(searchTarget);
          if (!matches) return false;
        }
        if (args.where.sellingPrice) {
          const spClause = args.where.sellingPrice as {
            gte?: Prisma.Decimal;
            lte?: Prisma.Decimal;
          };
          if (spClause.gte && p.sellingPrice.toNumber() < spClause.gte.toNumber()) return false;
          if (spClause.lte && p.sellingPrice.toNumber() > spClause.lte.toNumber()) return false;
        }
        return true;
      }).length;
      return Promise.resolve(count);
    }) as never);

    vi.spyOn(prisma.product, "update").mockImplementation(((args: {
      where: { id: string };
      data: Partial<ProductRecord>;
    }) => {
      const idx = productsStore.findIndex((p) => p.id === args.where.id);
      if (idx === -1) return Promise.reject(new Error("Not found"));
      const current = productsStore[idx]!;
      const updated: ProductRecord = {
        ...current,
        ...(args.data.name !== undefined && { name: args.data.name }),
        ...(args.data.sku !== undefined && { sku: args.data.sku }),
        ...(args.data.description !== undefined && { description: args.data.description }),
        ...(args.data.categoryId !== undefined && { categoryId: args.data.categoryId }),
        ...(args.data.unitOfMeasure !== undefined && { unitOfMeasure: args.data.unitOfMeasure }),
        ...(args.data.costPrice !== undefined && { costPrice: args.data.costPrice }),
        ...(args.data.sellingPrice !== undefined && { sellingPrice: args.data.sellingPrice }),
        ...(args.data.lowStockThreshold !== undefined && {
          lowStockThreshold: args.data.lowStockThreshold,
        }),
        ...(args.data.status !== undefined && { status: args.data.status }),
        updatedAt: new Date(),
      };
      productsStore[idx] = updated;
      const cat = categoriesStore.find((c) => c.id === updated.categoryId);
      return Promise.resolve({
        ...updated,
        category: cat ? { id: cat.id, name: cat.name } : null,
      });
    }) as never);
  });

  // =========================================================================
  // 1. PRODUCT CATEGORIES LIFECYCLE & MULTI-TENANCY
  // =========================================================================
  describe("Category Management (/categories)", () => {
    it("should reject unauthenticated category creation with 401 Unauthorized", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .send({ name: "Unauthenticated Category" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should reject non-member user from viewing or modifying categories with 404 Not Found (anti-IDOR)", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${externalToken}`)
        .send({ name: "Intruder Category" });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("should reject regular MEMBER from creating category with 403 Forbidden", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ name: "Member Category" });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("should allow OWNER or ADMIN to create category successfully", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Industrial Electronics",
          description: "Sensors, microcontrollers, and actuators",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Industrial Electronics");
      expect(response.body.data.organizationId).toBe(orgId);
    });

    it("should enforce category name uniqueness within an organization with 409 Conflict", async () => {
      // Create first category
      await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Mechanical Fasteners" });

      // Attempt duplicate creation (case-insensitive)
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "mechanical fasteners" });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("already exists");
    });

    it("should allow regular MEMBER to list and retrieve categories (read-only)", async () => {
      // Seed a category
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Pneumatics" });

      const categoryId = createRes.body.data.id;

      // MEMBER can list categories
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.items).toHaveLength(1);
      expect(listRes.body.data.items[0].name).toBe("Pneumatics");

      // MEMBER can get category by ID
      const getRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/categories/${categoryId}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(categoryId);

      // MEMBER cannot update category
      const patchRes = await request(app)
        .patch(`/api/v1/organizations/${orgId}/categories/${categoryId}`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ name: "Pneumatics Updated" });

      expect(patchRes.status).toBe(403);
    });

    it("should prevent deleting a category if it is referenced by existing products (409 Conflict)", async () => {
      // 1. Create category
      const catRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Heavy Machinery" });

      const catId = catRes.body.data.id;

      // 2. Create product referencing category
      await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "FORKLIFT-5T",
          name: "Heavy Duty 5-Ton Forklift",
          categoryId: catId,
          unitOfMeasure: "UNIT",
          costPrice: 25000,
          sellingPrice: 35000,
          lowStockThreshold: 2,
        });

      // 3. Attempt to delete category
      const delRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/categories/${catId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(delRes.status).toBe(409);
      expect(delRes.body.success).toBe(false);
      expect(delRes.body.error.message).toContain("assigned to one or more products");

      // Verify category still exists
      expect(categoriesStore.some((c) => c.id === catId)).toBe(true);
    });

    it("should allow deleting an unreferenced category safely", async () => {
      const catRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Unused Category" });

      const catId = catRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/categories/${catId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
      expect(delRes.body.data.message).toContain("successfully");

      // Verify removed from store
      expect(categoriesStore.some((c) => c.id === catId)).toBe(false);
    });
  });

  // =========================================================================
  // 2. PRODUCT MANAGEMENT, PRICING, & FILTERING
  // =========================================================================
  describe("Product Management (/products)", () => {
    it("should reject product creation by regular MEMBER with 403 Forbidden", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({
          sku: "UNAUTH-SKU",
          name: "Unauthorized Product",
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("should validate input schema and reject negative prices", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          sku: "INVALID-PRICE-SKU",
          name: "Invalid Price Product",
          costPrice: -10,
          sellingPrice: 50,
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });

    it("should reject assigning a category from another organization (anti-IDOR)", async () => {
      const foreignCatId = randomUUID();
      // Seed a category in otherOrgId
      categoriesStore.push({
        id: foreignCatId,
        organizationId: otherOrgId,
        name: "Foreign Category",
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "CROSS-TENANT-SKU",
          name: "Cross Tenant Product",
          categoryId: foreignCatId,
          costPrice: 10,
          sellingPrice: 20,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("does not exist in this organization");
    });

    it("should create product with SKU and exact decimal monetary precision", async () => {
      const catRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/categories`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Robotics" });

      const catId = catRes.body.data.id;

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "rob-arm-001",
          name: "6-Axis Robotic Arm",
          description: "High precision articulated assembly arm",
          categoryId: catId,
          unitOfMeasure: "PCS",
          costPrice: 4500.5,
          sellingPrice: 8999.99,
          lowStockThreshold: 3,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe("ROB-ARM-001"); // normalized uppercase
      expect(response.body.data.costPrice).toBe(4500.5);
      expect(response.body.data.sellingPrice).toBe(8999.99);
      expect(response.body.data.status).toBe("ACTIVE");
      expect(response.body.data.category).toEqual({
        id: catId,
        name: "Robotics",
      });
    });

    it("should reject duplicate SKU in same organization with 409 Conflict", async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "DUPLICATE-SKU",
          name: "First Product",
        });

      const duplicateRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          sku: "duplicate-sku",
          name: "Second Product",
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.error.message).toContain("already exists in this organization");
    });

    it("should allow the same SKU in DIFFERENT organizations (multi-tenant isolation)", async () => {
      // 1. In orgId
      await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "SHARED-SKU-100",
          name: "Alpha Corp Shared Product",
        });

      // 2. In otherOrgId (using externalToken who belongs to otherOrgId)
      // First update external membership mock to ADMIN for otherOrgId
      vi.spyOn(prisma.organizationMembership, "findUnique").mockImplementation(((args: {
        where: { userId_organizationId: { userId: string; organizationId: string } };
      }) => {
        const { userId, organizationId } = args.where.userId_organizationId;
        if (organizationId === otherOrgId && userId === externalUser.id) {
          return Promise.resolve({
            id: "mem-external-4",
            userId: externalUser.id,
            organizationId: otherOrgId,
            role: OrganizationRole.ADMIN,
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: new Date("2026-01-01T10:00:00Z"),
            organization: sampleOtherOrg,
          });
        }
        return Promise.resolve(null);
      }) as never);

      const otherRes = await request(app)
        .post(`/api/v1/organizations/${otherOrgId}/products`)
        .set("Authorization", `Bearer ${externalToken}`)
        .send({
          sku: "SHARED-SKU-100",
          name: "Beta Global Shared Product",
        });

      expect(otherRes.status).toBe(201);
      expect(otherRes.body.data.sku).toBe("SHARED-SKU-100");
      expect(otherRes.body.data.organizationId).toBe(otherOrgId);
    });

    it("should list products with search, pagination, and price range filters", async () => {
      // Seed products in orgId
      productsStore.push(
        {
          id: randomUUID(),
          organizationId: orgId,
          categoryId: null,
          sku: "ELEC-001",
          name: "Industrial Inverter",
          description: null,
          unitOfMeasure: "PCS",
          costPrice: new Prisma.Decimal("100"),
          sellingPrice: new Prisma.Decimal("150"),
          lowStockThreshold: 5,
          status: ProductStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: randomUUID(),
          organizationId: orgId,
          categoryId: null,
          sku: "ELEC-002",
          name: "Servo Drive",
          description: null,
          unitOfMeasure: "PCS",
          costPrice: new Prisma.Decimal("200"),
          sellingPrice: new Prisma.Decimal("350"),
          lowStockThreshold: 2,
          status: ProductStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: randomUUID(),
          organizationId: orgId,
          categoryId: null,
          sku: "MECH-001",
          name: "Ball Bearing Unit",
          description: null,
          unitOfMeasure: "PCS",
          costPrice: new Prisma.Decimal("20"),
          sellingPrice: new Prisma.Decimal("45"),
          lowStockThreshold: 10,
          status: ProductStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );

      // Search by keyword "Servo"
      const searchRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/products?search=servo`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.items).toHaveLength(1);
      expect(searchRes.body.data.items[0].sku).toBe("ELEC-002");

      // Price filter: minPrice = 100, maxPrice = 200
      const priceRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/products?minPrice=100&maxPrice=200`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(priceRes.status).toBe(200);
      expect(priceRes.body.data.items).toHaveLength(1);
      expect(priceRes.body.data.items[0].sku).toBe("ELEC-001");
    });

    it("should soft-archive a product and exclude it from the default active list", async () => {
      // 1. Create product
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "DISCONTINUE-001",
          name: "Discontinued Motor",
        });

      const prodId = createRes.body.data.id;

      // 2. Soft-archive (DELETE endpoint)
      const archiveRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/products/${prodId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.success).toBe(true);
      expect(archiveRes.body.data.status).toBe("ARCHIVED");

      // 3. Default GET /products list only returns ACTIVE items
      const activeListRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(activeListRes.status).toBe(200);
      expect(activeListRes.body.data.items.some((item: { id: string }) => item.id === prodId)).toBe(
        false,
      );

      // 4. Querying with ?status=ARCHIVED returns the soft-archived product
      const archivedListRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/products?status=ARCHIVED`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(archivedListRes.status).toBe(200);
      expect(
        archivedListRes.body.data.items.some((item: { id: string }) => item.id === prodId),
      ).toBe(true);
    });

    it("should update product fields cleanly and reject SKU collision with another product", async () => {
      const prod1Res = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "ALPHA-SKU-1",
          name: "Alpha Product 1",
          costPrice: 50,
          sellingPrice: 100,
        });

      const prod2Res = await request(app)
        .post(`/api/v1/organizations/${orgId}/products`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          sku: "ALPHA-SKU-2",
          name: "Alpha Product 2",
          costPrice: 75,
          sellingPrice: 150,
        });

      expect(prod1Res.status).toBe(201);
      expect(prod2Res.status).toBe(201);

      const prod1Id = prod1Res.body.data.id;

      // Update prod1 details
      const updateRes = await request(app)
        .patch(`/api/v1/organizations/${orgId}/products/${prod1Id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Alpha Product 1 Pro Edition",
          sellingPrice: 125,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe("Alpha Product 1 Pro Edition");
      expect(updateRes.body.data.sellingPrice).toBe(125);

      // Attempt collision: updating prod1 SKU to match prod2 SKU
      const collisionRes = await request(app)
        .patch(`/api/v1/organizations/${orgId}/products/${prod1Id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          sku: "ALPHA-SKU-2",
        });

      expect(collisionRes.status).toBe(409);
      expect(collisionRes.body.success).toBe(false);
      expect(collisionRes.body.error.message).toContain("already exists in this organization");
    });
  });
});
