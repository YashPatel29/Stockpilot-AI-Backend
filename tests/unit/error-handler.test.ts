import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { errorMiddleware } from "../../src/common/middleware/error.middleware";
import { BadRequestError, NotFoundError, ConflictError } from "../../src/common/errors/http-errors";
import { HttpStatus } from "../../src/common/constants/http-status";
import { ErrorCodes } from "../../src/common/errors/error-codes";

function createMockReqRes() {
  const req = {
    id: "test-req-id-123",
    method: "GET",
    originalUrl: "/test-endpoint",
  } as unknown as Request;

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: vi.fn(),
    status: vi.fn().mockImplementation(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn().mockImplementation(function (this: unknown, data: unknown) {
      return data;
    }),
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

describe("Centralized Error Handling Middleware", () => {
  it("should handle custom operational AppError subclasses", () => {
    const { req, res, next } = createMockReqRes();
    const error = new NotFoundError("User record not found");

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "User record not found",
        },
        requestId: "test-req-id-123",
        timestamp: expect.any(String),
      }),
    );
  });

  it("should handle BadRequestError with details payload", () => {
    const { req, res, next } = createMockReqRes();
    const details = [{ field: "sku", message: "SKU format is invalid" }];
    const error = new BadRequestError("Invalid payload", details);

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: ErrorCodes.BAD_REQUEST,
          message: "Invalid payload",
          details,
        },
      }),
    );
  });

  it("should handle ConflictError with 409 status code", () => {
    const { req, res, next } = createMockReqRes();
    const error = new ConflictError("Tenant slug is already taken");

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: ErrorCodes.CONFLICT,
        }),
      }),
    );
  });

  it("should translate direct ZodError instances into 422 VALIDATION_ERROR", () => {
    const { req, res, next } = createMockReqRes();

    const schema = z.object({ email: z.string().email() });
    let zodError: ZodError | null = null;
    try {
      schema.parse({ email: "invalid-email" });
    } catch (e) {
      zodError = e as ZodError;
    }

    expect(zodError).not.toBeNull();
    errorMiddleware(zodError!, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Request validation failed.",
          details: [
            {
              field: "email",
              message: "Invalid email",
            },
          ],
        },
      }),
    );
  });

  it("should handle JSON parser syntax errors with 400 Bad Request", () => {
    const { req, res, next } = createMockReqRes();
    const syntaxErr = new SyntaxError("Unexpected token in JSON");
    (syntaxErr as unknown as { status: number }).status = 400;

    errorMiddleware(syntaxErr, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: ErrorCodes.BAD_REQUEST,
          message: "Malformed JSON payload in request body.",
        }),
      }),
    );
  });
});
