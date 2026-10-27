import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { DashboardService, dashboardService } from "./dashboard.service";
import type { DashboardInventoryQuery } from "./reporting.schema";

/**
 * Controller handling executive inventory dashboard metrics.
 */
export class DashboardController {
  constructor(private readonly service: DashboardService = dashboardService) {}

  /**
   * GET /api/v1/organizations/:organizationId/dashboard/inventory
   */
  public getInventoryDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as DashboardInventoryQuery;

      const result = await this.service.getInventoryDashboard(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const dashboardController = new DashboardController();
