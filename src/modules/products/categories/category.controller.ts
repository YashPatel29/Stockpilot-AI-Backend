import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { CategoryService, categoryService } from "./category.service";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ListCategoriesQuery,
} from "./category.schema";

/**
 * Controller handling product category catalog endpoints.
 */
export class CategoryController {
  constructor(private readonly service: CategoryService = categoryService) {}

  /**
   * POST /api/v1/organizations/:organizationId/categories
   */
  public createCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const input = req.body as CreateCategoryInput;

      const category = await this.service.createCategory(organizationId, input);
      sendSuccess(res, category, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/categories/:categoryId
   */
  public getCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const categoryId = req.params["categoryId"] as string;

      const category = await this.service.getCategoryById(organizationId, categoryId);
      sendSuccess(res, category, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/categories
   */
  public listCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListCategoriesQuery;

      const result = await this.service.listCategories(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/categories/:categoryId
   */
  public updateCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const categoryId = req.params["categoryId"] as string;
      const input = req.body as UpdateCategoryInput;

      const category = await this.service.updateCategory(organizationId, categoryId, input);
      sendSuccess(res, category, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/categories/:categoryId
   */
  public deleteCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const categoryId = req.params["categoryId"] as string;

      const result = await this.service.deleteCategory(organizationId, categoryId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const categoryController = new CategoryController();
