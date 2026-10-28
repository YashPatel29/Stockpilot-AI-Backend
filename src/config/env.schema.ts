import { z } from "zod";

/**
 * Custom Zod preprocessor to safely parse boolean values from environment strings.
 * Critical safeguard: Ensures that "false", "0", "off", and "no" strictly evaluate to `false`,
 * preventing JavaScript truthiness bugs where Boolean("false") === true.
 */
export const booleanStringSchema = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const trimmed = val.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(trimmed)) return true;
    if (["false", "0", "no", "off", ""].includes(trimmed)) return false;
  }
  return val;
}, z.boolean());

/**
 * Custom preprocessor for comma-separated or single-string origin lists into string arrays.
 */
export const originsStringSchema = z.preprocess(
  (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      return val
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return [];
  },
  z.array(z.string().min(1, "Origin cannot be empty")),
);

/**
 * Base environment schema specifying all supported environment variables.
 */
export const envSchema = z
  .object({
    // Server runtime
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1024).max(65535).default(5000),
    HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    TRUST_PROXY: booleanStringSchema.default(false),

    // API Routing & CORS
    API_PREFIX: z
      .string()
      .regex(/^\/[a-zA-Z0-9_-]*$/, "API_PREFIX must start with / and contain valid path characters")
      .default("/api"),
    API_VERSION: z
      .string()
      .regex(/^v[0-9]+$/, "API_VERSION must be in format 'v1', 'v2', etc.")
      .default("v1"),
    FRONTEND_ORIGIN: originsStringSchema.default([
      "http://localhost:3000",
      "http://localhost:5173",
    ]),

    // Database & Prisma 7
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL must be provided")
      .default(
        "postgresql://stockpilot_user:stockpilot_pass@localhost:5432/stockpilot_dev?schema=public",
      ),
    DATABASE_URL_TEST: z.string().optional(),
    PRISMA_ACCELERATE_URL: z.string().optional(),

    // JWT Security
    JWT_ACCESS_SECRET: z
      .string()
      .min(16, "JWT_ACCESS_SECRET must be at least 16 characters in development")
      .default("dev_secret_jwt_access_must_be_changed_in_prod_1234567890"),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(16, "JWT_REFRESH_SECRET must be at least 16 characters in development")
      .default("dev_secret_jwt_refresh_must_be_changed_in_prod_1234567890"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

    // Cookie & Session Security
    COOKIE_SECURE: booleanStringSchema.optional(),
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_DOMAIN: z.string().optional(),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

    // AI Copilot Integration Boundaries
    AI_PROVIDER: z.enum(["none", "openai", "anthropic", "google", "mock"]).default("none"),
    AI_MODEL: z.string().optional().default("gpt-4o"),
    AI_API_KEY: z.string().optional(),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    AI_MAX_GRAPH_STEPS: z.coerce.number().int().min(1).max(100).default(15),

    // Optional Infrastructure
    REDIS_URL: z.string().url("REDIS_URL must be a valid URL").optional().or(z.literal("")),
    RABBITMQ_URL: z.string().url("RABBITMQ_URL must be a valid URL").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    // Production & Staging stricter constraints
    if (data.NODE_ENV === "production" || data.NODE_ENV === "staging") {
      if (
        !data.DATABASE_URL ||
        data.DATABASE_URL.includes("localhost") ||
        data.DATABASE_URL.includes("stockpilot_pass")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message:
            "A production-grade, secure DATABASE_URL is required in staging and production modes.",
        });
      }

      if (data.JWT_ACCESS_SECRET.includes("dev_secret") || data.JWT_ACCESS_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_ACCESS_SECRET"],
          message:
            "JWT_ACCESS_SECRET must be at least 32 characters and cryptographically random in production/staging.",
        });
      }

      if (data.JWT_REFRESH_SECRET.includes("dev_secret") || data.JWT_REFRESH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_REFRESH_SECRET"],
          message:
            "JWT_REFRESH_SECRET must be at least 32 characters and cryptographically random in production/staging.",
        });
      }

      if (data.FRONTEND_ORIGIN.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FRONTEND_ORIGIN"],
          message:
            "At least one FRONTEND_ORIGIN must be explicitly configured in production/staging.",
        });
      }
    }

    // AI Provider validation: If a provider is active (not 'none' or 'mock'), an API key is required
    if (data.AI_PROVIDER !== "none" && data.AI_PROVIDER !== "mock" && !data.AI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_API_KEY"],
        message: `AI_API_KEY is required when AI_PROVIDER is set to '${data.AI_PROVIDER}'`,
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;
