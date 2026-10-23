import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { appConfig } from "../../config/app.config";
import { HttpStatus } from "../../common/constants/http-status";
import { ErrorCodes } from "../../common/errors/error-codes";
import { sendError } from "../../common/utils/response.util";

/**
 * Dedicated rate limiter for authentication endpoints (login, registration, refresh).
 * Guards against brute-force credential stuffing and denial of service.
 */
export const authRateLimiter = rateLimit({
  windowMs: appConfig.auth.rateLimit.windowMs,
  max: appConfig.auth.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    sendError(
      res,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCodes.TOO_MANY_REQUESTS,
      "Too many authentication attempts. Please try again later.",
      req.id ? String(req.id) : "unknown",
    );
  },
});
