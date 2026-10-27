import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organizations/organization.middleware";
import { requirePermission } from "../organizations/rbac/rbac.middleware";
import { Permissions } from "../organizations/rbac/permissions";
import { AuditController, auditController } from "./audit.controller";
import { auditOrgParamsSchema, listAuditLogsQuerySchema } from "./audit.schema";

/**
 * Creates and configures routes for accessing organization audit logs.
 * Mounted under: /api/v1/organizations/:organizationId/audit-logs
 */
export function createAuditRouter(controller: AuditController = auditController): Router {
  const router = Router({ mergeParams: true });

  // Organization membership and explicit AUDIT_LOGS_READ permission required
  router.use(requireOrgMember);
  router.use(requirePermission(Permissions.AUDIT_LOGS_READ));

  // GET / - Paginated, filtered list of organization audit logs (newest first)
  router.get(
    "/",
    validateRequest({
      params: auditOrgParamsSchema,
      query: listAuditLogsQuerySchema,
    }),
    controller.listAuditLogs,
  );

  return router;
}

export const auditRouter = createAuditRouter();
