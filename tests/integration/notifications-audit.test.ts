import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { NotificationType, OrganizationRole } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { signAccessToken } from "../../src/common/utils/token.util";
import { AuditAction, AuditResourceType } from "../../src/modules/audit/audit.types";

describe("Feature 9: Notifications and Audit Logs (Integration)", () => {
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

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let externalToken: string;

  interface NotificationRecord {
    id: string;
    organizationId: string | null;
    recipientUserId: string;
    type: NotificationType;
    title: string;
    message: string;
    data: Record<string, unknown> | null;
    readAt: Date | null;
    createdAt: Date;
  }

  interface AuditLogRecord {
    id: string;
    organizationId: string | null;
    actorUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata: Record<string, unknown> | null;
    requestId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    actorUser?: {
      id: string;
      name: string;
      email: string;
    } | null;
  }

  let notificationsStore: NotificationRecord[] = [];
  let auditLogsStore: AuditLogRecord[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    notificationsStore = [];
    auditLogsStore = [];

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

      return Promise.resolve(null);
    }) as never);

    // Notification mock operations
    vi.spyOn(prisma.notification, "count").mockImplementation(((args?: {
      where?: {
        recipientUserId?: string;
        readAt?: null;
        organizationId?: string;
        type?: NotificationType;
      };
    }) => {
      let filtered = [...notificationsStore];
      if (args?.where?.recipientUserId) {
        filtered = filtered.filter((n) => n.recipientUserId === args.where!.recipientUserId);
      }
      if (args?.where?.readAt === null) {
        filtered = filtered.filter((n) => n.readAt === null);
      }
      if (args?.where?.organizationId) {
        filtered = filtered.filter((n) => n.organizationId === args.where!.organizationId);
      }
      if (args?.where?.type) {
        filtered = filtered.filter((n) => n.type === args.where!.type);
      }
      return Promise.resolve(filtered.length);
    }) as never);

    vi.spyOn(prisma.notification, "findMany").mockImplementation(((args?: {
      where?: {
        recipientUserId?: string;
        readAt?: null;
        organizationId?: string;
        type?: NotificationType;
      };
      skip?: number;
      take?: number;
    }) => {
      let filtered = [...notificationsStore];
      if (args?.where?.recipientUserId) {
        filtered = filtered.filter((n) => n.recipientUserId === args.where!.recipientUserId);
      }
      if (args?.where?.readAt === null) {
        filtered = filtered.filter((n) => n.readAt === null);
      }
      if (args?.where?.organizationId) {
        filtered = filtered.filter((n) => n.organizationId === args.where!.organizationId);
      }
      if (args?.where?.type) {
        filtered = filtered.filter((n) => n.type === args.where!.type);
      }
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const skip = args?.skip ?? 0;
      const take = args?.take ?? 20;
      return Promise.resolve(filtered.slice(skip, skip + take));
    }) as never);

    vi.spyOn(prisma.notification, "findFirst").mockImplementation(((args: {
      where: { id: string; recipientUserId: string };
    }) => {
      const match = notificationsStore.find(
        (n) => n.id === args.where.id && n.recipientUserId === args.where.recipientUserId,
      );
      return Promise.resolve(match ?? null);
    }) as never);

    vi.spyOn(prisma.notification, "update").mockImplementation(((args: {
      where: { id: string };
      data: { readAt: Date };
    }) => {
      const idx = notificationsStore.findIndex((n) => n.id === args.where.id);
      if (idx !== -1) {
        notificationsStore[idx] = {
          ...notificationsStore[idx]!,
          readAt: args.data.readAt,
        };
        return Promise.resolve(notificationsStore[idx]);
      }
      return Promise.reject(new Error("Record not found"));
    }) as never);

    vi.spyOn(prisma.notification, "updateMany").mockImplementation(((args: {
      where: { recipientUserId: string; readAt?: null; organizationId?: string };
      data: { readAt: Date };
    }) => {
      let count = 0;
      for (const n of notificationsStore) {
        if (
          n.recipientUserId === args.where.recipientUserId &&
          n.readAt === null &&
          (!args.where.organizationId || n.organizationId === args.where.organizationId)
        ) {
          n.readAt = args.data.readAt;
          count++;
        }
      }
      return Promise.resolve({ count });
    }) as never);

    // Audit log mock operations
    vi.spyOn(prisma.auditLog, "count").mockImplementation(((args?: {
      where?: {
        organizationId?: string;
        action?: { contains: string; mode: string };
        resourceType?: { equals: string; mode: string };
        resourceId?: string;
        actorUserId?: string;
      };
    }) => {
      let filtered = [...auditLogsStore];
      if (args?.where?.organizationId) {
        filtered = filtered.filter((l) => l.organizationId === args.where!.organizationId);
      }
      if (args?.where?.action?.contains) {
        const needle = args.where.action.contains.toLowerCase();
        filtered = filtered.filter((l) => l.action.toLowerCase().includes(needle));
      }
      if (args?.where?.resourceType?.equals) {
        const needle = args.where.resourceType.equals.toLowerCase();
        filtered = filtered.filter((l) => l.resourceType.toLowerCase() === needle);
      }
      if (args?.where?.resourceId) {
        filtered = filtered.filter((l) => l.resourceId === args.where!.resourceId);
      }
      if (args?.where?.actorUserId) {
        filtered = filtered.filter((l) => l.actorUserId === args.where!.actorUserId);
      }
      return Promise.resolve(filtered.length);
    }) as never);

    vi.spyOn(prisma.auditLog, "findMany").mockImplementation(((args?: {
      where?: {
        organizationId?: string;
        action?: { contains: string; mode: string };
        resourceType?: { equals: string; mode: string };
        resourceId?: string;
        actorUserId?: string;
      };
      skip?: number;
      take?: number;
    }) => {
      let filtered = [...auditLogsStore];
      if (args?.where?.organizationId) {
        filtered = filtered.filter((l) => l.organizationId === args.where!.organizationId);
      }
      if (args?.where?.action?.contains) {
        const needle = args.where.action.contains.toLowerCase();
        filtered = filtered.filter((l) => l.action.toLowerCase().includes(needle));
      }
      if (args?.where?.resourceType?.equals) {
        const needle = args.where.resourceType.equals.toLowerCase();
        filtered = filtered.filter((l) => l.resourceType.toLowerCase() === needle);
      }
      if (args?.where?.resourceId) {
        filtered = filtered.filter((l) => l.resourceId === args.where!.resourceId);
      }
      if (args?.where?.actorUserId) {
        filtered = filtered.filter((l) => l.actorUserId === args.where!.actorUserId);
      }
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const skip = args?.skip ?? 0;
      const take = args?.take ?? 20;
      return Promise.resolve(filtered.slice(skip, skip + take));
    }) as never);
  });

  describe("Notifications Subsystem", () => {
    beforeEach(() => {
      // Seed notifications for owner and admin
      notificationsStore.push(
        {
          id: "550e8400-e29b-41d4-a716-446655440111",
          organizationId: orgId,
          recipientUserId: ownerUser.id,
          type: NotificationType.PURCHASE_ORDER_SUBMITTED,
          title: "PO Submitted",
          message: "Purchase order PO-001 submitted",
          data: { orderNumber: "PO-001" },
          readAt: null,
          createdAt: new Date("2026-02-01T10:00:00Z"),
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440112",
          organizationId: orgId,
          recipientUserId: ownerUser.id,
          type: NotificationType.LOW_STOCK_ALERT,
          title: "Low Stock Alert",
          message: "Product Widget low",
          data: { sku: "WIDGET-01" },
          readAt: new Date("2026-02-01T11:00:00Z"),
          createdAt: new Date("2026-02-01T09:00:00Z"),
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440222",
          organizationId: orgId,
          recipientUserId: adminUser.id,
          type: NotificationType.ROLE_UPDATED,
          title: "Role Updated",
          message: "Your role was changed",
          data: null,
          readAt: null,
          createdAt: new Date("2026-02-01T12:00:00Z"),
        },
      );
    });

    it("GET /api/v1/notifications - should return only authenticated user's notifications", async () => {
      const res = await request(app)
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);

      // Verify User B's notification is not present (Anti-leakage)
      const ids = res.body.data.notifications.map((n: { id: string }) => n.id);
      expect(ids).not.toContain("550e8400-e29b-41d4-a716-446655440222");
    });

    it("GET /api/v1/notifications?unreadOnly=true - should filter unread notifications only", async () => {
      const res = await request(app)
        .get("/api/v1/notifications?unreadOnly=true")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.notifications).toHaveLength(1);
      expect(res.body.data.notifications[0].id).toBe("550e8400-e29b-41d4-a716-446655440111");
    });

    it("GET /api/v1/notifications/unread-count - should return user unread count", async () => {
      const res = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(1);
    });

    it("PATCH /api/v1/notifications/:id/read - should mark notification as read", async () => {
      const res = await request(app)
        .patch("/api/v1/notifications/550e8400-e29b-41d4-a716-446655440111/read")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.readAt).not.toBeNull();

      // Idempotent second call
      const res2 = await request(app)
        .patch("/api/v1/notifications/550e8400-e29b-41d4-a716-446655440111/read")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res2.status).toBe(200);
    });

    it("PATCH /api/v1/notifications/:id/read - should reject marking another user's notification (Anti-IDOR)", async () => {
      const res = await request(app)
        .patch("/api/v1/notifications/550e8400-e29b-41d4-a716-446655440222/read")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("PATCH /api/v1/notifications/read-all - should bulk mark all user unread notifications as read", async () => {
      const res = await request(app)
        .patch("/api/v1/notifications/read-all")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedCount).toBe(1);

      // Verify Admin's unread notification was untouched
      const adminNotif = notificationsStore.find(
        (n) => n.id === "550e8400-e29b-41d4-a716-446655440222",
      );
      expect(adminNotif?.readAt).toBeNull();
    });
  });

  describe("Audit Logs Subsystem", () => {
    beforeEach(() => {
      auditLogsStore.push(
        {
          id: "550e8400-e29b-41d4-a716-446655440801",
          organizationId: orgId,
          actorUserId: ownerUser.id,
          action: AuditAction.PRODUCT_CREATED,
          resourceType: AuditResourceType.PRODUCT,
          resourceId: "prod-1",
          metadata: { sku: "SKU-01", name: "Steel Bolt" },
          requestId: "req-1",
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0",
          createdAt: new Date("2026-02-01T10:00:00Z"),
          actorUser: { id: ownerUser.id, name: ownerUser.name, email: ownerUser.email },
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440802",
          organizationId: orgId,
          actorUserId: adminUser.id,
          action: AuditAction.INVENTORY_RECEIVED,
          resourceType: AuditResourceType.INVENTORY_TRANSACTION,
          resourceId: "tx-1",
          metadata: { quantity: "50.0000" },
          requestId: "req-2",
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0",
          createdAt: new Date("2026-02-01T11:00:00Z"),
          actorUser: { id: adminUser.id, name: adminUser.name, email: adminUser.email },
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440803",
          organizationId: otherOrgId,
          actorUserId: "other-user",
          action: AuditAction.PRODUCT_CREATED,
          resourceType: AuditResourceType.PRODUCT,
          resourceId: "prod-other",
          metadata: { sku: "OTHER-SKU" },
          requestId: "req-3",
          ipAddress: null,
          userAgent: null,
          createdAt: new Date("2026-02-01T12:00:00Z"),
          actorUser: null,
        },
      );
    });

    it("GET /api/v1/organizations/:id/audit-logs - should allow OWNER to list audit logs", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/audit-logs`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.auditLogs).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);

      // Verify cross-tenant isolation: other org record is excluded
      const ids = res.body.data.auditLogs.map((l: { id: string }) => l.id);
      expect(ids).not.toContain("550e8400-e29b-41d4-a716-446655440803");
    });

    it("GET /api/v1/organizations/:id/audit-logs - should allow ADMIN to list audit logs", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/audit-logs`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.auditLogs).toHaveLength(2);
    });

    it("GET /api/v1/organizations/:id/audit-logs - should reject MEMBER with 403 Forbidden", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/audit-logs`)
        .set("Authorization", `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("GET /api/v1/organizations/:id/audit-logs - should reject non-member with 404 (Anti-IDOR)", async () => {
      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/audit-logs`)
        .set("Authorization", `Bearer ${externalToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/organizations/:id/audit-logs - should filter by action and resourceType", async () => {
      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/audit-logs?action=inventory.received&resourceType=InventoryTransaction`,
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.auditLogs).toHaveLength(1);
      expect(res.body.data.auditLogs[0].action).toBe(AuditAction.INVENTORY_RECEIVED);
    });

    it("Immutable Audit Guarantee - should return 404 for client write endpoints", async () => {
      const postRes = await request(app)
        .post(`/api/v1/organizations/${orgId}/audit-logs`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ action: "fake.action" });
      expect(postRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete(`/api/v1/organizations/${orgId}/audit-logs/550e8400-e29b-41d4-a716-446655440801`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(deleteRes.status).toBe(404);
    });
  });
});
