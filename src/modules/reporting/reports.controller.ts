import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { ReportsService, reportsService } from "./reports.service";
import type {
  WarehouseInventoryQuery,
  InventoryMovementsQuery,
  ProductInventoryQuery,
  LowStockQuery,
  PurchaseOrderReportQuery,
  RecentActivityQuery,
} from "./reporting.schema";

/**
 * Controller handling reporting endpoints for inventory, warehouse distribution, movements, and procurement.
 */
export class ReportsController {
  constructor(private readonly service: ReportsService = reportsService) {}

  /**
   * GET /api/v1/organizations/:organizationId/reports/inventory-by-warehouse
   */
  public getInventoryByWarehouse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as WarehouseInventoryQuery;

      const report = await this.service.getInventoryByWarehouse(organizationId, query);
      sendSuccess(res, report, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/reports/inventory-movements
   */
  public getInventoryMovements = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as InventoryMovementsQuery;

      const report = await this.service.getInventoryMovements(organizationId, query);
      sendSuccess(res, report, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/reports/product-inventory
   */
  public getProductInventory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ProductInventoryQuery;

      const report = await this.service.getProductInventory(organizationId, query);
      sendSuccess(res, report, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/reports/low-stock
   */
  public getLowStockReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as LowStockQuery;

      const report = await this.service.getLowStockReport(organizationId, query);
      sendSuccess(res, report, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/reports/purchase-orders
   */
  public getPurchaseOrderReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as PurchaseOrderReportQuery;

      const report = await this.service.getPurchaseOrderReport(organizationId, query);
      sendSuccess(res, report, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/reports/recent-activity
   */
  public getRecentActivity = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as RecentActivityQuery;

      const report = await this.service.getRecentActivity(organizationId, query);
      sendSuccess(res, report, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const reportsController = new ReportsController();
