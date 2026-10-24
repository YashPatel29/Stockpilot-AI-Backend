import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { InventoryService, inventoryService } from "./inventory.service";
import type {
  ReceiptInput,
  IssueInput,
  AdjustmentInput,
  TransferInput,
  ListBalancesQuery,
  ListTransactionsQuery,
} from "./inventory.schema";

/**
 * Controller handling HTTP requests for inventory balances and stock transaction mutations.
 */
export class InventoryController {
  constructor(private readonly service: InventoryService = inventoryService) {}

  /**
   * GET /api/v1/organizations/:organizationId/inventory/balances
   * Lists inventory balances across products and storage locations.
   */
  public listBalances = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListBalancesQuery;

      const result = await this.service.listBalances(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/inventory/receipts
   * Receives incoming stock into a storage location.
   */
  public receiveStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = req.user!.id;
      const input = req.body as ReceiptInput;

      const result = await this.service.receiveStock(organizationId, userId, input);
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/inventory/issues
   * Issues outgoing stock from a storage location.
   */
  public issueStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = req.user!.id;
      const input = req.body as IssueInput;

      const result = await this.service.issueStock(organizationId, userId, input);
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/inventory/adjustments
   * Adjusts stock quantity at a storage location with signed delta.
   */
  public adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = req.user!.id;
      const input = req.body as AdjustmentInput;

      const result = await this.service.adjustStock(organizationId, userId, input);
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/inventory/transfers
   * Transfers stock between distinct locations atomically.
   */
  public transferStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = req.user!.id;
      const input = req.body as TransferInput;

      const result = await this.service.transferStock(organizationId, userId, input);
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/inventory/transactions
   * Retrieves paginated historical audit ledger of inventory movements.
   */
  public listTransactions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListTransactionsQuery;

      const result = await this.service.listTransactions(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const inventoryController = new InventoryController();
