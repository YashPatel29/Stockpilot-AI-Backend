import { describe, it, expect } from "vitest";
import { sanitizeData } from "../../src/common/utils/sanitize.util";

describe("Data Sanitization & Secret Redaction Utility", () => {
  it("should redact sensitive fields while preserving safe fields", () => {
    const raw = {
      username: "warehouse_admin",
      password: "SuperSecretPassword123!",
      token: "jwt.header.payload",
      apiKey: "sk-live-1234567890",
      email: "admin@stockpilot.ai",
      status: "ACTIVE",
    };

    const sanitized = sanitizeData(raw);

    expect(sanitized.username).toBe("warehouse_admin");
    expect(sanitized.email).toBe("admin@stockpilot.ai");
    expect(sanitized.status).toBe("ACTIVE");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.apiKey).toBe("[REDACTED]");
  });

  it("should sanitize nested objects and arrays recursively", () => {
    const raw = {
      user: {
        profile: {
          name: "John Doe",
          secret: "hidden-seed-phrase",
        },
      },
      tokens: [
        { type: "access", accessToken: "token-abc" },
        { type: "refresh", refreshToken: "token-xyz" },
      ],
    };

    const sanitized = sanitizeData(raw);

    expect(sanitized.user.profile.name).toBe("John Doe");
    expect(sanitized.user.profile.secret).toBe("[REDACTED]");
    expect(sanitized.tokens?.[0]?.accessToken).toBe("[REDACTED]");
    expect(sanitized.tokens?.[1]?.refreshToken).toBe("[REDACTED]");
  });

  it("should handle null, primitives, and non-object values safely", () => {
    expect(sanitizeData(null)).toBeNull();
    expect(sanitizeData(undefined)).toBeUndefined();
    expect(sanitizeData(42)).toBe(42);
    expect(sanitizeData("safe string")).toBe("safe string");
  });

  it("should safely protect against circular references", () => {
    const circularObj: Record<string, unknown> = { name: "Root" };
    circularObj.self = circularObj;

    const sanitized = sanitizeData(circularObj);
    expect(sanitized.name).toBe("Root");
    expect(sanitized.self).toBe("[CIRCULAR]");
  });
});
