import { DatabaseService, databaseService } from "../../infrastructure/database/database.service";
import { appConfig } from "../../config/app.config";

export interface LivenessResult {
  status: "ok";
  uptimeSeconds: number;
  timestamp: string;
}

export interface DependencyStatus {
  status: "healthy" | "unhealthy";
  latencyMs?: number;
}

export interface ReadinessResult {
  status: "ready" | "unhealthy";
  isReady: boolean;
  dependencies: {
    database: DependencyStatus;
  };
  timestamp: string;
}

export interface SystemHealthResult {
  status: "healthy" | "degraded";
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  memory: {
    rssMb: number;
    heapTotalMb: number;
    heapUsedMb: number;
  };
  dependencies: {
    database: DependencyStatus;
  };
}

/**
 * Health Service responsible for probing system state, dependency reachability,
 * and runtime telemetry.
 * Uses constructor injection to facilitate unit testing without live databases.
 */
export class HealthService {
  constructor(private readonly dbService: DatabaseService = databaseService) {}

  /**
   * Liveness Probe: Confirms the Node.js event loop is operational and the HTTP server
   * is receiving requests. Intentionally does NOT depend on external databases.
   */
  public getLiveness(): LivenessResult {
    return {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness Probe: Verifies that mandatory external dependencies (PostgreSQL)
   * are reachable and able to serve traffic.
   */
  public async getReadiness(): Promise<ReadinessResult> {
    const dbHealth = await this.dbService.isHealthy();

    const isReady = dbHealth.isHealthy;
    const dbStatus: DependencyStatus = {
      status: dbHealth.isHealthy ? "healthy" : "unhealthy",
      latencyMs: dbHealth.latencyMs,
    };

    return {
      status: isReady ? "ready" : "unhealthy",
      isReady,
      dependencies: {
        database: dbStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detailed system telemetry and health status overview.
   */
  public async getSystemHealth(): Promise<SystemHealthResult> {
    const dbHealth = await this.dbService.isHealthy();
    const memory = process.memoryUsage();

    const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

    return {
      status: dbHealth.isHealthy ? "healthy" : "degraded",
      version: appConfig.api.version,
      environment: appConfig.server.nodeEnv,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: {
        rssMb: toMb(memory.rss),
        heapTotalMb: toMb(memory.heapTotal),
        heapUsedMb: toMb(memory.heapUsed),
      },
      dependencies: {
        database: {
          status: dbHealth.isHealthy ? "healthy" : "unhealthy",
          latencyMs: dbHealth.latencyMs,
        },
      },
    };
  }
}

export const healthService = new HealthService();
