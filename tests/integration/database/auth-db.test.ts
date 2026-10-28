import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../../src/app";
import { assertTestDatabaseConnection, getTestPrisma } from "../../helpers/test-db-guard";
import { createTestUser } from "../../helpers/test-factories";
import { verifyPassword } from "../../../src/common/utils/password.util";

describe("Authentication & Account Lifecycle against PostgreSQL (Integration DB)", () => {
  const prisma = getTestPrisma();
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    // Assert strictly connected to stockpilot_test
    const dbName = await assertTestDatabaseConnection(prisma);
    expect(dbName).toContain("test");
  });

  afterAll(async () => {
    // Clean up created test users
    if (createdUserIds.length > 0) {
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it("should register a new user in PostgreSQL with bcrypt hash and return safe DTO with HttpOnly cookie", async () => {
    const email = `reg-test-${Date.now()}@stockpilot-test.internal`;
    const password = "ValidP@ssword123!";

    const response = await request(app).post("/api/v1/auth/register").send({
      name: "Real DB User",
      email,
      password,
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.status).toBe("ACTIVE");
    expect(response.body.data.user.password).toBeUndefined();
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toBeDefined();

    const userId = response.body.data.user.id;
    createdUserIds.push(userId);

    // Verify row was truly written to PostgreSQL
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    expect(dbUser).toBeDefined();
    expect(dbUser?.email).toBe(email);

    // Verify password was securely hashed with bcrypt
    const passwordValid = await verifyPassword(password, dbUser!.passwordHash);
    expect(passwordValid).toBe(true);

    // Verify refresh token was created in PostgreSQL with a familyId
    const refreshTokens = await prisma.refreshToken.findMany({
      where: { userId },
    });
    expect(refreshTokens.length).toBe(1);
    expect(refreshTokens[0]?.familyId).toBeDefined();
    expect(refreshTokens[0]?.revokedAt).toBeNull();

    // Verify HttpOnly cookie was set
    const cookies = response.headers["set-cookie"] as string[] | undefined;
    expect(cookies).toBeDefined();
    expect(cookies?.[0]).toMatch(/stockpilot_refresh_token=/);
    expect(cookies?.[0]).toMatch(/HttpOnly/i);
  });

  it("should authenticate an existing user against PostgreSQL credentials and issue new session", async () => {
    const { user, rawPassword } = await createTestUser(prisma);
    createdUserIds.push(user.id);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: rawPassword,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.accessToken).toBeDefined();

    const cookies = response.headers["set-cookie"] as string[] | undefined;
    expect(cookies).toBeDefined();
    expect(cookies?.[0]).toMatch(/stockpilot_refresh_token=/);
  });

  it("should rotate refresh token in PostgreSQL and track token family chain", async () => {
    const { user, rawPassword } = await createTestUser(prisma);
    createdUserIds.push(user.id);

    // Login to get initial refresh token
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: rawPassword,
    });
    const cookieHeader = loginRes.headers["set-cookie"];
    const loginCookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader) ?? "";
    const originalToken = loginCookie.split(";")[0]?.split("=")[1];

    expect(originalToken).toBeDefined();

    // First refresh: rotates token
    const refreshRes = await request(app).post("/api/v1/auth/refresh").set("Cookie", [loginCookie]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    // Verify old token is marked revoked in PostgreSQL
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    const oldTokenRecord = tokens[0];
    const newTokenRecord = tokens[tokens.length - 1];

    expect(oldTokenRecord?.revokedAt).not.toBeNull();
    expect(oldTokenRecord?.replacedByTokenHash).toBe(newTokenRecord?.tokenHash);
    expect(newTokenRecord?.familyId).toBe(oldTokenRecord?.familyId);
    expect(newTokenRecord?.revokedAt).toBeNull();
  });

  it("should trigger OWASP Token Family Invalidation when a rotated refresh token is reused", async () => {
    const { user, rawPassword } = await createTestUser(prisma);
    createdUserIds.push(user.id);

    // Initial login
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: rawPassword,
    });
    const rawCookieHeader = loginRes.headers["set-cookie"];
    const originalCookie =
      (Array.isArray(rawCookieHeader) ? rawCookieHeader[0] : rawCookieHeader) ?? "";

    // Legitimate client rotates token
    const firstRefreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [originalCookie]);
    expect(firstRefreshRes.status).toBe(200);

    // Attacker attempts to reuse original (now rotated) token
    const attackRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [originalCookie]);

    expect(attackRes.status).toBe(401);
    expect(attackRes.body.success).toBe(false);

    // Verify that ALL tokens in the family have now been revoked in PostgreSQL
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    for (const token of tokens) {
      expect(token.revokedAt).not.toBeNull();
    }
  });

  it("should reject access tokens immediately when user status is changed to INACTIVE in PostgreSQL", async () => {
    const { user, token } = await createTestUser(prisma);
    createdUserIds.push(user.id);

    // Initially valid
    const validRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(validRes.status).toBe(200);

    // Deactivate user directly in PostgreSQL
    await prisma.user.update({
      where: { id: user.id },
      data: { status: "INACTIVE" },
    });

    // Subsequent request with the same unexpired token must fail
    const revokedRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(revokedRes.status).toBe(401);
    expect(revokedRes.body.success).toBe(false);
    expect(revokedRes.body.error.code).toBe("UNAUTHORIZED");
  });
});
