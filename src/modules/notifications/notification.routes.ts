import { Router } from "express";
import { authenticate } from "../auth/auth.middleware";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { NotificationController, notificationController } from "./notification.controller";
import {
  listNotificationsQuerySchema,
  unreadCountQuerySchema,
  notificationIdParamSchema,
  readAllQuerySchema,
} from "./notification.schema";

/**
 * Creates and configures routes for user notifications and unread tracking.
 * Mounted under: /api/v1/notifications
 */
export function createNotificationRouter(
  controller: NotificationController = notificationController,
): Router {
  const router = Router();

  // All notification endpoints require an authenticated user session
  router.use(authenticate);

  // GET /unread-count - Get total unread notifications for current user
  router.get(
    "/unread-count",
    validateRequest({ query: unreadCountQuerySchema }),
    controller.getUnreadCount,
  );

  // PATCH /read-all - Mark all notifications as read for current user
  router.patch(
    "/read-all",
    validateRequest({ query: readAllQuerySchema }),
    controller.markAllAsRead,
  );

  // GET / - Paginated list of notifications for current user
  router.get(
    "/",
    validateRequest({ query: listNotificationsQuerySchema }),
    controller.listNotifications,
  );

  // PATCH /:notificationId/read - Mark a specific notification as read
  router.patch(
    "/:notificationId/read",
    validateRequest({ params: notificationIdParamSchema }),
    controller.markAsRead,
  );

  return router;
}

export const notificationRouter = createNotificationRouter();
