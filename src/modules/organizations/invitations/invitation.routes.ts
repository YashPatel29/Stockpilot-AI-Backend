import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { authenticate } from "../../auth/auth.middleware";
import { requireOrgMember } from "../organization.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { Permissions } from "../rbac/permissions";
import { InvitationController, invitationController } from "./invitation.controller";
import { invitationRateLimiter } from "./invitation.rate-limiter";
import {
  createInvitationSchema,
  listInvitationsQuerySchema,
  invitationRouteParamsSchema,
  acceptInvitationSchema,
  rejectInvitationSchema,
} from "./invitation.schema";

/**
 * Creates and configures routes for managing invitations inside an organization context.
 * Mounted under: /api/v1/organizations/:organizationId/invitations
 */
export function createOrgInvitationRouter(
  controller: InvitationController = invitationController,
): Router {
  const router = Router({ mergeParams: true });

  // Organization-scoped routes require active membership
  router.use(requireOrgMember);

  // POST /api/v1/organizations/:organizationId/invitations
  router.post(
    "/",
    invitationRateLimiter,
    requirePermission(Permissions.ORG_INVITATIONS_CREATE),
    validateRequest({ body: createInvitationSchema }),
    controller.createInvitation,
  );

  // GET /api/v1/organizations/:organizationId/invitations
  router.get(
    "/",
    requirePermission(Permissions.ORG_INVITATIONS_READ),
    validateRequest({ query: listInvitationsQuerySchema }),
    controller.listPendingInvitations,
  );

  // DELETE /api/v1/organizations/:organizationId/invitations/:invitationId
  router.delete(
    "/:invitationId",
    requirePermission(Permissions.ORG_INVITATIONS_REVOKE),
    validateRequest({ params: invitationRouteParamsSchema }),
    controller.revokeInvitation,
  );

  return router;
}

/**
 * Creates and configures the invitation acceptance and receiver inspection routes.
 * Mounted under: /api/v1/invitations
 */
export function createAcceptInvitationRouter(
  controller: InvitationController = invitationController,
): Router {
  const router = Router();

  // 1. Public endpoints: allow receiver or frontend to inspect invitation details before logging in
  router.get("/details/:token", invitationRateLimiter, controller.getInvitationDetails);
  router.get("/details", invitationRateLimiter, controller.getInvitationDetails);

  // 2. Authenticated receiver endpoints
  router.get("/received", authenticate, controller.listUserReceivedInvitations);

  // POST /api/v1/invitations/accept (token or invitationId in body)
  router.post(
    "/accept",
    authenticate,
    invitationRateLimiter,
    validateRequest({ body: acceptInvitationSchema }),
    controller.acceptInvitation,
  );

  // POST /api/v1/invitations/:token/accept (token or invitationId in URL path)
  router.post("/:token/accept", authenticate, invitationRateLimiter, controller.acceptInvitation);

  // POST /api/v1/invitations/reject (token or invitationId in body)
  router.post(
    "/reject",
    authenticate,
    invitationRateLimiter,
    validateRequest({ body: rejectInvitationSchema }),
    controller.rejectInvitation,
  );

  // POST /api/v1/invitations/:token/reject (token or invitationId in URL path)
  router.post("/:token/reject", authenticate, invitationRateLimiter, controller.rejectInvitation);

  return router;
}

export const orgInvitationRouter = createOrgInvitationRouter();
export const acceptInvitationRouter = createAcceptInvitationRouter();
