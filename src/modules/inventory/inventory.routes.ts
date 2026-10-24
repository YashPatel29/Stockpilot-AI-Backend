import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate.middleware";
import { requireOrgMember } from "../organizations/organization.middleware";
import { requirePermission } from "../organizations/rbac/rbac.middleware";
import { Permissions } from "../organizations/rbac/permissions";
import { InventoryController, inventoryController } from "./inventory.controller";
import {
  inventoryOrgParamsSchema,
  receiptSchema,
  issueSchema,
  adjustmentSchema,
  transferSchema,
  listBalancesQuerySchema,
  listTransactionsQuerySchema,
} from "./inventory.schema";

/**
 * Creates and configures routes for inventory balances and stock transaction mutations.
 * Mounted under: /api/v1/organizations/:organizationId/inventory
 */
export function createInventoryRouter(
  controller: InventoryController = inventoryController,
): Router {
  const router = Router({ mergeParams: true });

  // All inventory routes require active membership in the target organization
  router.use(requireOrgMember);

  // GET /balances - List inventory balances (OWNER, ADMIN, MEMBER)
  router.get(
    "/balances",
    requirePermission(Permissions.INVENTORY_BALANCES_READ),
    validateRequest({
      params: inventoryOrgParamsSchema,
      query: listBalancesQuerySchema,
    }),
    controller.listBalances,
  );

  // POST /receipts - Receive incoming stock into location (OWNER, ADMIN)
  router.post(
    "/receipts",
    requirePermission(Permissions.INVENTORY_TRANSACTIONS_WRITE),
    validateRequest({
      params: inventoryOrgParamsSchema,
      body: receiptSchema,
    }),
    controller.receiveStock,
  );

  // POST /issues - Issue outgoing stock from location (OWNER, ADMIN)
  router.post(
    "/issues",
    requirePermission(Permissions.INVENTORY_TRANSACTIONS_WRITE),
    validateRequest({
      params: inventoryOrgParamsSchema,
      body: issueSchema,
    }),
    controller.issueStock,
  );

  // POST /adjustments - Adjust stock quantity at location (OWNER, ADMIN)
  router.post(
    "/adjustments",
    requirePermission(Permissions.INVENTORY_TRANSACTIONS_WRITE),
    validateRequest({
      params: inventoryOrgParamsSchema,
      body: adjustmentSchema,
    }),
    controller.adjustStock,
  );

  // POST /transfers - Transfer stock between distinct locations (OWNER, ADMIN)
  router.post(
    "/transfers",
    requirePermission(Permissions.INVENTORY_TRANSACTIONS_WRITE),
    validateRequest({
      params: inventoryOrgParamsSchema,
      body: transferSchema,
    }),
    controller.transferStock,
  );

  // GET /transactions - List audit history of inventory transactions (OWNER, ADMIN, MEMBER)
  router.get(
    "/transactions",
    requirePermission(Permissions.INVENTORY_TRANSACTIONS_READ),
    validateRequest({
      params: inventoryOrgParamsSchema,
      query: listTransactionsQuerySchema,
    }),
    controller.listTransactions,
  );

  return router;
}

export const inventoryRouter = createInventoryRouter();
