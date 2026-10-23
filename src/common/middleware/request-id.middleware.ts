import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that ensures every HTTP request has a unique correlation ID.
 * Reads X-Request-Id header if supplied by an upstream reverse proxy (e.g. ALB, Nginx, Cloudflare),
 * otherwise generates a new RFC 4122 v4 UUID.
 * Sets the ID on the request object and the response header.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const requestId =
    typeof incomingId === "string" && incomingId.trim().length > 0
      ? incomingId.trim()
      : crypto.randomUUID();

  req.id = requestId;
  req.startTime = process.hrtime();
  res.setHeader("X-Request-Id", requestId);

  next();
}
