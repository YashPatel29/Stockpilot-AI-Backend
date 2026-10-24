import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { requireOrgMember } from "../../organizations/organization.middleware";
import { requirePermission } from "../../organizations/rbac/rbac.middleware";
import { Permissions } from "../../organizations/rbac/permissions";
import { ProductController, productController } from "./product.controller";
import {
  productOrgParamsSchema,
  productRouteParamsSchema,
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from "./product.schema";

/**
 * Creates and configures routes for product catalog management.
 * Mounted under: /api/v1/organizations/:organizationId/products
 */
export function createProductRouter(controller: ProductController = productController): Router {
  const router = Router({ mergeParams: true });

  // All product routes require valid authenticated membership in target organization
  router.use(requireOrgMember);

  // POST /api/v1/organizations/:organizationId/products - Create product (OWNER, ADMIN)
  router.post(
    "/",
    requirePermission(Permissions.CATALOG_PRODUCTS_WRITE),
    validateRequest({
      params: productOrgParamsSchema,
      body: createProductSchema,
    }),
    controller.createProduct,
  );

  // GET /api/v1/organizations/:organizationId/products - List products (OWNER, ADMIN, MEMBER)
  router.get(
    "/",
    requirePermission(Permissions.CATALOG_PRODUCTS_READ),
    validateRequest({
      params: productOrgParamsSchema,
      query: listProductsQuerySchema,
    }),
    controller.listProducts,
  );

  // GET /api/v1/organizations/:organizationId/products/:productId - Get product (OWNER, ADMIN, MEMBER)
  router.get(
    "/:productId",
    requirePermission(Permissions.CATALOG_PRODUCTS_READ),
    validateRequest({
      params: productRouteParamsSchema,
    }),
    controller.getProduct,
  );

  // PATCH /api/v1/organizations/:organizationId/products/:productId - Update product (OWNER, ADMIN)
  router.patch(
    "/:productId",
    requirePermission(Permissions.CATALOG_PRODUCTS_WRITE),
    validateRequest({
      params: productRouteParamsSchema,
      body: updateProductSchema,
    }),
    controller.updateProduct,
  );

  // DELETE /api/v1/organizations/:organizationId/products/:productId - Soft-archive product (OWNER, ADMIN)
  router.delete(
    "/:productId",
    requirePermission(Permissions.CATALOG_PRODUCTS_WRITE),
    validateRequest({
      params: productRouteParamsSchema,
    }),
    controller.archiveProduct,
  );

  return router;
}

export const productRouter = createProductRouter();
