import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { WarehouseService, warehouseService } from "./warehouse.service";
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  ListWarehousesQuery,
} from "./warehouse.schema";

/**
 * Controller handling warehouse facility endpoints.
 */
export class WarehouseController {
  constructor(private readonly service: WarehouseService = warehouseService) {}

  /**
   * POST /api/v1/organizations/:organizationId/warehouses
   */
  public createWarehouse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const input = req.body as CreateWarehouseInput;

      const warehouse = await this.service.createWarehouse(organizationId, input);
      sendSuccess(res, warehouse, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/warehouses/:warehouseId
   */
  public getWarehouse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;

      const warehouse = await this.service.getWarehouseById(organizationId, warehouseId);
      sendSuccess(res, warehouse, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/warehouses
   */
  public listWarehouses = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListWarehousesQuery;

      const result = await this.service.listWarehouses(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/warehouses/:warehouseId
   */
  public updateWarehouse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;
      const input = req.body as UpdateWarehouseInput;

      const warehouse = await this.service.updateWarehouse(organizationId, warehouseId, input);
      sendSuccess(res, warehouse, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/warehouses/:warehouseId (Deactivate)
   */
  public deactivateWarehouse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;

      const warehouse = await this.service.deactivateWarehouse(organizationId, warehouseId);
      sendSuccess(res, warehouse, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const warehouseController = new WarehouseController();
