import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organizations/organization.middleware";
import { requirePermission } from "../organizations/rbac/rbac.middleware";
import { Permissions } from "../organizations/rbac/permissions";
import { ReportsController, reportsController } from "./reports.controller";
import {
  reportingOrgParamsSchema,
  warehouseInventoryQuerySchema,
  inventoryMovementsQuerySchema,
  productInventoryQuerySchema,
  lowStockQuerySchema,
  purchaseOrderReportQuerySchema,
  recentActivityQuerySchema,
} from "./reporting.schema";

/**
 * Creates and configures routes for business and inventory reports.
 * Mounted under: /api/v1/organizations/:organizationId/reports
 */
export function createReportsRouter(controller: ReportsController = reportsController): Router {
  const router = Router({ mergeParams: true });

  // All reports routes require active organization membership and reports read permissions
  router.use(requireOrgMember);
  router.use(requirePermission(Permissions.REPORTS_READ));

  // GET /inventory-by-warehouse - Stock distribution grouped by warehouse and UOM
  router.get(
    "/inventory-by-warehouse",
    validateRequest({
      params: reportingOrgParamsSchema,
      query: warehouseInventoryQuerySchema,
    }),
    controller.getInventoryByWarehouse,
  );

  // GET /inventory-movements - Paginated inventory ledger movement report with type summary
  router.get(
    "/inventory-movements",
    validateRequest({
      params: reportingOrgParamsSchema,
      query: inventoryMovementsQuerySchema,
    }),
    controller.getInventoryMovements,
  );

  // GET /product-inventory - Paginated product inventory summary with location breakdown
  router.get(
    "/product-inventory",
    validateRequest({
      params: reportingOrgParamsSchema,
      query: productInventoryQuerySchema,
    }),
    controller.getProductInventory,
  );

  // GET /low-stock - Low stock alert report based on Product.lowStockThreshold
  router.get(
    "/low-stock",
    validateRequest({
      params: reportingOrgParamsSchema,
      query: lowStockQuerySchema,
    }),
    controller.getLowStockReport,
  );

  // GET /purchase-orders - Procurement status summaries, committed value, and fulfillment
  router.get(
    "/purchase-orders",
    validateRequest({
      params: reportingOrgParamsSchema,
      query: purchaseOrderReportQuerySchema,
    }),
    controller.getPurchaseOrderReport,
  );

  // GET /recent-activity - Latest ledger activity
  router.get(
    "/recent-activity",
    validateRequest({
      params: reportingOrgParamsSchema,
      query: recentActivityQuerySchema,
    }),
    controller.getRecentActivity,
  );

  return router;
}

export const reportsRouter = createReportsRouter();
