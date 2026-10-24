import express, { type Application } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { appConfig } from "./config/app.config";
import { swaggerSpec, swaggerUiOptions } from "./config/swagger.config";
import { httpLogger } from "./infrastructure/logging/logger";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware";
import { requestTimeoutMiddleware } from "./common/middleware/timeout.middleware";
import { apiRateLimiter } from "./common/middleware/rate-limit.middleware";
import { notFoundMiddleware } from "./common/middleware/not-found.middleware";
import { errorMiddleware } from "./common/middleware/error.middleware";
import { healthRouter } from "./modules/health/health.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { organizationRouter } from "./modules/organizations/organization.routes";
import { acceptInvitationRouter } from "./modules/organizations/invitations/invitation.routes";

/**
 * Creates and configures the Express application pipeline.
 * Encapsulated as a factory function to allow spinning up independent instances in tests.
 */
export function createApp(): Application {
  const app = express();

  // 1. Core Platform Configuration
  app.disable("x-powered-by");

  // Explicit proxy trust configuration for accurate IP and protocol resolution behind ALBs/Ingress
  if (appConfig.server.trustProxy !== false) {
    app.set("trust proxy", appConfig.server.trustProxy);
  }

  // 2. Fundamental Security & Request Tracking Middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "validator.swagger.io"],
        },
      },
    }),
  );
  app.use(cors(appConfig.cors.options));
  app.use(requestIdMiddleware);
  app.use(requestTimeoutMiddleware(appConfig.server.requestTimeoutMs));

  // 3. Structured Request Logging
  app.use(httpLogger);

  // 4. Request Body Parsers & Cookie Parser with Explicit Size Safeguards
  app.use(express.json({ limit: appConfig.security.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: appConfig.security.bodyLimit }));
  app.use(cookieParser());

  // 5. Interactive API Documentation (Swagger UI)
  app.get("/docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

  // 6. Container Orchestration & Root Health Check Probes
  // Mount at /health for standard infrastructure probe configurations (AWS ALB, K8s, GCP)
  app.use("/health", healthRouter);

  // 7. Versioned API Routes (e.g. /api/v1)
  const apiRouter = express.Router();

  // Apply rate limiting to all standard API routes
  apiRouter.use(apiRateLimiter);

  // Mount API documentation under versioned prefix
  apiRouter.get("/docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
  apiRouter.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

  // Mount module routes under versioned prefix
  apiRouter.use("/health", healthRouter);
  apiRouter.use("/auth", authRouter);
  apiRouter.use("/organizations", organizationRouter);
  apiRouter.use("/invitations", acceptInvitationRouter);

  // Register versioned router
  app.use(appConfig.api.fullPrefix, apiRouter);

  // 7. Route Fallthrough & Centralized Error Handling
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

export const app = createApp();
