import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { appConfig } from "../../config/app.config";
import { HttpStatus } from "../constants/http-status";
import { ErrorCodes } from "../errors/error-codes";
import { sendError } from "../utils/response.util";

/**
 * Global rate-limiting middleware.
 * Defends public endpoints against brute-force attacks and abuse.
 */
export const apiRateLimiter = rateLimit({
  windowMs: appConfig.security.rateLimit.windowMs,
  max: appConfig.security.rateLimit.max,
  standardHeaders: true, // Draft-6 RateLimit headers
  legacyHeaders: false, // Disable X-RateLimit headers
  handler: (req: Request, res: Response) => {
    sendError(
      res,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCodes.TOO_MANY_REQUESTS,
      "Too many requests from this IP. Please try again after 15 minutes.",
      req.id ? String(req.id) : "unknown",
    );
  },
});
