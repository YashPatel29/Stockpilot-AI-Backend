import { Router } from "express";
import { HealthController, healthController } from "./health.controller";

/**
 * Creates and configures routes for system health, liveness, and readiness probes.
 * Supports controller injection for integration tests.
 */
export function createHealthRouter(controller: HealthController = healthController): Router {
  const router = Router();

  // Root health inspection
  router.get("/", controller.getSystemHealth);

  // Kubernetes / Container orchestrator probes
  router.get("/live", controller.getLiveness);
  router.get("/ready", controller.getReadiness);

  return router;
}

export const healthRouter = createHealthRouter();
