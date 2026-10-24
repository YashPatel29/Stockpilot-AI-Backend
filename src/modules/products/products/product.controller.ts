import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { ProductService, productService } from "./product.service";
import type { CreateProductInput, UpdateProductInput, ListProductsQuery } from "./product.schema";

/**
 * Controller handling product catalog endpoints.
 */
export class ProductController {
  constructor(private readonly service: ProductService = productService) {}

  /**
   * POST /api/v1/organizations/:organizationId/products
   */
  public createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const input = req.body as CreateProductInput;

      const product = await this.service.createProduct(organizationId, input);
      sendSuccess(res, product, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/products/:productId
   */
  public getProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const productId = req.params["productId"] as string;

      const product = await this.service.getProductById(organizationId, productId);
      sendSuccess(res, product, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/products
   */
  public listProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListProductsQuery;

      const result = await this.service.listProducts(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/products/:productId
   */
  public updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const productId = req.params["productId"] as string;
      const input = req.body as UpdateProductInput;

      const product = await this.service.updateProduct(organizationId, productId, input);
      sendSuccess(res, product, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/products/:productId (Soft Archive)
   */
  public archiveProduct = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const productId = req.params["productId"] as string;

      const product = await this.service.archiveProduct(organizationId, productId);
      sendSuccess(res, product, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const productController = new ProductController();
