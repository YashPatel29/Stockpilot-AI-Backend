import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/utils/response.util";
import { AuditService, auditService } from "./audit.service";
import type { ListAuditLogsQuery } from "./audit.schema";

/**
 * Controller handling organization audit logs retrieval.
 */
export class AuditController {
  constructor(private readonly service: AuditService = auditService) {}

  /**
   * GET /api/v1/organizations/:organizationId/audit-logs
   */
  public listAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const query = req.query as unknown as ListAuditLogsQuery;

      const result = await this.service.listAuditLogs(organizationId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const auditController = new AuditController();
