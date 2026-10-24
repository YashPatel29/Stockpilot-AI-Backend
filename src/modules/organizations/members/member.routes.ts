import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organization.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { Permissions } from "../rbac/permissions";
import { MemberController, memberController } from "./member.controller";
import {
  memberRouteParamsSchema,
  updateMemberRoleSchema,
  listMembersQuerySchema,
} from "./member.schema";

/**
 * Creates and configures routes for organization member management.
 * Mounted under: /api/v1/organizations/:organizationId/members
 */
export function createMemberRouter(controller: MemberController = memberController): Router {
  const router = Router({ mergeParams: true });

  // All member routes require active membership in the organization
  router.use(requireOrgMember);

  // GET /api/v1/organizations/:organizationId/members
  router.get(
    "/",
    requirePermission(Permissions.ORG_MEMBERS_READ),
    validateRequest({ query: listMembersQuerySchema }),
    controller.listMembers,
  );

  // PATCH /api/v1/organizations/:organizationId/members/:membershipId/role
  router.patch(
    "/:membershipId/role",
    requirePermission(Permissions.ORG_MEMBERS_ROLE_UPDATE),
    validateRequest({
      params: memberRouteParamsSchema,
      body: updateMemberRoleSchema,
    }),
    controller.updateMemberRole,
  );

  // DELETE /api/v1/organizations/:organizationId/members/:membershipId
  router.delete(
    "/:membershipId",
    requirePermission(Permissions.ORG_MEMBERS_REMOVE),
    validateRequest({ params: memberRouteParamsSchema }),
    controller.removeMember,
  );

  return router;
}

export const memberRouter = createMemberRouter();
