import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { requireOrgMember } from "../../organizations/organization.middleware";
import { requirePermission } from "../../organizations/rbac/rbac.middleware";
import { Permissions } from "../../organizations/rbac/permissions";
import { WarehouseController, warehouseController } from "./warehouse.controller";
import { locationRouter } from "../locations/location.routes";
import {
  warehouseOrgParamsSchema,
  warehouseRouteParamsSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
  listWarehousesQuerySchema,
} from "./warehouse.schema";

/**
 * Creates and configures routes for warehouse facility management.
 * Mounted under: /api/v1/organizations/:organizationId/warehouses
 */
export function createWarehouseRouter(
  controller: WarehouseController = warehouseController,
): Router {
  const router = Router({ mergeParams: true });

  // All warehouse routes require active membership in the target organization
  router.use(requireOrgMember);

  // Sub-router for warehouse storage locations
  router.use("/:warehouseId/locations", locationRouter);

  // POST / - Create warehouse (OWNER, ADMIN)
  router.post(
    "/",
    requirePermission(Permissions.WAREHOUSES_WRITE),
    validateRequest({
      params: warehouseOrgParamsSchema,
      body: createWarehouseSchema,
    }),
    controller.createWarehouse,
  );

  // GET / - List warehouses with filters (OWNER, ADMIN, MEMBER)
  router.get(
    "/",
    requirePermission(Permissions.WAREHOUSES_READ),
    validateRequest({
      params: warehouseOrgParamsSchema,
      query: listWarehousesQuerySchema,
    }),
    controller.listWarehouses,
  );

  // GET /:warehouseId - Get warehouse details by ID (OWNER, ADMIN, MEMBER)
  router.get(
    "/:warehouseId",
    requirePermission(Permissions.WAREHOUSES_READ),
    validateRequest({
      params: warehouseRouteParamsSchema,
    }),
    controller.getWarehouse,
  );

  // PATCH /:warehouseId - Update warehouse details (OWNER, ADMIN)
  router.patch(
    "/:warehouseId",
    requirePermission(Permissions.WAREHOUSES_WRITE),
    validateRequest({
      params: warehouseRouteParamsSchema,
      body: updateWarehouseSchema,
    }),
    controller.updateWarehouse,
  );

  // DELETE /:warehouseId - Deactivate warehouse (OWNER, ADMIN)
  router.delete(
    "/:warehouseId",
    requirePermission(Permissions.WAREHOUSES_WRITE),
    validateRequest({
      params: warehouseRouteParamsSchema,
    }),
    controller.deactivateWarehouse,
  );

  return router;
}

export const warehouseRouter = createWarehouseRouter();
