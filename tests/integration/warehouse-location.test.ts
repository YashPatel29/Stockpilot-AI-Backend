import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { OrganizationRole, type Prisma } from "@prisma/client";
import { WarehouseStatus } from "../../src/modules/warehouses/warehouses/warehouse.types";
import { LocationStatus } from "../../src/modules/warehouses/locations/location.types";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";

describe("Feature 5: Warehouses and Stock Locations (Integration)", () => {
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

  interface WarehouseRecord {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    description: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    status: WarehouseStatus;
    createdAt: Date;
    updatedAt: Date;
  }

  interface LocationRecord {
    id: string;
    organizationId: string;
    warehouseId: string;
    code: string;
    name: string;
    description: string | null;
    type: string | null;
    status: LocationStatus;
    createdAt: Date;
    updatedAt: Date;
  }

  let warehousesStore: WarehouseRecord[] = [];
  let locationsStore: LocationRecord[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    warehousesStore = [];
    locationsStore = [];

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
          role: OrganizationRole.ADMIN,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-01T10:00:00Z"),
          organization: sampleOtherOrg,
        });
      }

      return Promise.resolve(null);
    }) as never);

    // Mock prisma.$transaction
    vi.spyOn(prisma, "$transaction").mockImplementation(((actions: Array<Promise<unknown>>) => {
      return Promise.all(actions);
    }) as never);

    // Mock prisma.warehouse
    vi.spyOn(prisma.warehouse, "findFirst").mockImplementation(((args: {
      where: {
        id?: string;
        organizationId?: string;
        code?: string;
        NOT?: { id?: string };
      };
      include?: { _count?: { select: { locations: boolean } } };
    }) => {
      const match = warehousesStore.find((w) => {
        if (args.where.id && w.id !== args.where.id) return false;
        if (args.where.organizationId && w.organizationId !== args.where.organizationId)
          return false;
        if (args.where.code && w.code !== args.where.code) return false;
        if (args.where.NOT?.id && w.id === args.where.NOT.id) return false;
        return true;
      });

      if (!match) return Promise.resolve(null);

      const count = locationsStore.filter((l) => l.warehouseId === match.id).length;
      return Promise.resolve({
        ...match,
        ...(args.include?._count && { _count: { locations: count } }),
      });
    }) as never);

    vi.spyOn(prisma.warehouse, "create").mockImplementation(((args: {
      data: Omit<WarehouseRecord, "id" | "createdAt" | "updatedAt">;
    }) => {
      const record: WarehouseRecord = {
        id: randomUUID(),
        ...args.data,
        description: args.data.description ?? null,
        addressLine1: args.data.addressLine1 ?? null,
        addressLine2: args.data.addressLine2 ?? null,
        city: args.data.city ?? null,
        state: args.data.state ?? null,
        postalCode: args.data.postalCode ?? null,
        country: args.data.country ?? null,
        status: args.data.status ?? WarehouseStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      warehousesStore.push(record);
      return Promise.resolve({
        ...record,
        _count: { locations: 0 },
      });
    }) as never);

    vi.spyOn(prisma.warehouse, "findMany").mockImplementation(((args: {
      where: Prisma.WarehouseWhereInput;
      skip?: number;
      take?: number;
      orderBy?: Record<string, string>;
    }) => {
      let filtered = warehousesStore.filter((w) => {
        if (args.where.organizationId && w.organizationId !== args.where.organizationId)
          return false;
        if (args.where.status && w.status !== args.where.status) return false;
        if (args.where.OR) {
          const searchClause = args.where.OR as Array<{
            name?: { contains: string };
            code?: { contains: string };
          }>;
          const searchTarget = (
            searchClause[0]?.name?.contains ??
            searchClause[1]?.code?.contains ??
            ""
          ).toLowerCase();
          const matches =
            w.name.toLowerCase().includes(searchTarget) ||
            w.code.toLowerCase().includes(searchTarget);
          if (!matches) return false;
        }
        return true;
      });

      if (args.skip !== undefined && args.take !== undefined) {
        filtered = filtered.slice(args.skip, args.skip + args.take);
      }

      const result = filtered.map((w) => ({
        ...w,
        _count: { locations: locationsStore.filter((l) => l.warehouseId === w.id).length },
      }));

      return Promise.resolve(result);
    }) as never);

    vi.spyOn(prisma.warehouse, "count").mockImplementation(((args: {
      where: Prisma.WarehouseWhereInput;
    }) => {
      const count = warehousesStore.filter((w) => {
        if (args.where.organizationId && w.organizationId !== args.where.organizationId)
          return false;
        if (args.where.status && w.status !== args.where.status) return false;
        if (args.where.OR) {
          const searchClause = args.where.OR as Array<{
            name?: { contains: string };
            code?: { contains: string };
          }>;
          const searchTarget = (
            searchClause[0]?.name?.contains ??
            searchClause[1]?.code?.contains ??
            ""
          ).toLowerCase();
          const matches =
            w.name.toLowerCase().includes(searchTarget) ||
            w.code.toLowerCase().includes(searchTarget);
          if (!matches) return false;
        }
        return true;
      }).length;
      return Promise.resolve(count);
    }) as never);

    vi.spyOn(prisma.warehouse, "update").mockImplementation(((args: {
      where: { id: string };
      data: Partial<WarehouseRecord>;
    }) => {
      const idx = warehousesStore.findIndex((w) => w.id === args.where.id);
      if (idx === -1) return Promise.reject(new Error("Not found"));
      const current = warehousesStore[idx]!;
      const updated: WarehouseRecord = {
        ...current,
        ...(args.data.code !== undefined && { code: args.data.code }),
        ...(args.data.name !== undefined && { name: args.data.name }),
        ...(args.data.description !== undefined && { description: args.data.description }),
        ...(args.data.addressLine1 !== undefined && { addressLine1: args.data.addressLine1 }),
        ...(args.data.addressLine2 !== undefined && { addressLine2: args.data.addressLine2 }),
        ...(args.data.city !== undefined && { city: args.data.city }),
        ...(args.data.state !== undefined && { state: args.data.state }),
        ...(args.data.postalCode !== undefined && { postalCode: args.data.postalCode }),
        ...(args.data.country !== undefined && { country: args.data.country }),
        ...(args.data.status !== undefined && { status: args.data.status }),
        updatedAt: new Date(),
      };
      warehousesStore[idx] = updated;
      const count = locationsStore.filter((l) => l.warehouseId === updated.id).length;
      return Promise.resolve({
        ...updated,
        _count: { locations: count },
      });
    }) as never);

    // Mock prisma.storageLocation
    vi.spyOn(prisma.storageLocation, "findFirst").mockImplementation(((args: {
      where: {
        id?: string;
        warehouseId?: string;
        organizationId?: string;
        code?: string;
        NOT?: { id?: string };
      };
    }) => {
      const match = locationsStore.find((l) => {
        if (args.where.id && l.id !== args.where.id) return false;
        if (args.where.warehouseId && l.warehouseId !== args.where.warehouseId) return false;
        if (args.where.organizationId && l.organizationId !== args.where.organizationId)
          return false;
        if (args.where.code && l.code !== args.where.code) return false;
        if (args.where.NOT?.id && l.id === args.where.NOT.id) return false;
        return true;
      });

      return Promise.resolve(match ? { ...match } : null);
    }) as never);

    vi.spyOn(prisma.storageLocation, "create").mockImplementation(((args: {
      data: Omit<LocationRecord, "id" | "createdAt" | "updatedAt">;
    }) => {
      const record: LocationRecord = {
        id: randomUUID(),
        ...args.data,
        description: args.data.description ?? null,
        type: args.data.type ?? null,
        status: args.data.status ?? LocationStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      locationsStore.push(record);
      return Promise.resolve({ ...record });
    }) as never);

    vi.spyOn(prisma.storageLocation, "findMany").mockImplementation(((args: {
      where: Prisma.StorageLocationWhereInput;
      skip?: number;
      take?: number;
      orderBy?: Record<string, string>;
    }) => {
      let filtered = locationsStore.filter((l) => {
        if (args.where.organizationId && l.organizationId !== args.where.organizationId)
          return false;
        if (args.where.warehouseId && l.warehouseId !== args.where.warehouseId) return false;
        if (args.where.status && l.status !== args.where.status) return false;
        if (args.where.type) {
          const typeClause = args.where.type as { equals?: string };
          if (typeClause.equals && l.type !== typeClause.equals) return false;
        }
        if (args.where.OR) {
          const searchClause = args.where.OR as Array<{
            name?: { contains: string };
            code?: { contains: string };
          }>;
          const searchTarget = (
            searchClause[0]?.name?.contains ??
            searchClause[1]?.code?.contains ??
            ""
          ).toLowerCase();
          const matches =
            l.name.toLowerCase().includes(searchTarget) ||
            l.code.toLowerCase().includes(searchTarget);
          if (!matches) return false;
        }
        return true;
      });

      if (args.skip !== undefined && args.take !== undefined) {
        filtered = filtered.slice(args.skip, args.skip + args.take);
      }

      return Promise.resolve(filtered.map((l) => ({ ...l })));
    }) as never);

    vi.spyOn(prisma.storageLocation, "count").mockImplementation(((args: {
      where: Prisma.StorageLocationWhereInput;
    }) => {
      const count = locationsStore.filter((l) => {
        if (args.where.organizationId && l.organizationId !== args.where.organizationId)
          return false;
        if (args.where.warehouseId && l.warehouseId !== args.where.warehouseId) return false;
        if (args.where.status && l.status !== args.where.status) return false;
        if (args.where.type) {
          const typeClause = args.where.type as { equals?: string };
          if (typeClause.equals && l.type !== typeClause.equals) return false;
        }
        if (args.where.OR) {
          const searchClause = args.where.OR as Array<{
            name?: { contains: string };
            code?: { contains: string };
          }>;
          const searchTarget = (
            searchClause[0]?.name?.contains ??
            searchClause[1]?.code?.contains ??
            ""
          ).toLowerCase();
          const matches =
            l.name.toLowerCase().includes(searchTarget) ||
            l.code.toLowerCase().includes(searchTarget);
          if (!matches) return false;
        }
        return true;
      }).length;
      return Promise.resolve(count);
    }) as never);

    vi.spyOn(prisma.storageLocation, "update").mockImplementation(((args: {
      where: { id: string };
      data: Partial<LocationRecord>;
    }) => {
      const idx = locationsStore.findIndex((l) => l.id === args.where.id);
      if (idx === -1) return Promise.reject(new Error("Not found"));
      const current = locationsStore[idx]!;
      const updated: LocationRecord = {
        ...current,
        ...(args.data.code !== undefined && { code: args.data.code }),
        ...(args.data.name !== undefined && { name: args.data.name }),
        ...(args.data.description !== undefined && { description: args.data.description }),
        ...(args.data.type !== undefined && { type: args.data.type }),
        ...(args.data.status !== undefined && { status: args.data.status }),
        updatedAt: new Date(),
      };
      locationsStore[idx] = updated;
      return Promise.resolve({ ...updated });
    }) as never);

    vi.spyOn(prisma.storageLocation, "updateMany").mockImplementation(((args: {
      where: Prisma.StorageLocationWhereInput;
      data: Partial<LocationRecord>;
    }) => {
      let count = 0;
      locationsStore.forEach((l, idx) => {
        if (args.where.warehouseId && l.warehouseId !== args.where.warehouseId) return;
        if (args.where.organizationId && l.organizationId !== args.where.organizationId) return;
        if (args.where.status && l.status !== args.where.status) return;

        locationsStore[idx] = {
          ...l,
          ...(args.data.status !== undefined && { status: args.data.status }),
          updatedAt: new Date(),
        };
        count++;
      });
      return Promise.resolve({ count });
    }) as never);
  });

  // =========================================================================
  // 1. WAREHOUSE MANAGEMENT & MULTI-TENANCY
  // =========================================================================
  describe("Warehouse Facility Management (/warehouses)", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .send({ code: "WH-01", name: "Unauthorized Hub" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should reject non-member user with 404 Not Found (anti-IDOR protection)", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${externalToken}`)
        .send({ code: "WH-01", name: "Intruder Hub" });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("should reject regular MEMBER from creating warehouse with 403 Forbidden", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ code: "WH-MEMBER", name: "Member Hub" });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("should allow OWNER and ADMIN to create a warehouse with normalized code", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          code: "wh-nyc-01",
          name: "New York Main Hub",
          city: "Brooklyn",
          state: "NY",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe("WH-NYC-01");
      expect(response.body.data.status).toBe("ACTIVE");
      expect(response.body.data.organizationId).toBe(orgId);
    });

    it("should reject duplicate warehouse code in same organization with 409 Conflict", async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "WH-DUPLICATE", name: "Original Warehouse" });

      const duplicateRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code: "wh-duplicate", name: "Duplicate Warehouse" });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.error.message).toContain("already exists in this organization");
    });

    it("should allow the same warehouse code in DIFFERENT organizations (multi-tenant)", async () => {
      // 1. In orgId
      const orgRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "SHARED-WH-01", name: "Alpha Shared Warehouse" });

      expect(orgRes.status).toBe(201);

      // 2. In otherOrgId (using externalToken who is admin of otherOrgId)
      const otherRes = await request(app)
        .post(`/api/v1/organizations/${otherOrgId}/warehouses`)
        .set("Authorization", `Bearer ${externalToken}`)
        .send({ code: "SHARED-WH-01", name: "Beta Shared Warehouse" });

      expect(otherRes.status).toBe(201);
      expect(otherRes.body.data.code).toBe("SHARED-WH-01");
      expect(otherRes.body.data.organizationId).toBe(otherOrgId);
    });

    it("should allow MEMBER to list and retrieve warehouses (read-only)", async () => {
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "WH-LIST-01", name: "Listing Test Hub" });

      const warehouseId = createRes.body.data.id;

      // MEMBER can list
      const listRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items).toHaveLength(1);

      // MEMBER can retrieve
      const getRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(warehouseId);

      // MEMBER cannot update
      const patchRes = await request(app)
        .patch(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ name: "Hacked Warehouse" });

      expect(patchRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 2. STORAGE LOCATIONS & INACTIVE WAREHOUSE GUARD
  // =========================================================================
  describe("Storage Location Management (/locations)", () => {
    let warehouseId: string;

    beforeEach(async () => {
      const whRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "WH-LOC-TEST", name: "Location Testing Facility" });

      warehouseId = whRes.body.data.id;
    });

    it("should allow creating storage locations with uppercase normalized code", async () => {
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "aisle-a-rack-01",
          name: "Aisle A Rack 1",
          type: "rack",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe("AISLE-A-RACK-01");
      expect(response.body.data.type).toBe("RACK");
      expect(response.body.data.status).toBe("ACTIVE");
      expect(response.body.data.warehouseId).toBe(warehouseId);
    });

    it("should reject duplicate location code within the same warehouse with 409 Conflict", async () => {
      await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "SHELF-B-01", name: "Shelf B 1" });

      const dupRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code: "shelf-b-01", name: "Shelf B 1 Duplicate" });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.message).toContain("already exists in this warehouse");
    });

    it("should allow the same location code in DIFFERENT warehouses", async () => {
      // 1. In warehouse 1
      await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "BIN-01", name: "Bin 01 in WH 1" });

      // 2. Create warehouse 2
      const wh2Res = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "WH-SECOND-01", name: "Second Facility" });

      const wh2Id = wh2Res.body.data.id;

      // 3. In warehouse 2 with same location code
      const loc2Res = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${wh2Id}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "BIN-01", name: "Bin 01 in WH 2" });

      expect(loc2Res.status).toBe(201);
      expect(loc2Res.body.data.code).toBe("BIN-01");
      expect(loc2Res.body.data.warehouseId).toBe(wh2Id);
    });

    it("should reject creating a storage location in an INACTIVE warehouse with 400 Bad Request", async () => {
      // 1. Deactivate warehouse
      await request(app)
        .delete(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      // 2. Attempt to add location to inactive warehouse
      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "BIN-INACTIVE-WH", name: "Bin In Inactive WH" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain("inactive warehouse");
    });

    it("should reject activating a storage location if parent warehouse is INACTIVE", async () => {
      // 1. Create location while active
      const locRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "BIN-TEST-ACTIVATE", name: "Bin To Test" });

      const locId = locRes.body.data.id;

      // 2. Deactivate warehouse (cascades to location)
      await request(app)
        .delete(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      // 3. Attempt to reactivate location while warehouse is inactive
      const patchRes = await request(app)
        .patch(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations/${locId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: "ACTIVE" });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.success).toBe(false);
      expect(patchRes.body.error.message).toContain("inactive warehouse");
    });

    it("should cascade deactivation to all storage locations when warehouse is deactivated", async () => {
      // 1. Create two locations
      const loc1 = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "CASCADE-LOC-1", name: "Loc 1" });

      const loc2 = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "CASCADE-LOC-2", name: "Loc 2" });

      const loc1Id = loc1.body.data.id;
      const loc2Id = loc2.body.data.id;

      expect(loc1.body.data.status).toBe("ACTIVE");
      expect(loc2.body.data.status).toBe("ACTIVE");

      // 2. Deactivate warehouse
      const deactWhRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(deactWhRes.status).toBe(200);
      expect(deactWhRes.body.data.status).toBe("INACTIVE");

      // 3. Verify both locations were cascaded to INACTIVE
      const getLoc1 = await request(app)
        .get(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations/${loc1Id}`)
        .set("Authorization", `Bearer ${memberToken}`);

      const getLoc2 = await request(app)
        .get(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations/${loc2Id}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(getLoc1.body.data.status).toBe("INACTIVE");
      expect(getLoc2.body.data.status).toBe("INACTIVE");
    });

    it("should reject cross-warehouse and cross-tenant access with 404 Not Found (anti-IDOR)", async () => {
      const locRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "ISOLATION-LOC", name: "Isolated Location" });

      const locId = locRes.body.data.id;
      const fakeWarehouseId = randomUUID();

      // Accessing with mismatched warehouse ID
      const crossWhRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/warehouses/${fakeWarehouseId}/locations/${locId}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(crossWhRes.status).toBe(404);

      // Accessing with mismatched organization ID
      const crossOrgRes = await request(app)
        .get(`/api/v1/organizations/${otherOrgId}/warehouses/${warehouseId}/locations/${locId}`)
        .set("Authorization", `Bearer ${externalToken}`);

      expect(crossOrgRes.status).toBe(404);
    });

    it("should allow soft-deactivating an individual location", async () => {
      const locRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ code: "DEACTIVATE-SINGLE", name: "Single Loc" });

      const locId = locRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}/locations/${locId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.status).toBe("INACTIVE");

      // Verify warehouse remains ACTIVE
      const whRes = await request(app)
        .get(`/api/v1/organizations/${orgId}/warehouses/${warehouseId}`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(whRes.body.data.status).toBe("ACTIVE");
    });
  });
});
