import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { authenticate } from "../auth/auth.middleware";
import { OrganizationController, organizationController } from "./organization.controller";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  organizationIdParamSchema,
  listOrganizationsQuerySchema,
} from "./organization.schema";

/**
 * Creates and configures routes for organization and multi-tenancy management.
 * Route prefix: /api/v1/organizations
 */
export function createOrganizationRouter(
  controller: OrganizationController = organizationController,
): Router {
  const router = Router();

  // All organization routes require authenticated user session
  router.use(authenticate);

  // POST /api/v1/organizations - Create organization + owner membership
  router.post(
    "/",
    validateRequest({ body: createOrganizationSchema }),
    controller.createOrganization,
  );

  // GET /api/v1/organizations - List user's organizations (paginated)
  router.get(
    "/",
    validateRequest({ query: listOrganizationsQuerySchema }),
    controller.listOrganizations,
  );

  // GET /api/v1/organizations/:organizationId - Get organization details (members only)
  router.get(
    "/:organizationId",
    validateRequest({ params: organizationIdParamSchema }),
    controller.getOrganization,
  );

  // PATCH /api/v1/organizations/:organizationId - Update organization (owners only)
  router.patch(
    "/:organizationId",
    validateRequest({
      params: organizationIdParamSchema,
      body: updateOrganizationSchema,
    }),
    controller.updateOrganization,
  );

  // DELETE /api/v1/organizations/:organizationId - Safely deactivate organization (owners only)
  router.delete(
    "/:organizationId",
    validateRequest({ params: organizationIdParamSchema }),
    controller.deactivateOrganization,
  );

  return router;
}

export const organizationRouter = createOrganizationRouter();
