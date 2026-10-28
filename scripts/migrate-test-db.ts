import { execSync } from "node:child_process";
import "dotenv/config";

/**
 * Safely applies Prisma migrations to the dedicated test database (stockpilot_test).
 * Fails closed if the target database name is not confirmed to be a dedicated test database.
 */
function main() {
  const baseDbUrl = process.env["DATABASE_URL_TEST"] || process.env["DATABASE_URL"];
  if (!baseDbUrl) {
    console.error("ERROR: Neither DATABASE_URL_TEST nor DATABASE_URL is defined.");
    process.exit(1);
  }

  const url = new URL(baseDbUrl);
  const dbName = url.pathname.replace(/^\//, "");

  // Safety Assertion: Target must be explicitly a test database
  if (!dbName.toLowerCase().includes("test")) {
    console.error(
      `ABORT: Unsafe database target '${dbName}'. Migrations can only be applied to a database containing 'test' (e.g. 'stockpilot_test').`,
    );
    process.exit(1);
  }

  // Construct confirmed test URL
  url.pathname = "/stockpilot_test";
  const testDbUrl = url.toString();

  console.log(`Applying Prisma migrations to dedicated test database '${url.pathname.replace(/^\//, "")}'...`);

  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
      },
    });
    console.log("Prisma migrations applied successfully to dedicated test database!");
  } catch (err) {
    console.error("Failed to apply migrations to test database:", (err as Error).message);
    process.exit(1);
  }
}

main();

