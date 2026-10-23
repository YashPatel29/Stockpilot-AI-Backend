import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { appConfig } from "../../config/app.config";
import { UnauthorizedError } from "../errors/http-errors";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  jti: string;
}

/**
 * Creates a cryptographically signed short-lived JWT access token.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: appConfig.auth.jwtAccessExpiresIn as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  };

  return jwt.sign(payload, appConfig.auth.jwtAccessSecret, options);
}

/**
 * Validates and decodes an access token. Throws UnauthorizedError on invalid/expired signatures.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, appConfig.auth.jwtAccessSecret, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload & AccessTokenPayload;

    if (!decoded.sub || !decoded.email) {
      throw new UnauthorizedError("Invalid token payload structure.");
    }

    return {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name ?? "",
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Access token has expired.");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid access token.");
    }
    throw err;
  }
}

/**
 * Creates a cryptographically signed refresh token containing user and rotation family identifiers.
 */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: appConfig.auth.jwtRefreshExpiresIn as jwt.SignOptions["expiresIn"],
    algorithm: "HS256",
  };

  return jwt.sign(payload, appConfig.auth.jwtRefreshSecret, options);
}

/**
 * Validates and decodes a refresh token.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, appConfig.auth.jwtRefreshSecret, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload & RefreshTokenPayload;

    if (!decoded.sub || !decoded.familyId || !decoded.jti) {
      throw new UnauthorizedError("Invalid refresh token payload structure.");
    }

    return {
      sub: decoded.sub,
      familyId: decoded.familyId,
      jti: decoded.jti,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Refresh token has expired.");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid refresh token.");
    }
    throw err;
  }
}

/**
 * Computes a deterministic SHA-256 hash of a raw token string for secure database persistence.
 * Prevents database compromises from leaking usable refresh tokens.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Parses duration strings like '7d', '15m', '24h' into milliseconds.
 */
export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) {
    // Default to 7 days if unparseable
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}
