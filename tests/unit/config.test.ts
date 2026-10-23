import { describe, it, expect } from "vitest";
import { validateEnv } from "../../src/config/env";
import { booleanStringSchema } from "../../src/config/env.schema";

describe("Environment Configuration & Validation", () => {
  describe("Boolean String Parser", () => {
    it("should parse boolean false and falsy strings strictly to false", () => {
      expect(booleanStringSchema.parse("false")).toBe(false);
      expect(booleanStringSchema.parse("0")).toBe(false);
      expect(booleanStringSchema.parse("off")).toBe(false);
      expect(booleanStringSchema.parse("no")).toBe(false);
      expect(booleanStringSchema.parse(false)).toBe(false);
      expect(booleanStringSchema.parse("")).toBe(false);
    });

    it("should parse boolean true and truthy strings strictly to true", () => {
      expect(booleanStringSchema.parse("true")).toBe(true);
      expect(booleanStringSchema.parse("1")).toBe(true);
      expect(booleanStringSchema.parse("on")).toBe(true);
      expect(booleanStringSchema.parse("yes")).toBe(true);
      expect(booleanStringSchema.parse(true)).toBe(true);
    });
  });

  describe("Schema Environment Rules", () => {
    const validBaseConfig = {
      NODE_ENV: "test",
      PORT: "5000",
      HOST: "127.0.0.1",
      LOG_LEVEL: "info",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
      FRONTEND_ORIGIN: "http://localhost:3000",
      API_PREFIX: "/api",
      API_VERSION: "v1",
      TRUST_PROXY: "false",
      JWT_ACCESS_SECRET: "development_access_token_secret_1234567890",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_SECRET: "development_refresh_token_secret_1234567890",
      JWT_REFRESH_EXPIRES_IN: "7d",
      AI_PROVIDER: "none",
    };

    it("should validate a correct configuration successfully", () => {
      const config = validateEnv(validBaseConfig);
      expect(config.NODE_ENV).toBe("test");
      expect(config.PORT).toBe(5000);
      expect(config.TRUST_PROXY).toBe(false);
      expect(config.FRONTEND_ORIGIN).toEqual(["http://localhost:3000"]);
    });

    it("should parse multiple comma-separated FRONTEND_ORIGIN strings", () => {
      const config = validateEnv({
        ...validBaseConfig,
        FRONTEND_ORIGIN: "http://localhost:3000, https://app.stockpilot.ai , http://127.0.0.1:5173",
      });
      expect(config.FRONTEND_ORIGIN).toEqual([
        "http://localhost:3000",
        "https://app.stockpilot.ai",
        "http://127.0.0.1:5173",
      ]);
    });

    it("should reject invalid port numbers", () => {
      expect(() =>
        validateEnv({
          ...validBaseConfig,
          PORT: "99999", // Out of 65535 range
        }),
      ).toThrow();

      expect(() =>
        validateEnv({
          ...validBaseConfig,
          PORT: "80", // Privileged port below 1024
        }),
      ).toThrow();
    });

    it("should enforce strict production constraints in production mode", () => {
      // Production must reject localhost database URLs
      expect(() =>
        validateEnv({
          ...validBaseConfig,
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://user:stockpilot_pass@localhost:5432/db",
          JWT_ACCESS_SECRET: "secure_random_key_of_at_least_32_characters_prod",
          JWT_REFRESH_SECRET: "another_secure_random_key_of_at_least_32_characters",
        }),
      ).toThrow(/production-grade/);

      // Production must reject default dev JWT secret
      expect(() =>
        validateEnv({
          ...validBaseConfig,
          NODE_ENV: "production",
          DATABASE_URL:
            "postgresql://remote_user:prod_pass@db.stockpilot.internal:5432/stockpilot_prod",
          JWT_ACCESS_SECRET: "dev_secret_jwt_access_must_be_changed",
          JWT_REFRESH_SECRET: "another_secure_random_key_of_at_least_32_characters",
        }),
      ).toThrow(/JWT_ACCESS_SECRET/);
    });

    it("should require AI_API_KEY when AI_PROVIDER is set to an active vendor", () => {
      expect(() =>
        validateEnv({
          ...validBaseConfig,
          AI_PROVIDER: "openai",
          // Missing AI_API_KEY
        }),
      ).toThrow(/AI_API_KEY is required/);
    });

    it("should permit AI_PROVIDER='mock' without an API key", () => {
      const config = validateEnv({
        ...validBaseConfig,
        AI_PROVIDER: "mock",
      });
      expect(config.AI_PROVIDER).toBe("mock");
    });
  });
});
