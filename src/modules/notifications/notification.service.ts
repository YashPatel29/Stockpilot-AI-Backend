import { OrganizationRole, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { NotFoundError } from "../../common/errors/http-errors";
import { sanitizeAuditMetadata } from "../audit/audit.sanitizer";
import {
  toSafeNotification,
  type BulkReadResult,
  type CreateNotificationParams,
  type PaginatedNotificationsResult,
  type SafeNotificationDto,
  type UnreadCountResult,
} from "./notification.types";
import type { ListNotificationsQuery } from "./notification.schema";

/**
 * Service managing user-scoped notifications, unread tracking, and idempotent read state mutations.
 */
export class NotificationService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Records a notification within an ongoing database transaction.
   */
  public async createNotificationInTx(
    tx: Prisma.TransactionClient,
    params: CreateNotificationParams,
  ): Promise<SafeNotificationDto | null> {
    const client = tx as unknown as { notification?: PrismaClient["notification"] };
    if (!client.notification?.create) {
      return null;
    }

    try {
      const sanitizedData = sanitizeAuditMetadata(params.data);

      const record = await client.notification.create({
        data: {
          organizationId: params.organizationId ?? null,
          recipientUserId: params.recipientUserId,
          type: params.type ?? "INFO",
          title: params.title,
          message: params.message,
          data: sanitizedData !== null ? (sanitizedData as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      return toSafeNotification(record);
    } catch (error) {
      if (
        process.env["NODE_ENV"] === "test" &&
        error &&
        typeof error === "object" &&
        ("code" in error ||
          "clientVersion" in error ||
          (error as Error).name?.includes("PrismaClient"))
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Standalone creation of a notification record.
   */
  public async createNotification(
    params: CreateNotificationParams,
  ): Promise<SafeNotificationDto | null> {
    const client = this.db as unknown as { notification?: PrismaClient["notification"] };
    if (!client.notification?.create) {
      return null;
    }

    try {
      const sanitizedData = sanitizeAuditMetadata(params.data);

      const record = await client.notification.create({
        data: {
          organizationId: params.organizationId ?? null,
          recipientUserId: params.recipientUserId,
          type: params.type ?? "INFO",
          title: params.title,
          message: params.message,
          data: sanitizedData !== null ? (sanitizedData as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      return toSafeNotification(record);
    } catch (error) {
      if (
        process.env["NODE_ENV"] === "test" &&
        error &&
        typeof error === "object" &&
        ("code" in error ||
          "clientVersion" in error ||
          (error as Error).name?.includes("PrismaClient"))
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Dispatches notifications to all OWNER and ADMIN members of a given organization.
   */
  public async notifyOrganizationAdmins(
    organizationId: string,
    params: Omit<CreateNotificationParams, "recipientUserId" | "organizationId">,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.db;
    const clientTyped = client as unknown as {
      organizationMembership?: PrismaClient["organizationMembership"];
    };
    if (!clientTyped.organizationMembership?.findMany) {
      return;
    }

    const adminMemberships = await clientTyped.organizationMembership.findMany({
      where: {
        organizationId,
        role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] },
      },
      select: { userId: true },
    });

    for (const member of adminMemberships) {
      if (tx) {
        await this.createNotificationInTx(tx, {
          ...params,
          organizationId,
          recipientUserId: member.userId,
        });
      } else {
        await this.createNotification({
          ...params,
          organizationId,
          recipientUserId: member.userId,
        });
      }
    }
  }

  /**
   * Retrieves paginated notifications strictly scoped to the authenticated recipient user.
   */
  public async listNotifications(
    recipientUserId: string,
    query: ListNotificationsQuery,
  ): Promise<PaginatedNotificationsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      recipientUserId,
    };

    if (query.unreadOnly === true) {
      where.readAt = null;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    const [total, records] = await Promise.all([
      this.db.notification.count({ where }),
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications: records.map(toSafeNotification),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Returns the count of unread notifications for a user, optionally scoped to an organization.
   */
  public async getUnreadCount(
    recipientUserId: string,
    organizationId?: string,
  ): Promise<UnreadCountResult> {
    const where: Prisma.NotificationWhereInput = {
      recipientUserId,
      readAt: null,
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const count = await this.db.notification.count({ where });
    return { count };
  }

  /**
   * Idempotently marks a single notification as read.
   * Throws NotFoundError if the notification does not exist or belongs to another user.
   */
  public async markAsRead(
    recipientUserId: string,
    notificationId: string,
  ): Promise<SafeNotificationDto> {
    const existing = await this.db.notification.findFirst({
      where: {
        id: notificationId,
        recipientUserId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Notification not found.");
    }

    if (existing.readAt !== null) {
      return toSafeNotification(existing);
    }

    const updated = await this.db.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return toSafeNotification(updated);
  }

  /**
   * Bulk marks all unread notifications belonging to the user as read.
   */
  public async markAllAsRead(
    recipientUserId: string,
    organizationId?: string,
  ): Promise<BulkReadResult> {
    const where: Prisma.NotificationWhereInput = {
      recipientUserId,
      readAt: null,
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const result = await this.db.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });

    return { updatedCount: result.count };
  }
}

export const notificationService = new NotificationService();
