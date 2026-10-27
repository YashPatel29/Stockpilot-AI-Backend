import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { PurchaseOrderService, purchaseOrderService } from "./purchase-order.service";
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ReceivePurchaseOrderItemsInput,
  ListPurchaseOrdersQuery,
} from "./purchase-order.schema";

/**
 * Controller handling purchase order lifecycle and procurement delivery endpoints.
 */
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService = purchaseOrderService) {}

  /**
   * POST /api/v1/organizations/:organizationId/purchase-orders
   */
  public createPurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = req.user!.id;
      const input = req.body as CreatePurchaseOrderInput;

      const po = await this.service.createPurchaseOrder(organizationId, userId, input);
      sendSuccess(res, po, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId
   */
  public getPurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const purchaseOrderId = req.params["purchaseOrderId"] as string;

      const po = await this.service.getPurchaseOrderById(organizationId, purchaseOrderId);
      sendSuccess(res, po, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/purchase-orders
   */
  public listPurchaseOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListPurchaseOrdersQuery;

      const result = await this.service.listPurchaseOrders(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId
   */
  public updatePurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const purchaseOrderId = req.params["purchaseOrderId"] as string;
      const input = req.body as UpdatePurchaseOrderInput;

      const po = await this.service.updatePurchaseOrder(organizationId, purchaseOrderId, input);
      sendSuccess(res, po, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/submit
   */
  public submitPurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const purchaseOrderId = req.params["purchaseOrderId"] as string;

      const po = await this.service.submitPurchaseOrder(organizationId, purchaseOrderId);
      sendSuccess(res, po, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/approve
   */
  public approvePurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const purchaseOrderId = req.params["purchaseOrderId"] as string;
      const userId = req.user!.id;

      const po = await this.service.approvePurchaseOrder(organizationId, userId, purchaseOrderId);
      sendSuccess(res, po, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/cancel
   */
  public cancelPurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const purchaseOrderId = req.params["purchaseOrderId"] as string;

      const po = await this.service.cancelPurchaseOrder(organizationId, purchaseOrderId);
      sendSuccess(res, po, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/organizations/:organizationId/purchase-orders/:purchaseOrderId/receipts
   */
  public receiveItems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const purchaseOrderId = req.params["purchaseOrderId"] as string;
      const userId = req.user!.id;
      const input = req.body as ReceivePurchaseOrderItemsInput;

      const po = await this.service.receiveItems(organizationId, userId, purchaseOrderId, input);
      sendSuccess(res, po, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const purchaseOrderController = new PurchaseOrderController();
