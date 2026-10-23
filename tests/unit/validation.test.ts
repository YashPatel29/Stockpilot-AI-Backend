import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { validateRequest } from "../../src/common/middleware/validate.middleware";
import { ValidationError } from "../../src/common/errors/http-errors";

describe("Request Validation Middleware", () => {
  const schema = {
    body: z.object({
      name: z.string().min(2),
      quantity: z.number().int().positive(),
    }),
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
    }),
  };

  it("should pass validated and coerced data to next middleware", async () => {
    const req = {
      body: { name: "Widget A", quantity: 42 },
      query: { page: "3" },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    const middleware = validateRequest(schema);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "Widget A", quantity: 42 });
    expect(req.query).toEqual({ page: 3 });
  });

  it("should call next with ValidationError when body is invalid", async () => {
    const req = {
      body: { name: "W", quantity: -5 }, // Name too short, negative quantity
      query: { page: "1" },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    const middleware = validateRequest(schema);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    const mockCalls = (next as unknown as { mock: { calls: Array<[ValidationError]> } }).mock.calls;
    const passedError = mockCalls[0]?.[0];
    expect(passedError).toBeDefined();
    expect(passedError?.statusCode).toBe(422);
    expect(Array.isArray(passedError?.details)).toBe(true);
  });
});
