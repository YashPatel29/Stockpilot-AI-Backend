import dotenv from "dotenv";
import { envSchema, type EnvConfig } from "./env.schema";

// Load environment variables from .env file when available
dotenv.config();

/**
 * Validates a dictionary of environment variables against the Zod schema.
 * Throws a clean, safe, and descriptive Error if validation fails.
 * Guarantees no secret values are logged or exposed in error messages.
 */
export function validateEnv(
  rawEnv: Record<string, unknown> = process.env,
  shouldThrow: boolean = process.env.NODE_ENV === "test",
): EnvConfig {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => {
        const field = issue.path.join(".");
        return `  - [${field}]: ${issue.message}`;
      })
      .join("\n");

    const message = `[FATAL] Environment configuration validation failed at startup:\n${errorDetails}\n\nPlease check your .env file or deployment environment variables against .env.example.`;

    // In testing we want to throw so tests can catch and assert validation failures
    if (shouldThrow || rawEnv.NODE_ENV === "test") {
      throw new Error(message);
    }

    // In runtime server execution, fail fast with a clear error output
    console.error(message);
    process.exit(1);
  }

  return Object.freeze(result.data);
}

/**
 * Singleton validated environment configuration.
 * All modules must import `env` from this file rather than reading `process.env` directly.
 */
export const env: EnvConfig = validateEnv(process.env);
