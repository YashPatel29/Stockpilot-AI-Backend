import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { OrganizationService, organizationService } from "./organization.service";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationsQuery,
} from "./organization.schema";

/**
 * Controller translating HTTP requests to organization domain methods
 * and formatting responses using standard StockPilot envelopes.
 */
export class OrganizationController {
  constructor(private readonly service: OrganizationService = organizationService) {}

  /**
   * POST /api/v1/organizations
   * Creates an organization and establishes caller as OWNER.
   */
  public createOrganization = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = req.body as CreateOrganizationInput;
      const result = await this.service.createOrganization(req.user!.id, input);

      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations
   * Lists organizations the authenticated user belongs to.
   */
  public listOrganizations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = req.query as unknown as ListOrganizationsQuery;
      const result = await this.service.listUserOrganizations(req.user!.id, query);

      sendSuccess(
        res,
        result.organizations,
        HttpStatus.OK,
        result.meta as unknown as Record<string, unknown>,
      );
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId
   * Retrieves organization details if the caller is an active member.
   */
  public getOrganization = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { organizationId } = req.params as { organizationId: string };
      const result = await this.service.getOrganizationById(req.user!.id, organizationId);

      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId
   * Updates organization details (restricted to OWNERs).
   */
  public updateOrganization = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { organizationId } = req.params as { organizationId: string };
      const input = req.body as UpdateOrganizationInput;
      const updated = await this.service.updateOrganization(req.user!.id, organizationId, input);

      sendSuccess(res, { organization: updated }, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId
   * Safely deactivates an organization (restricted to OWNERs).
   */
  public deactivateOrganization = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { organizationId } = req.params as { organizationId: string };
      await this.service.deactivateOrganization(req.user!.id, organizationId);

      sendSuccess(
        res,
        {
          message: "Organization deactivated successfully.",
          organizationId,
        },
        HttpStatus.OK,
      );
    } catch (error) {
      next(error);
    }
  };
}

export const organizationController = new OrganizationController();

