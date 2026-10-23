import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";

describe("Swagger / OpenAPI Documentation (Integration)", () => {
  it("should serve OpenAPI 3.0.3 JSON schema at /docs.json", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      openapi: "3.0.3",
      info: {
        title: "StockPilot AI — Backend API",
        version: "1.0.0",
      },
      paths: expect.any(Object),
      components: expect.any(Object),
    });
  });

  it("should serve OpenAPI JSON schema at versioned /api/v1/docs.json", async () => {
    const response = await request(app).get("/api/v1/docs.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
  });

  it("should serve interactive Swagger UI HTML at /docs/", async () => {
    const response = await request(app).get("/docs/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain("swagger-ui");
  });

  it("should serve interactive Swagger UI HTML at /api-docs/", async () => {
    const response = await request(app).get("/api-docs/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain("swagger-ui");
  });
});
