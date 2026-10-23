import type { CorsOptions } from "cors";
import { env } from "./env";

/**
 * Production-ready CORS configuration.
 * Validates request origins against the allowlist defined in the environment configuration.
 * In production/staging, requests from unauthorized origins or wildcards with credentials are rejected.
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server, curl, mobile apps, health probes) with no origin header
    if (!origin) {
      return callback(null, true);
    }

    // Check if incoming origin matches any allowlisted origins
    const isAllowed = env.FRONTEND_ORIGIN.some((allowedOrigin) => {
      // Support exact match or wildcard subdomain matching if specified
      return (
        allowedOrigin === origin ||
        (allowedOrigin.startsWith("*.") && origin.endsWith(allowedOrigin.slice(2)))
      );
    });

    if (isAllowed) {
      return callback(null, true);
    }

    // Deny request if origin is not on the allowlist
    const corsError = new Error(`Origin ${origin} is not allowed by CORS policy.`);
    return callback(corsError, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
    "X-Correlation-Id",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["X-Request-Id", "Content-Disposition"],
  maxAge: 86400, // 24 hours preflight cache
};
