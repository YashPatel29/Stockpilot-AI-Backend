import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organizations/organization.middleware";
import { requirePermission } from "../organizations/rbac/rbac.middleware";
import { Permissions } from "../organizations/rbac/permissions";
import { ForecastingController, forecastingController } from "./forecasting.controller";
import {
  forecastOrgParamsSchema,
  forecastIdParamSchema,
  createDemandForecastSchema,
  listForecastRunsQuerySchema,
} from "./forecasting.schema";

/**
 * Creates and configures routes for demand forecasting and backtesting.
 * Mounted under: /api/v1/organizations/:organizationId/forecasts/demand
 */
export function createDemandForecastRouter(
  controller: ForecastingController = forecastingController,
): Router {
  const router = Router({ mergeParams: true });

  // All demand forecasting routes require authenticated organization membership
  router.use(requireOrgMember);

  // POST / - Initiate a demand forecast run
  router.post(
    "/",
    requirePermission(Permissions.FORECASTS_WRITE),
    validateRequest({
      params: forecastOrgParamsSchema,
      body: createDemandForecastSchema,
    }),
    controller.generateForecast,
  );

  // GET / - List historical demand forecast runs
  router.get(
    "/",
    requirePermission(Permissions.FORECASTS_READ),
    validateRequest({
      params: forecastOrgParamsSchema,
      query: listForecastRunsQuerySchema,
    }),
    controller.listForecastRuns,
  );

  // GET /:forecastId - Retrieve a forecast run with time-series points
  router.get(
    "/:forecastId",
    requirePermission(Permissions.FORECASTS_READ),
    validateRequest({
      params: forecastIdParamSchema,
    }),
    controller.getForecastRun,
  );

  // GET /:forecastId/evaluation - Retrieve walk-forward backtesting evaluation metrics
  router.get(
    "/:forecastId/evaluation",
    requirePermission(Permissions.FORECASTS_READ),
    validateRequest({
      params: forecastIdParamSchema,
    }),
    controller.getForecastEvaluation,
  );

  return router;
}

export const demandForecastRouter = createDemandForecastRouter();
