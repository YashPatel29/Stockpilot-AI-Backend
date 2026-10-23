import { describe, it, expect } from "vitest";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  parseDurationToMs,
} from "../../src/common/utils/token.util";
import { UnauthorizedError } from "../../src/common/errors/http-errors";

describe("Token & Cryptographic Utilities", () => {
  const mockUserPayload = {
    sub: "user-uuid-1234",
    email: "sarah.connor@example.com",
    name: "Sarah Connor",
  };

  describe("Access Token Lifecycle", () => {
    it("should sign and verify an access token successfully", () => {
      const token = signAccessToken(mockUserPayload);
      expect(typeof token).toBe("string");

      const decoded = verifyAccessToken(token);
      expect(decoded.sub).toBe(mockUserPayload.sub);
      expect(decoded.email).toBe(mockUserPayload.email);
      expect(decoded.name).toBe(mockUserPayload.name);
    });

    it("should throw UnauthorizedError when verifying a tampered token", () => {
      const token = signAccessToken(mockUserPayload);
      const tampered = token.slice(0, -5) + "abcde";

      expect(() => verifyAccessToken(tampered)).toThrow(UnauthorizedError);
    });

    it("should throw UnauthorizedError when verifying a random string", () => {
      expect(() => verifyAccessToken("not-a-token")).toThrow(UnauthorizedError);
    });
  });

  describe("Refresh Token Lifecycle", () => {
    const mockRefreshPayload = {
      sub: "user-uuid-1234",
      familyId: "family-uuid-5678",
      jti: "jti-uuid-9999",
    };

    it("should sign and verify a refresh token successfully", () => {
      const token = signRefreshToken(mockRefreshPayload);
      expect(typeof token).toBe("string");

      const decoded = verifyRefreshToken(token);
      expect(decoded.sub).toBe(mockRefreshPayload.sub);
      expect(decoded.familyId).toBe(mockRefreshPayload.familyId);
      expect(decoded.jti).toBe(mockRefreshPayload.jti);
    });

    it("should throw UnauthorizedError for malformed refresh tokens", () => {
      expect(() => verifyRefreshToken("invalid-token-string")).toThrow(UnauthorizedError);
    });
  });

  describe("Token Hashing", () => {
    it("should produce a deterministic 64-character SHA-256 hex string", () => {
      const raw = "sample-raw-refresh-token-string";
      const hash1 = hashToken(raw);
      const hash2 = hashToken(raw);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
    });
  });

  describe("Duration Parser", () => {
    it("should parse days, hours, minutes, seconds correctly", () => {
      expect(parseDurationToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDurationToMs("24h")).toBe(24 * 60 * 60 * 1000);
      expect(parseDurationToMs("15m")).toBe(15 * 60 * 1000);
      expect(parseDurationToMs("30s")).toBe(30 * 1000);
      expect(parseDurationToMs("invalid")).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
