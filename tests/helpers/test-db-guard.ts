import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

/**
 * Resolves the dedicated test database URL.
 * Strictly verifies that the target connection points to a test database (e.g., 'stockpilot_test').
 * Fails closed immediately if the connection is ambiguous or points to development/production.
 */
export function getTestDatabaseUrl(): string {
  const urlString =
    process.env["DATABASE_URL_TEST"] ||
    process.env["DATABASE_URL"]?.replace(/\/[a-zA-Z0-9_-]+(\?.*)?$/, "/stockpilot_test$1");

  if (!urlString) {
    throw new Error(
      "FATAL: Neither DATABASE_URL_TEST nor DATABASE_URL is configured. Cannot resolve test database.",
    );
  }

  const parsed = new URL(urlString);
  const dbName = parsed.pathname.replace(/^\//, "");

  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(
      `FATAL: Unsafe database URL detected for integration testing! Target database is '${dbName}'. ` +
        `Refusing to proceed because the database name does not contain 'test'.`,
    );
  }

  return urlString;
}

let cachedTestPrisma: PrismaClient | null = null;

/**
 * Creates or retrieves a cached singleton PrismaClient instance strictly connected to the test database.
 */
export function getTestPrisma(): PrismaClient {
  if (cachedTestPrisma) {
    return cachedTestPrisma;
  }

  const testDbUrl = getTestDatabaseUrl();
  const pool = new Pool({
    connectionString: testDbUrl,
  });
  const adapter = new PrismaPg(pool);

  cachedTestPrisma = new PrismaClient({
    adapter,
    log: [{ emit: "event", level: "error" }],
  });

  return cachedTestPrisma;
}

/**
 * Runtime assertion verifying that the active database session is connected to the dedicated test database.
 * Executes a direct SQL query against the engine to guarantee no environment spoofing or misrouting.
 */
export async function assertTestDatabaseConnection(prisma: PrismaClient): Promise<string> {
  const result = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>(
    "SELECT current_database();",
  );

  const currentDb = result[0]?.current_database ?? "";

  if (!currentDb.toLowerCase().includes("test")) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Connected to '${currentDb}', which is NOT a dedicated test database! ` +
        `Tests must strictly run against 'stockpilot_test'. Aborting execution immediately.`,
    );
  }

  return currentDb;
}

/**
 * Safely removes only synthetic records created for a specific test tenant (organizationId).
 * Executes deletions in reverse foreign-key dependency order to prevent constraint violations.
 * Never touches records belonging to other tenants or databases.
 */
export async function cleanTestTenant(
  prisma: PrismaClient,
  organizationId: string,
  extraUserIds: string[] = [],
): Promise<void> {
  await assertTestDatabaseConnection(prisma);

  await prisma.$transaction(async (tx) => {
    // 1. Intelligence & Copilot
    await tx.copilotMessage.deleteMany({
      where: { conversation: { organizationId } },
    });
    await tx.copilotConversation.deleteMany({
      where: { organizationId },
    });
    await tx.inventoryAnomaly.deleteMany({
      where: { organizationId },
    });
    await tx.anomalyDetectionRun.deleteMany({
      where: { organizationId },
    });
    await tx.demandForecastPoint.deleteMany({
      where: { forecastRun: { organizationId } },
    });
    await tx.demandForecastRun.deleteMany({
      where: { organizationId },
    });

    // 2. Audit logs & Notifications
    await tx.auditLog.deleteMany({
      where: { organizationId },
    });
    await tx.notification.deleteMany({
      where: { organizationId },
    });

    // 3. Procurement
    await tx.purchaseOrderReceipt.deleteMany({
      where: { organizationId },
    });
    await tx.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { organizationId } },
    });
    await tx.purchaseOrder.deleteMany({
      where: { organizationId },
    });
    await tx.supplier.deleteMany({
      where: { organizationId },
    });

    // 4. Inventory Ledger & Balances
    await tx.inventoryTransaction.deleteMany({
      where: { organizationId },
    });
    await tx.inventoryBalance.deleteMany({
      where: { organizationId },
    });

    // 5. Locations & Warehouses
    await tx.storageLocation.deleteMany({
      where: { organizationId },
    });
    await tx.warehouse.deleteMany({
      where: { organizationId },
    });

    // 6. Products & Categories
    await tx.product.deleteMany({
      where: { organizationId },
    });
    await tx.productCategory.deleteMany({
      where: { organizationId },
    });

    // 7. Organization Memberships & Invitations
    await tx.organizationInvitation.deleteMany({
      where: { organizationId },
    });
    await tx.organizationMembership.deleteMany({
      where: { organizationId },
    });

    // 8. Organization itself
    await tx.organization.deleteMany({
      where: { id: organizationId },
    });

    // 9. Extra synthetic users created specifically for this test
    if (extraUserIds.length > 0) {
      await tx.refreshToken.deleteMany({
        where: { userId: { in: extraUserIds } },
      });
      await tx.notification.deleteMany({
        where: { recipientUserId: { in: extraUserIds } },
      });
      await tx.user.deleteMany({
        where: { id: { in: extraUserIds } },
      });
    }
  });
}
