import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { authenticate } from "../auth/auth.middleware";
import { OrganizationController, organizationController } from "./organization.controller";
import { memberRouter } from "./members/member.routes";
import { orgInvitationRouter } from "./invitations/invitation.routes";
import { categoryRouter } from "../products/categories/category.routes";
import { productRouter } from "../products/products/product.routes";
import { warehouseRouter } from "../warehouses/warehouses/warehouse.routes";
import { inventoryRouter } from "../inventory/inventory.routes";
import { supplierRouter } from "../procurement/suppliers/supplier.routes";
import { purchaseOrderRouter } from "../procurement/purchase-orders/purchase-order.routes";
import { dashboardRouter } from "../reporting/dashboard.routes";
import { reportsRouter } from "../reporting/reports.routes";
import { auditRouter } from "../audit/audit.routes";
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

  // Subroutes for organization members, invitations, categories, products, warehouses, inventory, procurement, and reporting
  router.use("/:organizationId/members", memberRouter);
  router.use("/:organizationId/invitations", orgInvitationRouter);
  router.use("/:organizationId/categories", categoryRouter);
  router.use("/:organizationId/products", productRouter);
  router.use("/:organizationId/warehouses", warehouseRouter);
  router.use("/:organizationId/inventory", inventoryRouter);
  router.use("/:organizationId/suppliers", supplierRouter);
  router.use("/:organizationId/purchase-orders", purchaseOrderRouter);
  router.use("/:organizationId/dashboard", dashboardRouter);
  router.use("/:organizationId/reports", reportsRouter);
  router.use("/:organizationId/audit-logs", auditRouter);

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
