import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { requireOrgMember } from "../../organizations/organization.middleware";
import { requirePermission } from "../../organizations/rbac/rbac.middleware";
import { Permissions } from "../../organizations/rbac/permissions";
import { SupplierController, supplierController } from "./supplier.controller";
import {
  supplierOrgParamsSchema,
  supplierRouteParamsSchema,
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersQuerySchema,
} from "./supplier.schema";

/**
 * Creates and configures routes for supplier management.
 * Mounted under: /api/v1/organizations/:organizationId/suppliers
 */
export function createSupplierRouter(controller: SupplierController = supplierController): Router {
  const router = Router({ mergeParams: true });

  // All supplier routes require active membership in the target organization
  router.use(requireOrgMember);

  // POST / - Create supplier (OWNER, ADMIN)
  router.post(
    "/",
    requirePermission(Permissions.SUPPLIERS_WRITE),
    validateRequest({
      params: supplierOrgParamsSchema,
      body: createSupplierSchema,
    }),
    controller.createSupplier,
  );

  // GET / - List suppliers with filters (OWNER, ADMIN, MEMBER)
  router.get(
    "/",
    requirePermission(Permissions.SUPPLIERS_READ),
    validateRequest({
      params: supplierOrgParamsSchema,
      query: listSuppliersQuerySchema,
    }),
    controller.listSuppliers,
  );

  // GET /:supplierId - Get supplier details by ID (OWNER, ADMIN, MEMBER)
  router.get(
    "/:supplierId",
    requirePermission(Permissions.SUPPLIERS_READ),
    validateRequest({
      params: supplierRouteParamsSchema,
    }),
    controller.getSupplier,
  );

  // PATCH /:supplierId - Update supplier details (OWNER, ADMIN)
  router.patch(
    "/:supplierId",
    requirePermission(Permissions.SUPPLIERS_WRITE),
    validateRequest({
      params: supplierRouteParamsSchema,
      body: updateSupplierSchema,
    }),
    controller.updateSupplier,
  );

  // DELETE /:supplierId - Soft deactivate supplier (OWNER, ADMIN)
  router.delete(
    "/:supplierId",
    requirePermission(Permissions.SUPPLIERS_WRITE),
    validateRequest({
      params: supplierRouteParamsSchema,
    }),
    controller.deactivateSupplier,
  );

  return router;
}

export const supplierRouter = createSupplierRouter();
