import type { Request, Response, NextFunction } from "express";
import { NotFoundError } from "../errors/http-errors";

/**
 * Fall-through 404 handler for routes that do not match any registered endpoints.
 */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Endpoint '${req.method} ${req.originalUrl}' does not exist.`));
}
