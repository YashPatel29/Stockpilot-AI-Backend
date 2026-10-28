import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { CopilotService, copilotService } from "./copilot.service";
import type { CopilotChatInput, ListConversationsQuery, ListMessagesQuery } from "./copilot.schema";

export class CopilotController {
  constructor(private readonly service: CopilotService = copilotService) {}

  /**
   * POST /api/v1/organizations/:organizationId/copilot/chat
   */
  public chat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const input = req.body as CopilotChatInput;

      const clientContext = {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        requestId: req.headers["x-request-id"] as string | undefined,
      };

      const result = await this.service.chat(organizationId, userId, input, clientContext);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/copilot/conversations
   */
  public listConversations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const query = req.query as unknown as ListConversationsQuery;

      const result = await this.service.listConversations(organizationId, userId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/copilot/conversations/:conversationId
   */
  public getConversation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const conversationId = req.params["conversationId"] as string;
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const query = req.query as unknown as ListMessagesQuery;

      const result = await this.service.getConversation(
        organizationId,
        userId,
        conversationId,
        query,
      );
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/copilot/conversations/:conversationId
   */
  public deleteConversation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const conversationId = req.params["conversationId"] as string;
      const userId = (req as unknown as { user: { id: string } }).user.id;

      const clientContext = {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        requestId: req.headers["x-request-id"] as string | undefined,
      };

      const result = await this.service.deleteConversation(
        organizationId,
        userId,
        conversationId,
        clientContext,
      );
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const copilotController = new CopilotController();
