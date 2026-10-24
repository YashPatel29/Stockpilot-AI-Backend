import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { requireOrgMember } from "../../organizations/organization.middleware";
import { requirePermission } from "../../organizations/rbac/rbac.middleware";
import { Permissions } from "../../organizations/rbac/permissions";
import { CategoryController, categoryController } from "./category.controller";
import {
  categoryOrgParamsSchema,
  categoryRouteParamsSchema,
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
} from "./category.schema";

/**
 * Creates and configures routes for product category management.
 * Mounted under: /api/v1/organizations/:organizationId/categories
 */
export function createCategoryRouter(controller: CategoryController = categoryController): Router {
  const router = Router({ mergeParams: true });

  // All category routes require valid authenticated membership in target organization
  router.use(requireOrgMember);

  // POST /api/v1/organizations/:organizationId/categories - Create category (OWNER, ADMIN)
  router.post(
    "/",
    requirePermission(Permissions.CATALOG_CATEGORIES_WRITE),
    validateRequest({
      params: categoryOrgParamsSchema,
      body: createCategorySchema,
    }),
    controller.createCategory,
  );

  // GET /api/v1/organizations/:organizationId/categories - List categories (OWNER, ADMIN, MEMBER)
  router.get(
    "/",
    requirePermission(Permissions.CATALOG_CATEGORIES_READ),
    validateRequest({
      params: categoryOrgParamsSchema,
      query: listCategoriesQuerySchema,
    }),
    controller.listCategories,
  );

  // GET /api/v1/organizations/:organizationId/categories/:categoryId - Get category (OWNER, ADMIN, MEMBER)
  router.get(
    "/:categoryId",
    requirePermission(Permissions.CATALOG_CATEGORIES_READ),
    validateRequest({
      params: categoryRouteParamsSchema,
    }),
    controller.getCategory,
  );

  // PATCH /api/v1/organizations/:organizationId/categories/:categoryId - Update category (OWNER, ADMIN)
  router.patch(
    "/:categoryId",
    requirePermission(Permissions.CATALOG_CATEGORIES_WRITE),
    validateRequest({
      params: categoryRouteParamsSchema,
      body: updateCategorySchema,
    }),
    controller.updateCategory,
  );

  // DELETE /api/v1/organizations/:organizationId/categories/:categoryId - Delete category (OWNER, ADMIN)
  router.delete(
    "/:categoryId",
    requirePermission(Permissions.CATALOG_CATEGORIES_WRITE),
    validateRequest({
      params: categoryRouteParamsSchema,
    }),
    controller.deleteCategory,
  );

  return router;
}

export const categoryRouter = createCategoryRouter();
