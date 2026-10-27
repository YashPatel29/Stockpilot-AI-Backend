import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { OrganizationRole, Prisma } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";
import { PurchaseOrderStatus } from "../../src/modules/procurement/purchase-orders/purchase-order.types";

describe("Feature 7: Suppliers and Purchase Orders (Integration)", () => {
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
    name: "Alpha Logistics Corp",
    slug: "alpha-logistics-corp",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleWarehouse = {
    id: "550e8400-e29b-41d4-a716-446655440201",
    organizationId: orgId,
    code: "WH-MAIN",
    name: "Central Warehouse",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleLocation = {
    id: "550e8400-e29b-41d4-a716-446655440301",
    organizationId: orgId,
    warehouseId: sampleWarehouse.id,
    code: "A-01",
    name: "Bay A1",
    status: "ACTIVE",
    warehouse: sampleWarehouse,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  const sampleProduct1 = {
    id: "550e8400-e29b-41d4-a716-446655440101",
    organizationId: orgId,
    sku: "PROD-STEEL-01",
    name: "Industrial Steel Bolt",
    status: "ACTIVE",
  };

  const sampleProduct2 = {
    id: "550e8400-e29b-41d4-a716-446655440102",
    organizationId: orgId,
    sku: "PROD-BRASS-02",
    name: "Heavy Brass Nut",
    status: "ACTIVE",
  };

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let externalToken: string;

  interface SupplierRecord {
    id: string;
    organizationId: string;
    name: string;
    code: string | null;
    email: string | null;
    phone: string | null;
    contactPerson: string | null;
    address: string | null;
    taxIdentifier: string | null;
    notes: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }

  interface POItemRecord {
    id: string;
    purchaseOrderId: string;
    productId: string;
    quantityOrdered: Prisma.Decimal;
    quantityReceived: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    product?: typeof sampleProduct1;
  }

  interface PORecord {
    id: string;
    organizationId: string;
    supplierId: string;
    orderNumber: string;
    status: PurchaseOrderStatus;
    orderDate: Date;
    expectedDeliveryDate: Date | null;
    currency: string;
    subtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    notes: string | null;
    createdByUserId: string;
    approvedByUserId: string | null;
    approvedAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    supplier?: SupplierRecord;
    createdByUser?: typeof ownerUser;
    approvedByUser?: typeof adminUser | null;
    items?: POItemRecord[];
    receipts?: Array<Record<string, unknown>>;
  }

  let suppliersStore: SupplierRecord[] = [];
  let poStore: PORecord[] = [];
  let poItemsStore: POItemRecord[] = [];
  let poReceiptsStore: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    suppliersStore = [];
    poStore = [];
    poItemsStore = [];
    poReceiptsStore = [];

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
        });
      }

      return Promise.resolve(null);
    }) as never);

    // Mock prisma.$transaction
    vi.spyOn(prisma, "$transaction").mockImplementation(((action: unknown) => {
      if (typeof action === "function") {
        return (action as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(action as Array<Promise<unknown>>);
    }) as never);

    // Mock products
    vi.spyOn(prisma.product, "findMany").mockImplementation(((args: {
      where: { id: { in: string[] }; organizationId: string };
    }) => {
      const ids = args.where.id.in;
      const found = [sampleProduct1, sampleProduct2].filter(
        (p) => ids.includes(p.id) && p.organizationId === args.where.organizationId,
      );
      return Promise.resolve(found);
    }) as never);

    // Mock storage location & warehouse
    vi.spyOn(prisma.storageLocation, "findFirst").mockImplementation(((args: {
      where: { id: string; organizationId: string };
    }) => {
      if (args.where.id === sampleLocation.id && args.where.organizationId === orgId) {
        return Promise.resolve(sampleLocation);
      }
      return Promise.resolve(null);
    }) as never);

    // Mock inventory balances & transactions
    vi.spyOn(prisma.inventoryBalance, "upsert").mockResolvedValue({} as never);
    vi.spyOn(prisma.inventoryTransaction, "create").mockResolvedValue({} as never);

    // Mock Suppliers
    vi.spyOn(prisma.supplier, "findUnique").mockImplementation(((args: {
      where: { organizationId_code?: { organizationId: string; code: string } };
    }) => {
      if (args.where.organizationId_code) {
        const { organizationId, code } = args.where.organizationId_code;
        const match = suppliersStore.find(
          (s) => s.organizationId === organizationId && s.code === code,
        );
        return Promise.resolve(match || null);
      }
      return Promise.resolve(null);
    }) as never);

    vi.spyOn(prisma.supplier, "findFirst").mockImplementation(((args: {
      where: { id?: string; organizationId?: string };
    }) => {
      const match = suppliersStore.find((s) => {
        if (args.where.id && s.id !== args.where.id) return false;
        if (args.where.organizationId && s.organizationId !== args.where.organizationId)
          return false;
        return true;
      });
      return Promise.resolve(match || null);
    }) as never);

    vi.spyOn(prisma.supplier, "count").mockImplementation(((args: {
      where: { organizationId: string };
    }) => {
      const count = suppliersStore.filter(
        (s) => s.organizationId === args.where.organizationId,
      ).length;
      return Promise.resolve(count);
    }) as never);

    vi.spyOn(prisma.supplier, "findMany").mockImplementation(((args: {
      where: { organizationId: string };
    }) => {
      const matches = suppliersStore.filter((s) => s.organizationId === args.where.organizationId);
      return Promise.resolve(matches);
    }) as never);

    vi.spyOn(prisma.supplier, "create").mockImplementation(((args: {
      data: Omit<SupplierRecord, "id" | "createdAt" | "updatedAt">;
    }) => {
      const record: SupplierRecord = {
        id: randomUUID(),
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      suppliersStore.push(record);
      return Promise.resolve(record);
    }) as never);

    vi.spyOn(prisma.supplier, "update").mockImplementation(((args: {
      where: { id: string };
      data: Partial<SupplierRecord>;
    }) => {
      const idx = suppliersStore.findIndex((s) => s.id === args.where.id);
      if (idx === -1) throw new Error("Not found");
      suppliersStore[idx] = {
        ...suppliersStore[idx]!,
        ...args.data,
        updatedAt: new Date(),
      };
      return Promise.resolve(suppliersStore[idx]);
    }) as never);

    // Mock Purchase Orders
    vi.spyOn(prisma.purchaseOrder, "findFirst").mockImplementation(((args: {
      where: { id?: string; organizationId?: string };
    }) => {
      const po = poStore.find((p) => {
        if (args.where.id && p.id !== args.where.id) return false;
        if (args.where.organizationId && p.organizationId !== args.where.organizationId)
          return false;
        return true;
      });
      if (!po) return Promise.resolve(null);

      const items = poItemsStore
        .filter((i) => i.purchaseOrderId === po.id)
        .map((i) => ({
          ...i,
          product: [sampleProduct1, sampleProduct2].find((p) => p.id === i.productId),
        }));
      const receipts = poReceiptsStore.filter((r) => r["purchaseOrderId"] === po.id);
      const supplier = suppliersStore.find((s) => s.id === po.supplierId);

      return Promise.resolve({
        ...po,
        items,
        receipts,
        supplier,
        createdByUser: ownerUser,
        approvedByUser: po.approvedByUserId ? adminUser : null,
      });
    }) as never);

    vi.spyOn(prisma.purchaseOrder, "findUniqueOrThrow").mockImplementation(((args: {
      where: { id: string };
    }) => {
      const po = poStore.find((p) => p.id === args.where.id);
      if (!po) throw new Error("Not found");

      const items = poItemsStore
        .filter((i) => i.purchaseOrderId === po.id)
        .map((i) => ({
          ...i,
          product: [sampleProduct1, sampleProduct2].find((p) => p.id === i.productId),
        }));
      const receipts = poReceiptsStore.filter((r) => r["purchaseOrderId"] === po.id);
      const supplier = suppliersStore.find((s) => s.id === po.supplierId);

      return Promise.resolve({
        ...po,
        items,
        receipts,
        supplier,
        createdByUser: ownerUser,
        approvedByUser: po.approvedByUserId ? adminUser : null,
      });
    }) as never);

    vi.spyOn(prisma.purchaseOrder, "count").mockImplementation(((args: {
      where: { organizationId: string };
    }) => {
      const count = poStore.filter((p) => p.organizationId === args.where.organizationId).length;
      return Promise.resolve(count);
    }) as never);

    vi.spyOn(prisma.purchaseOrder, "findMany").mockImplementation(((args: {
      where: { organizationId: string };
    }) => {
      const matches = poStore
        .filter((p) => p.organizationId === args.where.organizationId)
        .map((po) => ({
          ...po,
          supplier: suppliersStore.find((s) => s.id === po.supplierId),
          createdByUser: ownerUser,
          approvedByUser: po.approvedByUserId ? adminUser : null,
          items: poItemsStore.filter((i) => i.purchaseOrderId === po.id),
        }));
      return Promise.resolve(matches);
    }) as never);

    vi.spyOn(prisma.purchaseOrder, "create").mockImplementation(((args: {
      data: {
        organizationId: string;
        supplierId: string;
        orderNumber: string;
        status: PurchaseOrderStatus;
        orderDate: Date;
        expectedDeliveryDate: Date | null;
        currency: string;
        subtotal: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
        notes: string | null;
        createdByUserId: string;
        items: {
          create: Array<{
            productId: string;
            quantityOrdered: Prisma.Decimal;
            quantityReceived: Prisma.Decimal;
            unitCost: Prisma.Decimal;
            lineTotal: Prisma.Decimal;
          }>;
        };
      };
    }) => {
      const poIdGen = randomUUID();
      const poRecord: PORecord = {
        id: poIdGen,
        organizationId: args.data.organizationId,
        supplierId: args.data.supplierId,
        orderNumber: args.data.orderNumber,
        status: args.data.status,
        orderDate: args.data.orderDate,
        expectedDeliveryDate: args.data.expectedDeliveryDate,
        currency: args.data.currency,
        subtotal: args.data.subtotal,
        taxAmount: args.data.taxAmount,
        totalAmount: args.data.totalAmount,
        notes: args.data.notes,
        createdByUserId: args.data.createdByUserId,
        approvedByUserId: null,
        approvedAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      poStore.push(poRecord);

      for (const item of args.data.items.create) {
        poItemsStore.push({
          id: randomUUID(),
          purchaseOrderId: poIdGen,
          productId: item.productId,
          quantityOrdered: item.quantityOrdered,
          quantityReceived: item.quantityReceived,
          unitCost: item.unitCost,
          lineTotal: item.lineTotal,
          createdAt: new Date(),
          updatedAt: new Date(),
          product: [sampleProduct1, sampleProduct2].find((p) => p.id === item.productId),
        });
      }

      return Promise.resolve({
        ...poRecord,
        supplier: suppliersStore.find((s) => s.id === poRecord.supplierId),
        createdByUser: ownerUser,
        items: poItemsStore
          .filter((i) => i.purchaseOrderId === poIdGen)
          .map((i) => ({
            ...i,
            product: [sampleProduct1, sampleProduct2].find((p) => p.id === i.productId),
          })),
      });
    }) as never);

    vi.spyOn(prisma.purchaseOrder, "update").mockImplementation(((args: {
      where: { id: string };
      data: Partial<PORecord>;
    }) => {
      const idx = poStore.findIndex((p) => p.id === args.where.id);
      if (idx === -1) throw new Error("Not found");
      poStore[idx] = {
        ...poStore[idx]!,
        ...args.data,
        updatedAt: new Date(),
      };
      return Promise.resolve({
        ...poStore[idx],
        supplier: suppliersStore.find((s) => s.id === poStore[idx]!.supplierId),
        createdByUser: ownerUser,
        approvedByUser: poStore[idx]!.approvedByUserId ? adminUser : null,
        items: poItemsStore.filter((i) => i.purchaseOrderId === poStore[idx]!.id),
      });
    }) as never);

    vi.spyOn(prisma.purchaseOrderItem, "update").mockImplementation(((args: {
      where: { id: string };
      data: { quantityReceived: { increment: Prisma.Decimal } };
    }) => {
      const idx = poItemsStore.findIndex((i) => i.id === args.where.id);
      if (idx === -1) throw new Error("Not found");
      const current = new Prisma.Decimal(poItemsStore[idx]!.quantityReceived);
      const inc = new Prisma.Decimal(args.data.quantityReceived.increment);
      poItemsStore[idx]!.quantityReceived = current.add(inc);
      return Promise.resolve(poItemsStore[idx]);
    }) as never);

    vi.spyOn(prisma.purchaseOrderReceipt, "findUnique").mockImplementation(((args: {
      where: { organizationId_idempotencyKey?: { organizationId: string; idempotencyKey: string } };
    }) => {
      if (args.where.organizationId_idempotencyKey) {
        const { organizationId, idempotencyKey } = args.where.organizationId_idempotencyKey;
        const match = poReceiptsStore.find(
          (r) => r["organizationId"] === organizationId && r["idempotencyKey"] === idempotencyKey,
        );
        return Promise.resolve(match || null);
      }
      return Promise.resolve(null);
    }) as never);

    vi.spyOn(prisma.purchaseOrderReceipt, "create").mockImplementation(((args: {
      data: Record<string, unknown>;
    }) => {
      const receipt = {
        id: randomUUID(),
        ...args.data,
        createdAt: new Date(),
        location: sampleLocation,
        receivedByUser: ownerUser,
      };
      poReceiptsStore.push(receipt);
      return Promise.resolve(receipt);
    }) as never);
  });

  describe("Supplier Management Endpoints", () => {
    it("POST /suppliers should create supplier as OWNER (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/suppliers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: " Global Metal Supplies ",
          code: " sup-metal-01 ",
          email: " orders@metal.com ",
          phone: "+1-555-1234",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Global Metal Supplies");
      expect(res.body.data.code).toBe("SUP-METAL-01");
      expect(res.body.data.isActive).toBe(true);
    });

    it("POST /suppliers should reject MEMBER with 403 Forbidden", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/suppliers`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({
          name: "Unauthorized Vendor",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("POST /suppliers should reject external user belonging to another organization with 404 Not Found (anti-enumeration)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/suppliers`)
        .set("Authorization", `Bearer ${externalToken}`)
        .send({
          name: "External Vendor",
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("POST /suppliers should reject duplicate supplier code with 409 Conflict", async () => {
      suppliersStore.push({
        id: randomUUID(),
        organizationId: orgId,
        name: "Existing Vendor",
        code: "SUP-EXISTS",
        email: null,
        phone: null,
        contactPerson: null,
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/suppliers`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Another Vendor",
          code: "sup-exists",
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("already exists");
    });

    it("GET /suppliers should allow MEMBER to list suppliers (200)", async () => {
      suppliersStore.push({
        id: randomUUID(),
        organizationId: orgId,
        name: "Acme Fasteners",
        code: "SUP-ACME",
        email: null,
        phone: null,
        contactPerson: null,
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/suppliers`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.totalItems).toBe(1);
    });

    it("GET /suppliers/:supplierId should return 404 for cross-tenant request (anti-IDOR)", async () => {
      const supplierId = randomUUID();
      suppliersStore.push({
        id: supplierId,
        organizationId: otherOrgId, // Belongs to otherOrgId
        name: "Secret Foreign Supplier",
        code: "SUP-SECRET",
        email: null,
        phone: null,
        contactPerson: null,
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/suppliers/${supplierId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("DELETE /suppliers/:supplierId should soft-deactivate supplier (200, isActive: false)", async () => {
      const supplierId = randomUUID();
      suppliersStore.push({
        id: supplierId,
        organizationId: orgId,
        name: "Decommissioning Vendor",
        code: "SUP-DECOM",
        email: null,
        phone: null,
        contactPerson: null,
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .delete(`/api/v1/organizations/${orgId}/suppliers/${supplierId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);
    });
  });

  describe("Purchase Order Workflow & Delivery Endpoints", () => {
    let testSupplierId: string;

    beforeEach(() => {
      testSupplierId = randomUUID();
      suppliersStore.push({
        id: testSupplierId,
        organizationId: orgId,
        name: "Prime Materials",
        code: "SUP-PRIME",
        email: "orders@prime.com",
        phone: null,
        contactPerson: null,
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("POST /purchase-orders should create DRAFT purchase order with calculated totals (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          supplierId: testSupplierId,
          currency: "USD",
          taxAmount: 50,
          notes: "Initial inventory batch",
          items: [
            { productId: sampleProduct1.id, quantityOrdered: 100, unitCost: 10 },
            { productId: sampleProduct2.id, quantityOrdered: 50, unitCost: 20 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(PurchaseOrderStatus.DRAFT);
      expect(res.body.data.subtotal).toBe("2000.0000"); // 100*10 + 50*20 = 2000
      expect(res.body.data.taxAmount).toBe("50.0000");
      expect(res.body.data.totalAmount).toBe("2050.0000");
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.orderNumber).toMatch(/^PO-\d{8}-[A-Z0-9]{4}$/);
    });

    it("POST /purchase-orders should reject duplicate line items for same product with 422", async () => {
      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          supplierId: testSupplierId,
          items: [
            { productId: sampleProduct1.id, quantityOrdered: 10, unitCost: 5 },
            { productId: sampleProduct1.id, quantityOrdered: 20, unitCost: 5 },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.error.details)).toContain("Duplicate product");
    });

    it("POST /purchase-orders should reject creation for inactive supplier with 400", async () => {
      const inactiveSupplierId = randomUUID();
      suppliersStore.push({
        id: inactiveSupplierId,
        organizationId: orgId,
        name: "Inactive Vendor",
        code: "SUP-INACT",
        email: null,
        phone: null,
        contactPerson: null,
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          supplierId: inactiveSupplierId,
          items: [{ productId: sampleProduct1.id, quantityOrdered: 10, unitCost: 5 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("inactive supplier");
    });

    it("Full Lifecycle: DRAFT -> SUBMIT -> APPROVE -> PARTIAL RECEIPT -> FULL RECEIPT", async () => {
      // 1. Create DRAFT order
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          supplierId: testSupplierId,
          currency: "USD",
          items: [{ productId: sampleProduct1.id, quantityOrdered: 100, unitCost: 15 }],
        });

      expect(createRes.status).toBe(201);
      const poId = createRes.body.data.id as string;
      expect(createRes.body.data.status).toBe(PurchaseOrderStatus.DRAFT);

      // 2. Submit order for approval
      const submitRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/submit`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.status).toBe(PurchaseOrderStatus.PENDING_APPROVAL);

      // 3. Approve order
      const approveRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe(PurchaseOrderStatus.APPROVED);

      // 4. Record partial delivery (receive 40 of 100)
      const partialRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          locationId: sampleLocation.id,
          reference: "SHIPMENT-PART-01",
          items: [{ productId: sampleProduct1.id, quantity: 40 }],
        });

      expect(partialRes.status).toBe(200);
      expect(partialRes.body.data.status).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
      expect(partialRes.body.data.items[0].quantityReceived).toBe("40.0000");
      expect(partialRes.body.data.items[0].quantityOutstanding).toBe("60.0000");

      // 5. Attempt over-delivery: receiving 70 when only 60 outstanding
      const overReceiveRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          locationId: sampleLocation.id,
          items: [{ productId: sampleProduct1.id, quantity: 70 }],
        });

      expect(overReceiveRes.status).toBe(400);
      expect(overReceiveRes.body.error.message).toContain("exceeds outstanding quantity");

      // 6. Record remaining delivery (receive 60)
      const completeRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/receipts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          locationId: sampleLocation.id,
          reference: "SHIPMENT-PART-02",
          items: [{ productId: sampleProduct1.id, quantity: 60 }],
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.status).toBe(PurchaseOrderStatus.RECEIVED);
      expect(completeRes.body.data.items[0].quantityReceived).toBe("100.0000");
      expect(completeRes.body.data.items[0].quantityOutstanding).toBe("0.0000");
    });

    it("Cancellation: should cancel eligible APPROVED order with zero receipts", async () => {
      // 1. Create and approve order
      const createRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          supplierId: testSupplierId,
          items: [{ productId: sampleProduct1.id, quantityOrdered: 50, unitCost: 10 }],
        });

      const poId = createRes.body.data.id as string;

      await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/submit`)
        .set("Authorization", `Bearer ${adminToken}`);

      await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      // 2. Cancel order
      const cancelRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/purchase-orders/${poId}/cancel`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe(PurchaseOrderStatus.CANCELLED);
    });
  });
});
