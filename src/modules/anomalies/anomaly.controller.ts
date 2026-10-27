import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { AnomalyService, anomalyService } from "./anomaly.service";
import type {
  TriggerAnomalyDetectionSchema,
  ListAnomaliesQuery,
  ListDetectionRunsQuery,
  UpdateAnomalyStatusSchema,
} from "./anomaly.schema";

/**
 * Controller exposing inventory anomaly detection and review endpoints.
 */
export class AnomalyController {
  constructor(private readonly service: AnomalyService = anomalyService) {}

  /**
   * POST /api/v1/organizations/:organizationId/anomalies/detection-runs
   */
  public triggerDetectionRun = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const input = req.body as TriggerAnomalyDetectionSchema;

      const result = await this.service.triggerDetectionRun({
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
   * GET /api/v1/organizations/:organizationId/anomalies
   */
  public listAnomalies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListAnomaliesQuery;

      const result = await this.service.listAnomalies(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/anomalies/:anomalyId
   */
  public getAnomalyById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const anomalyId = req.params["anomalyId"] as string;

      const result = await this.service.getAnomalyById(organizationId, anomalyId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/anomalies/:anomalyId/status
   */
  public updateAnomalyStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const anomalyId = req.params["anomalyId"] as string;
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const input = req.body as UpdateAnomalyStatusSchema;

      const result = await this.service.updateAnomalyStatus({
        organizationId,
        anomalyId,
        userId,
        input,
      });

      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/anomalies/detection-runs
   */
  public listDetectionRuns = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListDetectionRunsQuery;

      const result = await this.service.listDetectionRuns(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/anomalies/detection-runs/:runId
   */
  public getDetectionRunById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const runId = req.params["runId"] as string;

      const result = await this.service.getDetectionRunById(organizationId, runId);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const anomalyController = new AnomalyController();
