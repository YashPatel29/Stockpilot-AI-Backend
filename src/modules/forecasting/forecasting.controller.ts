import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { ForecastingService, forecastingService } from "./forecasting.service";
import type { CreateDemandForecastSchema, ListForecastRunsQuery } from "./forecasting.schema";

/**
 * Controller exposing demand forecasting and backtesting endpoints.
 */
export class ForecastingController {
  constructor(private readonly service: ForecastingService = forecastingService) {}

  /**
   * POST /api/v1/organizations/:organizationId/forecasts/demand
   */
  public generateForecast = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const input = req.body as CreateDemandForecastSchema;

      const result = await this.service.generateForecast({
        organizationId,
        userId,
        input,
      });

      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/forecasts/demand
   */
  public listForecastRuns = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListForecastRunsQuery;

      const result = await this.service.listForecastRuns(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/forecasts/demand/:forecastId
   */
  public getForecastRun = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const forecastId = req.params["forecastId"] as string;

      const result = await this.service.getForecastRun(organizationId, forecastId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/forecasts/demand/:forecastId/evaluation
   */
  public getForecastEvaluation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const forecastId = req.params["forecastId"] as string;

      const result = await this.service.getForecastEvaluation(organizationId, forecastId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const forecastingController = new ForecastingController();
