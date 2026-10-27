import type { Notification, NotificationType } from "@prisma/client";

/**
 * Safe external DTO representing a user-scoped notification.
 */
export interface SafeNotificationDto {
  id: string;
  organizationId: string | null;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Result returned when querying the unread notification count.
 */
export interface UnreadCountResult {
  count: number;
}

/**
 * Result returned when bulk-marking notifications as read.
 */
export interface BulkReadResult {
  updatedCount: number;
}

/**
 * Paginated notifications query result.
 */
export interface PaginatedNotificationsResult {
  notifications: SafeNotificationDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Internal input parameters for creating a new notification.
 */
export interface CreateNotificationParams {
  organizationId?: string | null;
  recipientUserId: string;
  type?: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
}

/**
 * Transforms a database notification record into a safe external DTO.
 */
export function toSafeNotification(notification: Notification): SafeNotificationDto {
  return {
    id: notification.id,
    organizationId: notification.organizationId,
    recipientUserId: notification.recipientUserId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data:
      notification.data &&
      typeof notification.data === "object" &&
      !Array.isArray(notification.data)
        ? (notification.data as Record<string, unknown>)
        : null,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}
