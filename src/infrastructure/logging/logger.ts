import pino from "pino";
import pinoHttp from "pino-http";
import crypto from "crypto";
import type { Request, Response } from "express";
import { appConfig } from "../../config/app.config";

/**
 * Redaction paths for Pino.
 * Guarantees that credentials, tokens, cookies, and secret keys
 * are never recorded in application logs.
 */
const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  "req.body.password",
  "req.body.token",
  "req.body.secret",
  "req.body.apiKey",
  "req.body.accessToken",
  "req.body.refreshToken",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
];

const isDevelopment = appConfig.server.nodeEnv === "development";
const isTest = appConfig.server.nodeEnv === "test";

/**
 * Base application logger instance.
 */
export const logger = pino({
  level: isTest ? "silent" : appConfig.server.logLevel,
  redact: {
    paths: REDACTED_PATHS,
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  transport:
    isDevelopment && !isTest
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

/**
 * HTTP request logging middleware using pino-http.
 * Generates and associates correlation IDs for end-to-end request tracing.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    // Check for existing correlation ID from reverse proxy, or generate new UUID
    const incomingId = req.headers["x-request-id"] || req.headers["x-correlation-id"];
    if (typeof incomingId === "string" && incomingId.length > 0) {
      return incomingId;
    }
    return crypto.randomUUID();
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} -> ${res.statusCode}`;
  },
  customErrorMessage: (req, _res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },
  serializers: {
    req: (req: Request) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      remoteAddress: req.ip,
    }),
    res: (res: Response) => ({
      statusCode: res.statusCode,
    }),
  },
});
