import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { UnauthorizedError } from "../../../common/errors/http-errors";
import { MemberService, memberService } from "./member.service";
import type { UpdateMemberRoleInput, ListMembersQuery } from "./member.schema";

/**
 * Controller handling organization member management endpoints.
 */
export class MemberController {
  constructor(private readonly service: MemberService = memberService) {}

  /**
   * GET /api/v1/organizations/:organizationId/members
   */
  public listMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListMembersQuery;

      const result = await this.service.listMembers(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/members/:membershipId/role
   */
  public updateMemberRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const organizationId = req.params["organizationId"] as string;
      const membershipId = req.params["membershipId"] as string;
      const { role } = req.body as UpdateMemberRoleInput;

      const updated = await this.service.updateMemberRole(
        req.user.id,
        organizationId,
        membershipId,
        role,
      );

      sendSuccess(res, updated, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/members/:membershipId
   */
  public removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required.");
      }

      const organizationId = req.params["organizationId"] as string;
      const membershipId = req.params["membershipId"] as string;

      await this.service.removeMember(req.user.id, organizationId, membershipId);

      sendSuccess(res, { message: "Member removed successfully." }, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const memberController = new MemberController();
