import type { Request, Response, NextFunction } from "express";
import { appConfig } from "../../../config/app.config";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { UnauthorizedError, BadRequestError } from "../../../common/errors/http-errors";
import { InvitationService, invitationService } from "./invitation.service";
import type {
  CreateInvitationInput,
  ListInvitationsQuery,
  AcceptInvitationInput,
} from "./invitation.schema";
import type { CreateInvitationResponseDto } from "./invitation.types";

/**
 * Controller handling organization invitation creation, listing, revocation, and acceptance.
 */
export class InvitationController {
  constructor(private readonly service: InvitationService = invitationService) {}

  /**
   * POST /api/v1/organizations/:organizationId/invitations
   */
  public createInvitation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const organizationId = req.params["organizationId"] as string;
      const input = req.body as CreateInvitationInput;

      const { invitation, rawToken } = await this.service.createInvitation(
        req.user.id,
        organizationId,
        input,
      );

      const responsePayload: CreateInvitationResponseDto = {
        ...invitation,
        // In local development or test mode, attach devRawToken for verification
        ...(appConfig.server.nodeEnv === "production" ? {} : { devRawToken: rawToken }),
      };

      sendSuccess(res, responsePayload, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/invitations
   */
  public listPendingInvitations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListInvitationsQuery;

      const result = await this.service.listPendingInvitations(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/invitations/:invitationId
   */
  public revokeInvitation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const organizationId = req.params["organizationId"] as string;
      const invitationId = req.params["invitationId"] as string;

      await this.service.revokeInvitation(req.user.id, organizationId, invitationId);

      sendSuccess(res, { message: "Invitation revoked successfully." }, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/invitations/details/:token or /api/v1/invitations/details?token=...
   * Allows the receiver to preview the organization name, invited role, and inviter prior to accepting.
   */
  public getInvitationDetails = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const rawToken =
        (req.params["token"] as string | undefined) || (req.query["token"] as string | undefined);

      if (!rawToken || typeof rawToken !== "string") {
        throw new BadRequestError("Invitation token is required.");
      }

      const result = await this.service.getInvitationDetails(rawToken);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/invitations/received
   * Lists all pending invitations issued to the authenticated user's email address.
   */
  public listUserReceivedInvitations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const result = await this.service.listUserReceivedInvitations(req.user.email);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/invitations/accept
   */
  public acceptInvitation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const body = req.body as
        (Partial<AcceptInvitationInput> & { invitationId?: string }) | undefined;
      const token =
        body?.token ||
        body?.invitationId ||
        (req.params["token"] as string | undefined) ||
        (req.params["invitationId"] as string | undefined);

      if (!token) {
        throw new BadRequestError("Invitation token or ID is required.");
      }

      const result = await this.service.acceptInvitation(req.user.id, req.user.email, token);

      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/invitations/reject
   */
  public rejectInvitation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const body = req.body as { token?: string; invitationId?: string } | undefined;
      const token =
        body?.token ||
        body?.invitationId ||
        (req.params["token"] as string | undefined) ||
        (req.params["invitationId"] as string | undefined);

      if (!token) {
        throw new BadRequestError("Invitation token or ID is required.");
      }

      const result = await this.service.rejectInvitation(req.user.id, req.user.email, token);

      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const invitationController = new InvitationController();
