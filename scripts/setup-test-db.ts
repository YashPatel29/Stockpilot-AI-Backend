import { Client } from "pg";
import "dotenv/config";

/**
 * Safe utility to provision the dedicated test database (stockpilot_test).
 * Connects to PostgreSQL, checks if stockpilot_test exists, and creates it if not.
 * Strictly verifies never to modify or drop stockpilot_dev.
 */
async function main() {
  const devUrl = process.env["DATABASE_URL"];
  if (!devUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const url = new URL(devUrl);
  // Connect to the dev db to check/create the test db
  const client = new Client({
    connectionString: devUrl,
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL on host:", url.hostname, "port:", url.port || 5432);

    const checkRes = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'stockpilot_test';",
    );

    if (checkRes.rowCount === 0) {
      console.log("Database 'stockpilot_test' does not exist. Creating...");
      // Database names cannot be parameterized in CREATE DATABASE
      await client.query('CREATE DATABASE "stockpilot_test";');
      console.log("Database 'stockpilot_test' created successfully.");
    } else {
      console.log("Database 'stockpilot_test' already exists.");
    }
  } catch (err) {
    console.error("Failed to setup test database:", (err as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

