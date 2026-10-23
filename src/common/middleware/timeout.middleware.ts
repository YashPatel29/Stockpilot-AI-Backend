import type { Request, Response, NextFunction } from "express";
import { RequestTimeoutError } from "../errors/http-errors";

/**
 * Middleware that establishes a sensible timeout for incoming HTTP requests.
 * Prevents hanging connections from exhausting socket pools.
 */
export function requestTimeoutMiddleware(timeoutMs: number = 30000) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        next(new RequestTimeoutError(`Request exceeded the timeout limit of ${timeoutMs}ms.`));
      }
    }, timeoutMs);

    // Clear timeout timer when response finishes or connection closes
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));

    next();
  };
}
