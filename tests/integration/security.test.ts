import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";

describe("Security Baseline & HTTP Pipeline (Integration)", () => {
  it("should attach standard security headers via Helmet", async () => {
    const response = await request(app).get("/health/live");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-dns-prefetch-control"]).toBe("off");
    expect(response.headers["x-download-options"]).toBe("noopen");
    expect(response.headers["x-frame-options"]).toBeDefined();
    // X-Powered-By header should be removed
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("should preserve incoming correlation ID in X-Request-Id header", async () => {
    const customCorrelationId = "custom-client-trace-12345";
    const response = await request(app)
      .get("/health/live")
      .set("X-Request-Id", customCorrelationId);

    expect(response.headers["x-request-id"]).toBe(customCorrelationId);
  });

  it("should generate a valid UUID for X-Request-Id when none is provided", async () => {
    const response = await request(app).get("/health/live");

    const reqId = response.headers["x-request-id"];
    expect(reqId).toBeDefined();
    expect(typeof reqId).toBe("string");
    expect((reqId as string).length).toBeGreaterThan(10);
  });

  it("should return consistent 404 ApiErrorResponse for non-existent routes", async () => {
    const response = await request(app).get("/api/v1/non-existent-endpoint");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: expect.stringContaining("does not exist"),
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it("should support CORS headers for allowlisted frontend origins", async () => {
    const allowedOrigin = "http://localhost:3000";
    const response = await request(app).get("/health/live").set("Origin", allowedOrigin);

    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});
