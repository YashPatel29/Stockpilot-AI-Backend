import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { requirePermission } from "../../organizations/rbac/rbac.middleware";
import { Permissions } from "../../organizations/rbac/permissions";
import { LocationController, locationController } from "./location.controller";
import {
  locationWarehouseParamsSchema,
  locationRouteParamsSchema,
  createLocationSchema,
  updateLocationSchema,
  listLocationsQuerySchema,
} from "./location.schema";

/**
 * Creates and configures routes for storage location management.
 * Mounted under: /api/v1/organizations/:organizationId/warehouses/:warehouseId/locations
 */
export function createLocationRouter(controller: LocationController = locationController): Router {
  const router = Router({ mergeParams: true });

  // POST / - Create storage location (OWNER, ADMIN)
  router.post(
    "/",
    requirePermission(Permissions.LOCATIONS_WRITE),
    validateRequest({
      params: locationWarehouseParamsSchema,
      body: createLocationSchema,
    }),
    controller.createLocation,
  );

  // GET / - List storage locations with filters (OWNER, ADMIN, MEMBER)
  router.get(
    "/",
    requirePermission(Permissions.LOCATIONS_READ),
    validateRequest({
      params: locationWarehouseParamsSchema,
      query: listLocationsQuerySchema,
    }),
    controller.listLocations,
  );

  // GET /:locationId - Get storage location by ID (OWNER, ADMIN, MEMBER)
  router.get(
    "/:locationId",
    requirePermission(Permissions.LOCATIONS_READ),
    validateRequest({
      params: locationRouteParamsSchema,
    }),
    controller.getLocation,
  );

  // PATCH /:locationId - Update storage location (OWNER, ADMIN)
  router.patch(
    "/:locationId",
    requirePermission(Permissions.LOCATIONS_WRITE),
    validateRequest({
      params: locationRouteParamsSchema,
      body: updateLocationSchema,
    }),
    controller.updateLocation,
  );

  // DELETE /:locationId - Deactivate storage location (OWNER, ADMIN)
  router.delete(
    "/:locationId",
    requirePermission(Permissions.LOCATIONS_WRITE),
    validateRequest({
      params: locationRouteParamsSchema,
    }),
    controller.deactivateLocation,
  );

  return router;
}

export const locationRouter = createLocationRouter();
