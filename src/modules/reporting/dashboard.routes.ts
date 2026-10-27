import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organizations/organization.middleware";
import { requirePermission } from "../organizations/rbac/rbac.middleware";
import { Permissions } from "../organizations/rbac/permissions";
import { DashboardController, dashboardController } from "./dashboard.controller";
import { reportingOrgParamsSchema, dashboardInventoryQuerySchema } from "./reporting.schema";

/**
 * Creates and configures routes for the inventory dashboard.
 * Mounted under: /api/v1/organizations/:organizationId/dashboard
 */
export function createDashboardRouter(
  controller: DashboardController = dashboardController,
): Router {
  const router = Router({ mergeParams: true });

  // All dashboard routes require active organization membership and reports read permissions
  router.use(requireOrgMember);
  router.use(requirePermission(Permissions.REPORTS_READ));

  // GET /inventory - Aggregated inventory metrics and recent activity
  router.get(
    "/inventory",
    validateRequest({
      params: reportingOrgParamsSchema,
      query: dashboardInventoryQuerySchema,
    }),
    controller.getInventoryDashboard,
  );

  return router;
}

export const dashboardRouter = createDashboardRouter();
