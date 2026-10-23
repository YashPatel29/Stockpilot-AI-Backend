import type { HttpStatusCode } from "../constants/http-status";
import type { ErrorCode } from "./error-codes";

/**
 * Base Application Error class.
 * All operational domain and HTTP errors derive from this class.
 * Operational errors are expected issues (e.g. invalid input, item not found, unauthorized)
 * as opposed to unhandled programmer errors/bugs (e.g. syntax error, undefined reference).
 */
export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: HttpStatusCode,
    code: ErrorCode,
    details?: unknown,
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    // Capture standard V8 stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}
