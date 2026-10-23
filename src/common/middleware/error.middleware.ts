import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";
import { HttpStatus, type HttpStatusCode } from "../constants/http-status";
import { ErrorCodes } from "../errors/error-codes";
import { sendError } from "../utils/response.util";
import { logger } from "../../infrastructure/logging/logger";
import { appConfig } from "../../config/app.config";

/**
 * Global Error Handling Middleware.
 * Intercepts all errors thrown across the application, normalizes them into
 * standard ApiErrorResponse structures, and ensures no sensitive data or stack traces
 * are exposed in production environments.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // Express requires 4 arguments to recognize an error-handling middleware
  _next: NextFunction,
): void {
  const requestId = req.id ? String(req.id) : "unknown";
  const isProd =
    appConfig.server.nodeEnv === "production" || appConfig.server.nodeEnv === "staging";

  let statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  let errorCode: string = ErrorCodes.INTERNAL_ERROR;
  let message: string = "An unexpected internal server error occurred.";
  let details: unknown = undefined;

  // 1. Handled Operational Application Errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    details = err.details;
  }
  // 2. Direct Zod Validation Errors
  else if (err instanceof ZodError) {
    statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
    errorCode = ErrorCodes.VALIDATION_ERROR;
    message = "Request validation failed.";
    details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
  }
  // 3. JSON Parser Syntax Errors (Malformed Body)
  else if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as { status?: number }).status === 400
  ) {
    statusCode = HttpStatus.BAD_REQUEST;
    errorCode = ErrorCodes.BAD_REQUEST;
    message = "Malformed JSON payload in request body.";
  }
  // 4. CORS Policy Violations
  else if (err.message && err.message.includes("CORS policy")) {
    statusCode = HttpStatus.FORBIDDEN;
    errorCode = ErrorCodes.FORBIDDEN;
    message = "Cross-origin request blocked by security policy.";
  }
  // 5. Prisma Database Errors
  else if (err.constructor.name === "PrismaClientKnownRequestError") {
    const prismaErr = err as { code?: string; meta?: Record<string, unknown> };
    if (prismaErr.code === "P2002") {
      statusCode = HttpStatus.CONFLICT;
      errorCode = ErrorCodes.CONFLICT;
      const target = (prismaErr.meta?.target as string[])?.join(", ") || "field";
      message = `A record with this ${target} already exists.`;
    } else if (prismaErr.code === "P2025") {
      statusCode = HttpStatus.NOT_FOUND;
      errorCode = ErrorCodes.NOT_FOUND;
      message = "Requested database record was not found.";
    } else {
      statusCode = HttpStatus.SERVICE_UNAVAILABLE;
      errorCode = ErrorCodes.DATABASE_ERROR;
      message = isProd ? "A database error occurred." : err.message;
    }
  }
  // 6. Unknown / Unhandled Programmer Errors
  else {
    statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    errorCode = ErrorCodes.INTERNAL_ERROR;
    message = isProd ? "An unexpected internal server error occurred." : err.message;
    if (!isProd) {
      details = { stack: err.stack };
    }
  }

  // Structured Logging with Correlation ID
  logger.error(
    {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      errorCode,
      err: {
        message: err.message,
        name: err.name,
        stack: isProd ? undefined : err.stack,
      },
    },
    `Request error: [${errorCode}] ${message}`,
  );

  sendError(res, statusCode, errorCode, message, requestId, details);
}
