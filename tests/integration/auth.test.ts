import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import type { RefreshToken, User } from "@prisma/client";
import { app } from "../../src/app";
import { prisma } from "../../src/infrastructure/database/prisma.client";
import { hashPassword } from "../../src/common/utils/password.util";
import { signAccessToken, signRefreshToken } from "../../src/common/utils/token.util";

type RefreshTokenWithUser = RefreshToken & { user: User };

describe("Authentication & Account Management API (Integration)", () => {
  const sampleUser = {
    id: "usr-int-1234",
    name: "Elena Rostova",
    email: "elena@stockpilot.ai",
    passwordHash: "",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    sampleUser.passwordHash = await hashPassword("ComplexP@ssw0rd99");
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a new account, return 201 Created, safe user DTO, and HttpOnly cookie", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(null);
      vi.spyOn(prisma.user, "create").mockResolvedValueOnce(sampleUser);
      vi.spyOn(prisma.refreshToken, "create").mockResolvedValueOnce({
        id: "rt-1",
        tokenHash: "hash-1",
        userId: sampleUser.id,
        familyId: "fam-1",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
        createdAt: new Date(),
        replacedByTokenHash: null,
      });

      const response = await request(app).post("/api/v1/auth/register").send({
        name: "Elena Rostova",
        email: "elena@stockpilot.ai",
        password: "ComplexP@ssw0rd99",
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: sampleUser.id,
            name: sampleUser.name,
            email: sampleUser.email,
            status: "ACTIVE",
          },
          accessToken: expect.any(String),
        },
        timestamp: expect.any(String),
      });

      // Strict security invariant: password or passwordHash must NEVER be in response
      expect(response.body.data.user.password).toBeUndefined();
      expect(response.body.data.user.passwordHash).toBeUndefined();

      // Verify HttpOnly cookie header
      const cookies = response.headers["set-cookie"] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toMatch(/stockpilot_refresh_token=/);
      expect(cookies?.[0]).toMatch(/HttpOnly/i);
      expect(cookies?.[0]).toMatch(/Path=\/api\/v1\/auth/i);
    });

    it("should return 409 Conflict if email is already registered", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(sampleUser);

      const response = await request(app).post("/api/v1/auth/register").send({
        name: "Elena Rostova",
        email: "elena@stockpilot.ai",
        password: "ComplexP@ssw0rd99",
      });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("should return 422 Unprocessable Entity when validation fails (invalid email & short password)", async () => {
      const response = await request(app).post("/api/v1/auth/register").send({
        name: "E", // Too short (min 2)
        email: "not-an-email",
        password: "123", // Too short (min 8)
      });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toBeInstanceOf(Array);
      expect(response.body.error.details.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("should authenticate successfully with correct credentials and return 200 OK", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(sampleUser);
      vi.spyOn(prisma.refreshToken, "create").mockResolvedValueOnce({
        id: "rt-1",
        tokenHash: "hash-1",
        userId: sampleUser.id,
        familyId: "fam-1",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
        createdAt: new Date(),
        replacedByTokenHash: null,
      });

      const response = await request(app).post("/api/v1/auth/login").send({
        email: "elena@stockpilot.ai",
        password: "ComplexP@ssw0rd99",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(sampleUser.id);
      expect(response.body.data.accessToken).toBeDefined();

      const cookies = response.headers["set-cookie"] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toMatch(/stockpilot_refresh_token=/);
      expect(cookies?.[0]).toMatch(/HttpOnly/i);
    });

    it("should return generic 401 Unauthorized on wrong password", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(sampleUser);

      const response = await request(app).post("/api/v1/auth/login").send({
        email: "elena@stockpilot.ai",
        password: "WrongPassword999",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
      expect(response.body.error.message).toBe("Invalid email or password.");
    });

    it("should return generic 401 Unauthorized for non-existent email", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(null);

      const response = await request(app).post("/api/v1/auth/login").send({
        email: "ghost@stockpilot.ai",
        password: "AnyPassword123",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("Invalid email or password.");
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("should return 200 OK and profile when valid Bearer token is provided", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(sampleUser);

      const accessToken = signAccessToken({
        sub: sampleUser.id,
        email: sampleUser.email,
        name: sampleUser.name,
      });

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toEqual({
        id: sampleUser.id,
        name: sampleUser.name,
        email: sampleUser.email,
        status: "ACTIVE",
        createdAt: sampleUser.createdAt.toISOString(),
        updatedAt: sampleUser.updatedAt.toISOString(),
      });
      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    it("should return 401 Unauthorized when Authorization header is missing", async () => {
      const response = await request(app).get("/api/v1/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
      expect(response.body.error.message).toMatch(/missing/i);
    });

    it("should return 401 Unauthorized when Bearer token is invalid", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid-tampered-token");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("should rotate valid refresh token from cookie and issue replacement pair", async () => {
      const rawRefreshToken = signRefreshToken({
        sub: sampleUser.id,
        familyId: "fam-valid-1",
        jti: "jti-1",
      });

      vi.spyOn(prisma.refreshToken, "findUnique").mockResolvedValueOnce({
        id: "rt-record-1",
        tokenHash: "hashed-token-1",
        userId: sampleUser.id,
        familyId: "fam-valid-1",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
        createdAt: new Date(),
        replacedByTokenHash: null,
        user: sampleUser,
      } as unknown as RefreshTokenWithUser);

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) => {
        return (callback as (tx: unknown) => Promise<unknown>)(prisma);
      });
      vi.spyOn(prisma.refreshToken, "update").mockResolvedValueOnce({} as RefreshToken);
      vi.spyOn(prisma.refreshToken, "create").mockResolvedValueOnce({} as RefreshToken);

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`stockpilot_refresh_token=${rawRefreshToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.id).toBe(sampleUser.id);

      // Verify new rotated cookie was sent
      const cookies = response.headers["set-cookie"] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toMatch(/stockpilot_refresh_token=/);
    });

    it("should return 401 Unauthorized and revoke entire family when rotated token reuse is detected", async () => {
      const rawRefreshToken = signRefreshToken({
        sub: sampleUser.id,
        familyId: "fam-stolen",
        jti: "jti-reused",
      });

      // Token was already revoked/replaced
      vi.spyOn(prisma.refreshToken, "findUnique").mockResolvedValueOnce({
        id: "rt-reused",
        tokenHash: "reused-hash",
        userId: sampleUser.id,
        familyId: "fam-stolen",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: new Date(Date.now() - 5000), // Already revoked!
        createdAt: new Date(),
        replacedByTokenHash: "newer-token-hash",
        user: sampleUser,
      } as unknown as RefreshTokenWithUser);

      const updateManySpy = vi
        .spyOn(prisma.refreshToken, "updateMany")
        .mockResolvedValueOnce({ count: 2 });

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`stockpilot_refresh_token=${rawRefreshToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toMatch(/compromised/i);

      // Entire family must have been revoked
      expect(updateManySpy).toHaveBeenCalledWith({
        where: { familyId: "fam-stolen" },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("should return 401 Unauthorized when refresh token is missing", async () => {
      const response = await request(app).post("/api/v1/auth/refresh");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should revoke session in database and clear refresh cookie", async () => {
      const rawRefreshToken = signRefreshToken({
        sub: sampleUser.id,
        familyId: "fam-logout",
        jti: "jti-logout",
      });

      const updateManySpy = vi
        .spyOn(prisma.refreshToken, "updateMany")
        .mockResolvedValueOnce({ count: 1 });

      const response = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", [`stockpilot_refresh_token=${rawRefreshToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe("Logged out successfully.");

      expect(updateManySpy).toHaveBeenCalledWith({
        where: expect.objectContaining({ revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });

      // Confirm cookie was cleared (expires in past / empty)
      const cookies = response.headers["set-cookie"] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toMatch(/stockpilot_refresh_token=;/);
    });
  });

  describe("Security & Rate Limiting Behavior", () => {
    it("should reject brute force attempts with 429 Too Many Requests when limit is exceeded", async () => {
      const rateLimit = (await import("express-rate-limit")).default;
      const express = (await import("express")).default;
      const { sendError } = await import("../../src/common/utils/response.util");
      const { HttpStatus } = await import("../../src/common/constants/http-status");
      const { ErrorCodes } = await import("../../src/common/errors/error-codes");

      const testApp = express();
      testApp.use(
        rateLimit({
          windowMs: 60 * 1000,
          max: 2,
          handler: (_req, res) => {
            sendError(
              res,
              HttpStatus.TOO_MANY_REQUESTS,
              ErrorCodes.TOO_MANY_REQUESTS,
              "Too many authentication attempts. Please try again later.",
              "rate-limited-req",
            );
          },
        }),
      );
      testApp.post("/test-auth", (_req, res) => res.status(200).json({ ok: true }));

      // Request 1: OK
      const r1 = await request(testApp).post("/test-auth");
      expect(r1.status).toBe(200);

      // Request 2: OK
      const r2 = await request(testApp).post("/test-auth");
      expect(r2.status).toBe(200);

      // Request 3: Throttled (429)
      const r3 = await request(testApp).post("/test-auth");
      expect(r3.status).toBe(429);
      expect(r3.body).toMatchObject({
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: expect.stringContaining("Too many authentication attempts"),
        },
      });
    });
  });
});
