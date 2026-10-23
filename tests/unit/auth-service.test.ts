import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AuthService } from "../../src/modules/auth/auth.service";
import { ConflictError, UnauthorizedError } from "../../src/common/errors/http-errors";
import { hashPassword } from "../../src/common/utils/password.util";
import { signRefreshToken } from "../../src/common/utils/token.util";

describe("AuthService (Unit)", () => {
  let mockPrisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let authService: AuthService;

  const sampleUser = {
    id: "usr-uuid-1",
    name: "Alex Mercer",
    email: "alex@example.com",
    passwordHash: "",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    sampleUser.passwordHash = await hashPassword("StrongPassword123!");

    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({ id: "rt-1" }),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: "rt-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
          return callback(mockPrisma);
        }),
    };

    authService = new AuthService(mockPrisma as unknown as PrismaClient);
  });

  describe("register()", () => {
    it("should successfully register a new user, normalize email, and return safe DTO", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(sampleUser);

      const result = await authService.register({
        name: "  Alex Mercer  ",
        email: "  ALEX@Example.com ",
        password: "StrongPassword123!",
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "alex@example.com" },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Alex Mercer",
          email: "alex@example.com",
          status: "ACTIVE",
        }),
      });

      expect(result.user).toEqual({
        id: sampleUser.id,
        name: sampleUser.name,
        email: sampleUser.email,
        status: "ACTIVE",
        createdAt: sampleUser.createdAt.toISOString(),
        updatedAt: sampleUser.updatedAt.toISOString(),
      });
      // Invariant: passwordHash must never be exposed
      expect("passwordHash" in result.user).toBe(false);
      expect(result.accessToken).toBeDefined();
      expect(result.rawRefreshToken).toBeDefined();
    });

    it("should throw ConflictError if email is already taken", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser);

      await expect(
        authService.register({
          name: "Alex Mercer",
          email: "alex@example.com",
          password: "StrongPassword123!",
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("login()", () => {
    it("should successfully log in with valid credentials and return tokens", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser);

      const result = await authService.login({
        email: "ALEX@example.com",
        password: "StrongPassword123!",
      });

      expect(result.user.id).toBe(sampleUser.id);
      expect(result.accessToken).toBeDefined();
      expect(result.rawRefreshToken).toBeDefined();
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
    });

    it("should throw generic UnauthorizedError if user is not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({
          email: "nonexistent@example.com",
          password: "AnyPassword123",
        }),
      ).rejects.toThrow(new UnauthorizedError("Invalid email or password."));
    });

    it("should throw generic UnauthorizedError if password does not match", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser);

      await expect(
        authService.login({
          email: "alex@example.com",
          password: "WrongPassword999",
        }),
      ).rejects.toThrow(new UnauthorizedError("Invalid email or password."));
    });

    it("should throw UnauthorizedError if user account is not ACTIVE", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...sampleUser,
        status: "SUSPENDED",
      });

      await expect(
        authService.login({
          email: "alex@example.com",
          password: "StrongPassword123!",
        }),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("logout()", () => {
    it("should revoke the refresh token in the database", async () => {
      const rawToken = signRefreshToken({
        sub: sampleUser.id,
        familyId: "fam-1",
        jti: "jti-1",
      });

      await authService.logout(rawToken);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });

    it("should gracefully handle missing or undefined refresh token", async () => {
      await expect(authService.logout(undefined)).resolves.toBeUndefined();
    });
  });

  describe("refreshSession() & Token Rotation", () => {
    it("should successfully rotate valid refresh token into a new token pair", async () => {
      const rawToken = signRefreshToken({
        sub: sampleUser.id,
        familyId: "fam-1",
        jti: "jti-1",
      });

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        tokenHash: "somehash",
        userId: sampleUser.id,
        familyId: "fam-1",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
        replacedByTokenHash: null,
        user: sampleUser,
      });

      const result = await authService.refreshSession(rawToken);

      expect(result.accessToken).toBeDefined();
      expect(result.rawRefreshToken).toBeDefined();
      expect(result.user.id).toBe(sampleUser.id);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should throw UnauthorizedError when refresh token is missing", async () => {
      await expect(authService.refreshSession(undefined)).rejects.toThrow(UnauthorizedError);
    });

    it("should detect token reuse and revoke the ENTIRE family when a revoked token is used", async () => {
      const rawToken = signRefreshToken({
        sub: sampleUser.id,
        familyId: "fam-compromised",
        jti: "jti-old",
      });

      // Token was already revoked or replaced!
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-old",
        tokenHash: "oldhash",
        userId: sampleUser.id,
        familyId: "fam-compromised",
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: new Date(Date.now() - 5000),
        replacedByTokenHash: "newreplacementhash",
        user: sampleUser,
      });

      await expect(authService.refreshSession(rawToken)).rejects.toThrow(/compromised or expired/i);

      // Verify that all tokens in the compromised family were invalidated
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: "fam-compromised" },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("should reject expired refresh token", async () => {
      const rawToken = signRefreshToken({
        sub: sampleUser.id,
        familyId: "fam-expired",
        jti: "jti-expired",
      });

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-expired",
        tokenHash: "expiredhash",
        userId: sampleUser.id,
        familyId: "fam-expired",
        expiresAt: new Date(Date.now() - 10000), // In the past
        revokedAt: null,
        replacedByTokenHash: null,
        user: sampleUser,
      });

      await expect(authService.refreshSession(rawToken)).rejects.toThrow(/expired/);
    });
  });

  describe("getCurrentUser()", () => {
    it("should return safe user DTO for active user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(sampleUser);

      const user = await authService.getCurrentUser(sampleUser.id);

      expect(user.id).toBe(sampleUser.id);
      expect(user.email).toBe(sampleUser.email);
      expect("passwordHash" in user).toBe(false);
    });

    it("should throw UnauthorizedError if user does not exist or is inactive", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.getCurrentUser("unknown-id")).rejects.toThrow(UnauthorizedError);
    });
  });
});
