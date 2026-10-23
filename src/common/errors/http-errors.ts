import { AppError } from "./app-error";
import { HttpStatus } from "../constants/http-status";
import { ErrorCodes } from "./error-codes";

export class BadRequestError extends AppError {
  constructor(message: string = "Bad Request", details?: unknown) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCodes.BAD_REQUEST, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Validation Failed", details?: unknown) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, ErrorCodes.VALIDATION_ERROR, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", details?: unknown) {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden", details?: unknown) {
    super(message, HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource Not Found", details?: unknown) {
    super(message, HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource Conflict", details?: unknown) {
    super(message, HttpStatus.CONFLICT, ErrorCodes.CONFLICT, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = "Too many requests. Please try again later.", details?: unknown) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.TOO_MANY_REQUESTS, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal Server Error", details?: unknown) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCodes.INTERNAL_ERROR, details, false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = "Service Temporarily Unavailable", details?: unknown) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, ErrorCodes.SERVICE_UNAVAILABLE, details);
  }
}

export class RequestTimeoutError extends AppError {
  constructor(message: string = "Request Timeout", details?: unknown) {
    super(message, HttpStatus.GATEWAY_TIMEOUT, ErrorCodes.TIMEOUT, details);
  }
}
