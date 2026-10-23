import http from "http";
import { app } from "./app";
import { appConfig } from "./config/app.config";
import { databaseService } from "./infrastructure/database/database.service";
import { logger } from "./infrastructure/logging/logger";

/**
 * Main application bootstrap and graceful lifecycle controller.
 */
async function bootstrap(): Promise<void> {
  logger.info(
    {
      env: appConfig.server.nodeEnv,
      port: appConfig.server.port,
      apiPrefix: appConfig.api.fullPrefix,
    },
    "Initializing StockPilot AI backend service...",
  );

  // 1. Initialize and verify database connectivity
  const dbConnected = await databaseService.connect();
  if (!dbConnected) {
    logger.warn(
      "Backend starting in degraded state: PostgreSQL database is unreachable. Readiness checks will fail until connection succeeds.",
    );
  }

  // 2. Instantiate and bind HTTP server
  const server = http.createServer(app);

  server.listen(appConfig.server.port, appConfig.server.host, () => {
    logger.info(
      `StockPilot AI backend is listening on http://${appConfig.server.host}:${appConfig.server.port}`,
    );
    logger.info(
      `Health check probe active at http://${appConfig.server.host}:${appConfig.server.port}/health/live`,
    );
    logger.info(
      `Readiness probe active at http://${appConfig.server.host}:${appConfig.server.port}/health/ready`,
    );
    logger.info(
      `Versioned API root at http://${appConfig.server.host}:${appConfig.server.port}${appConfig.api.fullPrefix}`,
    );
  });

  // 3. Graceful Termination Management
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn(`Shutdown already in progress. Ignoring additional signal: ${signal}`);
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    // Force exit timeout safeguard
    const forceExitTimer = setTimeout(() => {
      logger.error("Graceful shutdown timed out. Forcing process termination.");
      process.exit(1);
    }, appConfig.server.shutdownTimeoutMs);

    // Unref timer so it doesn't hold open the event loop unnecessarily
    forceExitTimer.unref();

    try {
      // 1. Stop accepting new HTTP requests
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          logger.info("HTTP server closed to new connections.");
          resolve();
        });
      });

      // 2. Disconnect database pool
      await databaseService.disconnect();

      clearTimeout(forceExitTimer);
      logger.info("StockPilot AI backend shutdown completed cleanly.");
      process.exit(0);
    } catch (shutdownError) {
      logger.error({ err: shutdownError }, "Error occurred during graceful shutdown.");
      process.exit(1);
    }
  };

  // Process termination signal listeners
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Process-level uncaught exception and unhandled rejection guards
  process.on("uncaughtException", (error: Error) => {
    logger.fatal(
      { err: error },
      "CRITICAL: Uncaught exception encountered. Initiating emergency shutdown.",
    );
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason: unknown) => {
    logger.fatal(
      { reason },
      "CRITICAL: Unhandled promise rejection encountered. Initiating emergency shutdown.",
    );
    gracefulShutdown("unhandledRejection");
  });
}

// Execute bootstrap sequence
bootstrap().catch((bootstrapError) => {
  console.error("FATAL: Failed to bootstrap application:", bootstrapError);
  process.exit(1);
});
