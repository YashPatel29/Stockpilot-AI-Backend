import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationType, OrganizationRole, type PrismaClient } from "@prisma/client";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { NotFoundError } from "../../src/common/errors/http-errors";

describe("NotificationService (Unit)", () => {
  let mockPrisma: {
    notification: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    organizationMembership: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  let service: NotificationService;

  const userId = "550e8400-e29b-41d4-a716-446655440001";
  const otherUserId = "550e8400-e29b-41d4-a716-446655440002";
  const orgId = "550e8400-e29b-41d4-a716-446655440010";
  const notificationId = "550e8400-e29b-41d4-a716-446655440100";

  beforeEach(() => {
    mockPrisma = {
      notification: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      organizationMembership: {
        findMany: vi.fn(),
      },
    };

    service = new NotificationService(mockPrisma as unknown as PrismaClient);
  });

  describe("createNotification", () => {
    it("should create and sanitize a notification record", async () => {
      const now = new Date();
      mockPrisma.notification.create.mockResolvedValueOnce({
        id: notificationId,
        organizationId: orgId,
        recipientUserId: userId,
        type: NotificationType.INFO,
        title: "Test Title",
        message: "Test Message",
        data: { role: "ADMIN", token: "[REDACTED]" },
        readAt: null,
        createdAt: now,
      });

      const result = await service.createNotification({
        organizationId: orgId,
        recipientUserId: userId,
        title: "Test Title",
        message: "Test Message",
        data: { role: "ADMIN", token: "secret-token-123" },
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          recipientUserId: userId,
          title: "Test Title",
          message: "Test Message",
          data: { role: "ADMIN", token: "[REDACTED]" },
        }),
      });

      expect(result).toEqual({
        id: notificationId,
        organizationId: orgId,
        recipientUserId: userId,
        type: NotificationType.INFO,
        title: "Test Title",
        message: "Test Message",
        data: { role: "ADMIN", token: "[REDACTED]" },
        readAt: null,
        createdAt: now.toISOString(),
      });
    });
  });

  describe("listNotifications", () => {
    it("should return paginated notifications for the recipient", async () => {
      const now = new Date();
      mockPrisma.notification.count.mockResolvedValueOnce(1);
      mockPrisma.notification.findMany.mockResolvedValueOnce([
        {
          id: notificationId,
          organizationId: orgId,
          recipientUserId: userId,
          type: NotificationType.LOW_STOCK_ALERT,
          title: "Low Stock Alert",
          message: "Product low",
          data: null,
          readAt: null,
          createdAt: now,
        },
      ]);

      const result = await service.listNotifications(userId, {
        page: 1,
        limit: 20,
        unreadOnly: true,
      });

      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          recipientUserId: userId,
          readAt: null,
        },
      });

      expect(result.notifications).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe("getUnreadCount", () => {
    it("should return correct count of unread notifications", async () => {
      mockPrisma.notification.count.mockResolvedValueOnce(5);

      const result = await service.getUnreadCount(userId, orgId);

      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          recipientUserId: userId,
          readAt: null,
          organizationId: orgId,
        },
      });

      expect(result).toEqual({ count: 5 });
    });
  });

  describe("markAsRead", () => {
    it("should mark an unread notification as read", async () => {
      const now = new Date();
      mockPrisma.notification.findFirst.mockResolvedValueOnce({
        id: notificationId,
        organizationId: orgId,
        recipientUserId: userId,
        type: NotificationType.INFO,
        title: "Info",
        message: "Message",
        data: null,
        readAt: null,
        createdAt: now,
      });

      mockPrisma.notification.update.mockResolvedValueOnce({
        id: notificationId,
        organizationId: orgId,
        recipientUserId: userId,
        type: NotificationType.INFO,
        title: "Info",
        message: "Message",
        data: null,
        readAt: now,
        createdAt: now,
      });

      const result = await service.markAsRead(userId, notificationId);

      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: { readAt: expect.any(Date) },
      });
      expect(result.readAt).toBe(now.toISOString());
    });

    it("should be idempotent and return existing record if already read", async () => {
      const readDate = new Date("2026-01-01T12:00:00Z");
      mockPrisma.notification.findFirst.mockResolvedValueOnce({
        id: notificationId,
        organizationId: orgId,
        recipientUserId: userId,
        type: NotificationType.INFO,
        title: "Info",
        message: "Message",
        data: null,
        readAt: readDate,
        createdAt: readDate,
      });

      const result = await service.markAsRead(userId, notificationId);

      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
      expect(result.readAt).toBe(readDate.toISOString());
    });

    it("should throw NotFoundError if notification belongs to another user (anti-IDOR)", async () => {
      mockPrisma.notification.findFirst.mockResolvedValueOnce(null);

      await expect(service.markAsRead(otherUserId, notificationId)).rejects.toThrow(NotFoundError);
      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe("markAllAsRead", () => {
    it("should mark all unread notifications as read for the user", async () => {
      mockPrisma.notification.updateMany.mockResolvedValueOnce({ count: 3 });

      const result = await service.markAllAsRead(userId, orgId);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          recipientUserId: userId,
          readAt: null,
          organizationId: orgId,
        },
        data: { readAt: expect.any(Date) },
      });

      expect(result).toEqual({ updatedCount: 3 });
    });
  });

  describe("notifyOrganizationAdmins", () => {
    it("should query only OWNER and ADMIN members and create notifications", async () => {
      mockPrisma.organizationMembership.findMany.mockResolvedValueOnce([
        { userId: "admin-1" },
        { userId: "owner-1" },
      ]);
      mockPrisma.notification.create.mockResolvedValue({
        id: "notif-id",
        organizationId: orgId,
        recipientUserId: "admin-1",
        type: NotificationType.PURCHASE_ORDER_SUBMITTED,
        title: "PO Submitted",
        message: "PO-001 submitted",
        data: null,
        readAt: null,
        createdAt: new Date(),
      });

      await service.notifyOrganizationAdmins(orgId, {
        type: NotificationType.PURCHASE_ORDER_SUBMITTED,
        title: "PO Submitted",
        message: "PO-001 submitted",
      });

      expect(mockPrisma.organizationMembership.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] },
        },
        select: { userId: true },
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    });
  });
});
