import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organizations/organization.middleware";
import { requirePermission } from "../organizations/rbac/rbac.middleware";
import { Permissions } from "../organizations/rbac/permissions";
import { AnomalyController, anomalyController } from "./anomaly.controller";
import {
  anomalyOrgParamsSchema,
  anomalyIdParamSchema,
  detectionRunIdParamSchema,
  triggerAnomalyDetectionSchema,
  listAnomaliesQuerySchema,
  listDetectionRunsQuerySchema,
  updateAnomalyStatusSchema,
} from "./anomaly.schema";

/**
 * Creates and configures routes for inventory anomaly detection and review lifecycle.
 * Mounted under: /api/v1/organizations/:organizationId/anomalies
 */
export function createAnomalyRouter(controller: AnomalyController = anomalyController): Router {
  const router = Router({ mergeParams: true });

  // All anomaly detection routes require authenticated organization membership
  router.use(requireOrgMember);

  // POST /detection-runs - Initiate a bounded anomaly detection run
  router.post(
    "/detection-runs",
    requirePermission(Permissions.ANOMALIES_WRITE),
    validateRequest({
      params: anomalyOrgParamsSchema,
      body: triggerAnomalyDetectionSchema,
    }),
    controller.triggerDetectionRun,
  );

  // GET /detection-runs - List anomaly detection runs
  router.get(
    "/detection-runs",
    requirePermission(Permissions.ANOMALIES_READ),
    validateRequest({
      params: anomalyOrgParamsSchema,
      query: listDetectionRunsQuerySchema,
    }),
    controller.listDetectionRuns,
  );

  // GET /detection-runs/:runId - Retrieve a single detection run with findings
  router.get(
    "/detection-runs/:runId",
    requirePermission(Permissions.ANOMALIES_READ),
    validateRequest({
      params: detectionRunIdParamSchema,
    }),
    controller.getDetectionRunById,
  );

  // GET / - List detected inventory anomalies with filtering and pagination
  router.get(
    "/",
    requirePermission(Permissions.ANOMALIES_READ),
    validateRequest({
      params: anomalyOrgParamsSchema,
      query: listAnomaliesQuerySchema,
    }),
    controller.listAnomalies,
  );

  // GET /:anomalyId - Retrieve an individual anomaly finding with evidence
  router.get(
    "/:anomalyId",
    requirePermission(Permissions.ANOMALIES_READ),
    validateRequest({
      params: anomalyIdParamSchema,
    }),
    controller.getAnomalyById,
  );

  // PATCH /:anomalyId/status - Update resolution status (ACKNOWLEDGED, RESOLVED, DISMISSED)
  router.patch(
    "/:anomalyId/status",
    requirePermission(Permissions.ANOMALIES_WRITE),
    validateRequest({
      params: anomalyIdParamSchema,
      body: updateAnomalyStatusSchema,
    }),
    controller.updateAnomalyStatus,
  );

  return router;
}

export const anomalyRouter = createAnomalyRouter();
