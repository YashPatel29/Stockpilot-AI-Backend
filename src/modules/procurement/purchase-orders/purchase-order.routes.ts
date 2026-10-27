import { Router } from "express";
import { validateRequest } from "../../../common/middleware/validate.middleware";
import { requireOrgMember } from "../../organizations/organization.middleware";
import { requirePermission } from "../../organizations/rbac/rbac.middleware";
import { Permissions } from "../../organizations/rbac/permissions";
import { PurchaseOrderController, purchaseOrderController } from "./purchase-order.controller";
import {
  purchaseOrderOrgParamsSchema,
  purchaseOrderRouteParamsSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderItemsSchema,
  listPurchaseOrdersQuerySchema,
} from "./purchase-order.schema";

/**
 * Creates and configures routes for purchase order and procurement management.
 * Mounted under: /api/v1/organizations/:organizationId/purchase-orders
 */
export function createPurchaseOrderRouter(
  controller: PurchaseOrderController = purchaseOrderController,
): Router {
  const router = Router({ mergeParams: true });

  // All purchase order routes require active membership in the target organization
  router.use(requireOrgMember);

  // POST / - Create purchase order (OWNER, ADMIN)
  router.post(
    "/",
    requirePermission(Permissions.PURCHASE_ORDERS_WRITE),
    validateRequest({
      params: purchaseOrderOrgParamsSchema,
      body: createPurchaseOrderSchema,
    }),
    controller.createPurchaseOrder,
  );

  // GET / - List purchase orders with filters (OWNER, ADMIN, MEMBER)
  router.get(
    "/",
    requirePermission(Permissions.PURCHASE_ORDERS_READ),
    validateRequest({
      params: purchaseOrderOrgParamsSchema,
      query: listPurchaseOrdersQuerySchema,
    }),
    controller.listPurchaseOrders,
  );

  // GET /:purchaseOrderId - Get purchase order details (OWNER, ADMIN, MEMBER)
  router.get(
    "/:purchaseOrderId",
    requirePermission(Permissions.PURCHASE_ORDERS_READ),
    validateRequest({
      params: purchaseOrderRouteParamsSchema,
    }),
    controller.getPurchaseOrder,
  );

  // PATCH /:purchaseOrderId - Update draft purchase order (OWNER, ADMIN)
  router.patch(
    "/:purchaseOrderId",
    requirePermission(Permissions.PURCHASE_ORDERS_WRITE),
    validateRequest({
      params: purchaseOrderRouteParamsSchema,
      body: updatePurchaseOrderSchema,
    }),
    controller.updatePurchaseOrder,
  );

  // POST /:purchaseOrderId/submit - Submit purchase order for approval (OWNER, ADMIN)
  router.post(
    "/:purchaseOrderId/submit",
    requirePermission(Permissions.PURCHASE_ORDERS_WRITE),
    validateRequest({
      params: purchaseOrderRouteParamsSchema,
    }),
    controller.submitPurchaseOrder,
  );

  // POST /:purchaseOrderId/approve - Approve purchase order (OWNER, ADMIN)
  router.post(
    "/:purchaseOrderId/approve",
    requirePermission(Permissions.PURCHASE_ORDERS_WRITE),
    validateRequest({
      params: purchaseOrderRouteParamsSchema,
    }),
    controller.approvePurchaseOrder,
  );

  // POST /:purchaseOrderId/cancel - Cancel eligible purchase order (OWNER, ADMIN)
  router.post(
    "/:purchaseOrderId/cancel",
    requirePermission(Permissions.PURCHASE_ORDERS_WRITE),
    validateRequest({
      params: purchaseOrderRouteParamsSchema,
    }),
    controller.cancelPurchaseOrder,
  );

  // POST /:purchaseOrderId/receipts - Record delivery receipt and sync inventory (OWNER, ADMIN)
  router.post(
    "/:purchaseOrderId/receipts",
    requirePermission(Permissions.PURCHASE_ORDERS_WRITE),
    validateRequest({
      params: purchaseOrderRouteParamsSchema,
      body: receivePurchaseOrderItemsSchema,
    }),
    controller.receiveItems,
  );

  return router;
}

export const purchaseOrderRouter = createPurchaseOrderRouter();
