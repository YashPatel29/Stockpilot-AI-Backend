import type { Response } from "express";
import { HttpStatus, type HttpStatusCode } from "../constants/http-status";
import type { ApiSuccessResponse, ApiErrorResponse } from "../types/api-response.type";

/**
 * Standard utility to send successful responses conforming to ApiSuccessResponse.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: HttpStatusCode = HttpStatus.OK,
  meta?: Record<string, unknown>,
): Response {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(payload);
}

/**
 * Standard utility to send error responses conforming to ApiErrorResponse.
 */
export function sendError(
  res: Response,
  statusCode: HttpStatusCode,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): Response {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
    requestId,
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(payload);
}
