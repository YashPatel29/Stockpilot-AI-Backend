import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { appConfig } from "../../config/app.config";
import { logger } from "../logging/logger";

/**
 * Creates and configures the singleton Prisma Client instance adhering to Prisma 7+.
 * Passes either `accelerateUrl` for Prisma Accelerate or `adapter` for direct PostgreSQL pooling.
 * Centralized instantiation prevents exhausting database connection pools across hot-reloads and multiple imports.
 */
function createPrismaClient(): PrismaClient {
  const isDev = appConfig.server.nodeEnv === "development";

  const logOptions = isDev
    ? [
        { emit: "event" as const, level: "error" as const },
        { emit: "event" as const, level: "warn" as const },
      ]
    : [{ emit: "event" as const, level: "error" as const }];

  let client: PrismaClient;

  if (appConfig.database.accelerateUrl) {
    client = new PrismaClient({
      accelerateUrl: appConfig.database.accelerateUrl,
      log: logOptions,
    });
  } else {
    const pool = new Pool({
      connectionString: appConfig.database.url,
    });
    const adapter = new PrismaPg(pool);
    client = new PrismaClient({
      adapter,
      log: logOptions,
    });
  }

  client.$on("error" as never, (e: { message: string }) => {
    logger.error({ err: e }, "Prisma database client error");
  });

  client.$on("warn" as never, (e: { message: string }) => {
    logger.warn({ warning: e }, "Prisma database client warning");
  });

  return client;
}

// Global cached client instance for development hot-reloading
const globalForPrisma = global as unknown as { prismaClientSingleton?: PrismaClient };

export const prisma = globalForPrisma.prismaClientSingleton ?? createPrismaClient();

if (appConfig.server.nodeEnv !== "production") {
  globalForPrisma.prismaClientSingleton = prisma;
}
