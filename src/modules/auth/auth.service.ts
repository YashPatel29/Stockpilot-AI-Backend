import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import { logger } from "../../infrastructure/logging/logger";
import { appConfig } from "../../config/app.config";
import { ConflictError, UnauthorizedError } from "../../common/errors/http-errors";
import { hashPassword, verifyPassword } from "../../common/utils/password.util";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  parseDurationToMs,
} from "../../common/utils/token.util";
import type { RegisterInput, LoginInput } from "./auth.schema";
import { toSafeUser, type AuthSessionResult, type SafeUserDto } from "./auth.types";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditResourceType } from "../audit/audit.types";

/**
 * Service encapsulating core user authentication, credential verification,
 * and secure rotating refresh-token session management.
 * Invariant: Never imports Express types (Request, Response).
 */
export class AuthService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient = prisma,
    audit?: AuditService,
  ) {
    this.audit = audit ?? new AuditService(this.db);
  }

  /**
   * Registers a new user account, hashes credentials, and issues an initial authenticated session.
   */
  public async register(input: RegisterInput): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Verify email uniqueness
    const existing = await this.db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictError("An account with this email address already exists.");
    }

    const passwordHash = await hashPassword(input.password);

    const user = await this.db.user.create({
      data: {
        name: input.name.trim(),
        email: normalizedEmail,
        passwordHash,
        status: "ACTIVE",
      },
    });

    logger.info({ userId: user.id }, "New user registered successfully.");

    await this.audit.recordAudit({
      actorUserId: user.id,
      action: AuditAction.AUTH_REGISTERED,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      metadata: { email: user.email },
    });

    return this.createSession(user.id, user.email, user.name, user);
  }

  /**
   * Authenticates user credentials with constant-time verification and generic error messaging.
   */
  public async login(input: LoginInput): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await this.db.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Uniform timing / generic error message to prevent email enumeration
    if (!user) {
      // Execute dummy hash comparison to prevent timing discrepancy
      await verifyPassword(
        input.password,
        "$2b$10$wT55hT89xM2uXzV9P0l3ne8W7p0tO4zU1xL0dD.aZ8zX7fWc2lK3m",
      );
      throw new UnauthorizedError("Invalid email or password.");
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedError("Account is not active. Please contact support.");
    }

    const isMatch = await verifyPassword(input.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    logger.info({ userId: user.id }, "User logged in successfully.");

    await this.audit.recordAudit({
      actorUserId: user.id,
      action: AuditAction.AUTH_LOGIN,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      metadata: { email: user.email },
    });

    return this.createSession(user.id, user.email, user.name, user);
  }

  /**
   * Invalidates a single active refresh token session by marking it revoked.
   */
  public async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;

    try {
      const tokenHash = hashToken(rawRefreshToken);
      await this.db.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (err) {
      logger.warn({ err }, "Error revoking refresh token on logout");
    }
  }

  /**
   * Validates an incoming refresh token, detects potential token reuse/theft,
   * performs atomic rotation, and issues a fresh session pair.
   */
  public async refreshSession(rawRefreshToken?: string): Promise<AuthSessionResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedError("Refresh token is required.");
    }

    // Cryptographic signature and format verification
    verifyRefreshToken(rawRefreshToken);
    const incomingHash = hashToken(rawRefreshToken);

    const tokenRecord = await this.db.refreshToken.findUnique({
      where: { tokenHash: incomingHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedError("Session has expired or is invalid.");
    }

    // 1. REUSE DETECTION (OWASP Token Rotation Standard):
    // If a token that has already been replaced or revoked is presented again,
    // a token theft / replay attack has likely occurred. Immediately revoke ALL tokens in the family.
    if (tokenRecord.revokedAt !== null || tokenRecord.replacedByTokenHash !== null) {
      await this.db.refreshToken.updateMany({
        where: { familyId: tokenRecord.familyId },
        data: { revokedAt: new Date() },
      });

      logger.warn(
        { userId: tokenRecord.userId, familyId: tokenRecord.familyId },
        "Security Alert: Compromised refresh token reuse detected. Family sessions revoked.",
      );

      throw new UnauthorizedError("Session compromised or expired. Please sign in again.");
    }

    // 2. Check token expiration
    if (tokenRecord.expiresAt < new Date()) {
      await this.db.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError("Session has expired. Please sign in again.");
    }

    // 3. Verify user status
    const user = tokenRecord.user;
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("User account is inactive or disabled.");
    }

    // 4. ATOMIC ROTATION:
    // Generate new refresh token in the same family and rotate the previous one in a transaction
    const newJti = crypto.randomUUID();
    const newRawRefreshToken = signRefreshToken({
      sub: user.id,
      familyId: tokenRecord.familyId,
      jti: newJti,
    });
    const newHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + parseDurationToMs(appConfig.auth.jwtRefreshExpiresIn),
    );

    await this.db.$transaction(async (tx) => {
      // Invalidate current token and link to replacement
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenHash: newHash,
        },
      });

      // Insert new token into the same family chain
      await tx.refreshToken.create({
        data: {
          tokenHash: newHash,
          userId: user.id,
          familyId: tokenRecord.familyId,
          expiresAt: newExpiresAt,
        },
      });
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      user: toSafeUser(user),
      accessToken,
      rawRefreshToken: newRawRefreshToken,
    };
  }

  /**
   * Retrieves safe user profile for an authenticated identity.
   */
  public async getCurrentUser(userId: string): Promise<SafeUserDto> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("User profile not found or inactive.");
    }

    return toSafeUser(user);
  }

  /**
   * Internal helper to generate token pair and record persistent session in database.
   */
  private async createSession(
    userId: string,
    email: string,
    name: string,
    userRecord?: {
      id: string;
      name: string;
      email: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    },
  ): Promise<AuthSessionResult> {
    const familyId = crypto.randomUUID();
    const jti = crypto.randomUUID();

    const accessToken = signAccessToken({ sub: userId, email, name });
    const rawRefreshToken = signRefreshToken({ sub: userId, familyId, jti });
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + parseDurationToMs(appConfig.auth.jwtRefreshExpiresIn));

    await this.db.refreshToken.create({
      data: {
        tokenHash,
        userId,
        familyId,
        expiresAt,
      },
    });

    const user =
      userRecord ??
      (await this.db.user.findUniqueOrThrow({
        where: { id: userId },
      }));

    return {
      user: toSafeUser(user as Parameters<typeof toSafeUser>[0]),
      accessToken,
      rawRefreshToken,
    };
  }
}

export const authService = new AuthService();
