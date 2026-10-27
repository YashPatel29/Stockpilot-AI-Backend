import { z } from "zod";
import { NotificationType } from "@prisma/client";

const queryBooleanSchema = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const trimmed = val.trim().toLowerCase();
    if (trimmed === "true" || trimmed === "1") return true;
    if (trimmed === "false" || trimmed === "0") return false;
  }
  return val;
}, z.boolean().optional());

/**
 * Validation schema for listing notifications with pagination and filters.
 */
export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be an integer." })
      .int()
      .positive("Page must be at least 1.")
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be an integer." })
      .int()
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit cannot exceed 100.")
      .default(20),
    unreadOnly: queryBooleanSchema,
    type: z
      .nativeEnum(NotificationType, {
        errorMap: () => ({ message: "Invalid notification type." }),
      })
      .optional(),
    organizationId: z.string().uuid("Invalid organization ID format.").optional(),
  })
  .strict();

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/**
 * Validation schema for querying unread notification count.
 */
export const unreadCountQuerySchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format.").optional(),
  })
  .strict();

export type UnreadCountQuery = z.infer<typeof unreadCountQuerySchema>;

/**
 * Validation schema for marking a single notification as read by route parameter.
 */
export const notificationIdParamSchema = z
  .object({
    notificationId: z.string().uuid("Invalid notification ID format."),
  })
  .strict();

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

/**
 * Validation schema for marking all notifications as read.
 */
export const readAllQuerySchema = z
  .object({
    organizationId: z.string().uuid("Invalid organization ID format.").optional(),
  })
  .strict();

export type ReadAllQuery = z.infer<typeof readAllQuerySchema>;
