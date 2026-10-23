import { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.client";
import { logger } from "../logging/logger";

export interface DatabaseHealthResult {
  isHealthy: boolean;
  latencyMs?: number;
  message?: string;
}

/**
 * Database Service encapsulating database lifecycle, connection pooling,
 * health verification, and graceful termination.
 * Follows Dependency Inversion: accepts an optional PrismaClient for mockability in tests.
 */
export class DatabaseService {
  private isConnected = false;

  constructor(private readonly client: PrismaClient = prisma) {}

  /**
   * Initializes database connection and verifies reachability via an active ping query.
   * Does not pretend the database is connected if ping fails.
   */
  public async connect(): Promise<boolean> {
    try {
      await this.client.$connect();
      // Execute a lightweight query to verify network connectivity and credentials
      await this.client.$queryRaw`SELECT 1;`;
      this.isConnected = true;
      logger.info("Database connection established and verified successfully.");
      return true;
    } catch (error) {
      this.isConnected = false;
      const errMessage =
        error instanceof Error ? error.message : "Unknown database connection error";
      logger.warn(
        { errMessage },
        "Database connection verification failed. Database will be marked as unhealthy until reachable.",
      );
      return false;
    }
  }

  /**
   * Disconnects the database client safely, draining active connection pool sockets.
   */
  public async disconnect(): Promise<void> {
    try {
      await this.client.$disconnect();
      this.isConnected = false;
      logger.info("Database connection disconnected cleanly.");
    } catch (error) {
      logger.error({ err: error }, "Error disconnecting from database");
    }
  }

  /**
   * Performs an active health check ping against the database.
   * Readiness probes rely on this method to determine traffic acceptance.
   */
  public async isHealthy(): Promise<DatabaseHealthResult> {
    const start = performance.now();
    try {
      await this.client.$queryRaw`SELECT 1;`;
      const latencyMs = Math.round(performance.now() - start);
      this.isConnected = true;
      return {
        isHealthy: true,
        latencyMs,
      };
    } catch (error) {
      this.isConnected = false;
      const message = error instanceof Error ? error.message : "Database ping failed";
      return {
        isHealthy: false,
        message,
      };
    }
  }

  public getClient(): PrismaClient {
    return this.client;
  }

  public get connectionState(): boolean {
    return this.isConnected;
  }
}

// Default application database service instance
export const databaseService = new DatabaseService();
