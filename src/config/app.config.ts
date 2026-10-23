import { env } from "./env";
import { corsOptions } from "./cors.config";

/**
 * Centralized Application Configuration.
 * Higher-level application components read this typed configuration tree rather than raw variables.
 */
export const appConfig = {
  server: {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
    requestTimeoutMs: 30000,
    shutdownTimeoutMs: 10000,
  },
  api: {
    prefix: env.API_PREFIX,
    version: env.API_VERSION,
    get fullPrefix(): string {
      return `${this.prefix}/${this.version}`;
    },
  },
  cors: {
    origins: env.FRONTEND_ORIGIN,
    options: corsOptions,
  },
  database: {
    url: env.DATABASE_URL,
    accelerateUrl: env.PRISMA_ACCELERATE_URL,
  },
  security: {
    bodyLimit: "1mb",
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: env.NODE_ENV === "test" ? 10000 : 200, // Maximum requests per window
    },
  },
  auth: {
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    cookieName: "stockpilot_refresh_token",
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
    cookieSameSite: env.COOKIE_SAME_SITE,
    cookieDomain: env.COOKIE_DOMAIN,
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: env.NODE_ENV === "test" ? 10000 : env.AUTH_RATE_LIMIT_MAX,
    },
  },
  ai: {
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    apiKey: env.AI_API_KEY,
    requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    maxGraphSteps: env.AI_MAX_GRAPH_STEPS,
  },
  infrastructure: {
    redisUrl: env.REDIS_URL,
    rabbitmqUrl: env.RABBITMQ_URL,
  },
} as const;

export type AppConfig = typeof appConfig;
