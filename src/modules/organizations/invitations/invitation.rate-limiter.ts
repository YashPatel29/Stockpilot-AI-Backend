import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { appConfig } from "../../../config/app.config";
import { HttpStatus } from "../../../common/constants/http-status";
import { ErrorCodes } from "../../../common/errors/error-codes";
import { sendError } from "../../../common/utils/response.util";

/**
 * Dedicated rate limiter for organization invitation endpoints.
 * Guards against email spamming, token enumeration, and brute-force acceptance attempts.
 */
export const invitationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: appConfig.server.nodeEnv === "test" ? 10000 : 30, // 30 requests per 15 minutes in non-test environments
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    sendError(
      res,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCodes.TOO_MANY_REQUESTS,
      "Too many invitation requests. Please try again later.",
      req.id ? String(req.id) : "unknown",
    );
  },
});
