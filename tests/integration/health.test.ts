import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { databaseService } from "../../src/infrastructure/database/database.service";

describe("Health Probes & Telemetry Endpoints (Integration)", () => {
  describe("GET /health/live (Liveness Probe)", () => {
    it("should return 200 OK and status 'ok' confirming the process is alive", async () => {
      const response = await request(app).get("/health/live");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: "ok",
          uptimeSeconds: expect.any(Number),
        },
        timestamp: expect.any(String),
      });
      expect(response.headers["x-request-id"]).toBeDefined();
    });

    it("should succeed via the versioned API route /api/v1/health/live", async () => {
      const response = await request(app).get("/api/v1/health/live");

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("ok");
    });

    it("should succeed even if the database is completely unreachable", async () => {
      // Temporarily mock db health to simulate total database outage
      const dbSpy = vi.spyOn(databaseService, "isHealthy").mockResolvedValueOnce({
        isHealthy: false,
        message: "Connection refused on port 5432",
      });

      const response = await request(app).get("/health/live");

      // Liveness MUST still pass to prevent orchestrator crash-looping process
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("ok");

      dbSpy.mockRestore();
    });
  });

  describe("GET /health/ready (Readiness Probe)", () => {
    it("should return 200 OK when database dependency is healthy", async () => {
      const dbSpy = vi.spyOn(databaseService, "isHealthy").mockResolvedValueOnce({
        isHealthy: true,
        latencyMs: 3,
      });

      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: "ready",
          isReady: true,
          dependencies: {
            database: {
              status: "healthy",
              latencyMs: 3,
            },
          },
        },
      });

      dbSpy.mockRestore();
    });

    it("should return 503 Service Unavailable when database is unreachable", async () => {
      const dbSpy = vi.spyOn(databaseService, "isHealthy").mockResolvedValueOnce({
        isHealthy: false,
        message: "Timeout connecting to PostgreSQL",
      });

      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "One or more required dependencies are unavailable.",
          details: {
            database: {
              status: "unhealthy",
            },
          },
        },
        requestId: expect.any(String),
        timestamp: expect.any(String),
      });

      dbSpy.mockRestore();
    });
  });

  describe("GET /health (Detailed Health)", () => {
    it("should return system telemetry and status overview", async () => {
      const dbSpy = vi.spyOn(databaseService, "isHealthy").mockResolvedValueOnce({
        isHealthy: true,
        latencyMs: 2,
      });

      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: "healthy",
        version: "v1",
        uptimeSeconds: expect.any(Number),
        memory: {
          rssMb: expect.any(Number),
          heapTotalMb: expect.any(Number),
          heapUsedMb: expect.any(Number),
        },
        dependencies: {
          database: {
            status: "healthy",
          },
        },
      });

      dbSpy.mockRestore();
    });
  });
});
