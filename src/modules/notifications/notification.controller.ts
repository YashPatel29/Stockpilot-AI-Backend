import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { NotificationService, notificationService } from "./notification.service";
import type { ListNotificationsQuery, UnreadCountQuery, ReadAllQuery } from "./notification.schema";

/**
 * Controller handling user-scoped notifications and read state transitions.
 */
export class NotificationController {
  constructor(private readonly service: NotificationService = notificationService) {}

  /**
   * GET /api/v1/notifications
   */
  public listNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as ListNotificationsQuery;

      const result = await this.service.listNotifications(userId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/notifications/unread-count
   */
  public getUnreadCount = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as UnreadCountQuery;

      const result = await this.service.getUnreadCount(userId, query.organizationId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/notifications/:notificationId/read
   */
  public markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const notificationId = req.params["notificationId"] as string;

      const result = await this.service.markAsRead(userId, notificationId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/notifications/read-all
   */
  public markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as ReadAllQuery;

      const result = await this.service.markAllAsRead(userId, query.organizationId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const notificationController = new NotificationController();
