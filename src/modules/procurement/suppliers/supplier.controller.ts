import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { SupplierService, supplierService } from "./supplier.service";
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
  ListSuppliersQuery,
} from "./supplier.schema";

/**
 * Controller handling supplier management endpoints.
 */
export class SupplierController {
  constructor(private readonly service: SupplierService = supplierService) {}

  /**
   * POST /api/v1/organizations/:organizationId/suppliers
   */
  public createSupplier = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const input = req.body as CreateSupplierInput;

      const supplier = await this.service.createSupplier(organizationId, input);
      sendSuccess(res, supplier, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/suppliers/:supplierId
   */
  public getSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const supplierId = req.params["supplierId"] as string;

      const supplier = await this.service.getSupplierById(organizationId, supplierId);
      sendSuccess(res, supplier, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/suppliers
   */
  public listSuppliers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListSuppliersQuery;

      const result = await this.service.listSuppliers(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/suppliers/:supplierId
   */
  public updateSupplier = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const supplierId = req.params["supplierId"] as string;
      const input = req.body as UpdateSupplierInput;

      const supplier = await this.service.updateSupplier(organizationId, supplierId, input);
      sendSuccess(res, supplier, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/suppliers/:supplierId
   */
  public deactivateSupplier = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const supplierId = req.params["supplierId"] as string;

      const supplier = await this.service.deactivateSupplier(organizationId, supplierId);
      sendSuccess(res, supplier, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const supplierController = new SupplierController();
