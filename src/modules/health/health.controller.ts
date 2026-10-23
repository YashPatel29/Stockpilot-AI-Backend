import type { Request, Response, NextFunction } from "express";
import { HealthService, healthService } from "./health.service";
import { HttpStatus } from "../../common/constants/http-status";
import { ErrorCodes } from "../../common/errors/error-codes";
import { sendSuccess, sendError } from "../../common/utils/response.util";

/**
 * Health Controller handling HTTP routing translations for liveness and readiness probes.
 */
export class HealthController {
  constructor(private readonly service: HealthService = healthService) {}

  /**
   * GET /health/live
   * Liveness probe: returns 200 OK immediately if the process is responsive.
   */
  public getLiveness = (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = this.service.getLiveness();
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /health/ready
   * Readiness probe: returns 200 OK if dependencies are ready, or 503 if dependencies fail.
   */
  public getReadiness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getReadiness();

      if (!result.isReady) {
        sendError(
          res,
          HttpStatus.SERVICE_UNAVAILABLE,
          ErrorCodes.SERVICE_UNAVAILABLE,
          "One or more required dependencies are unavailable.",
          req.id ? String(req.id) : "unknown",
          result.dependencies,
        );
        return;
      }

      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /health
   * Detailed health check endpoint.
   */
  public getSystemHealth = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.service.getSystemHealth();
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const healthController = new HealthController();
