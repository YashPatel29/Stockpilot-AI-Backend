import bcrypt from "bcrypt";
import { appConfig } from "../../config/app.config";

/**
 * Standard salt rounds for password hashing.
 * Uses 10 in test environment to avoid slowing down unit suites, 12 in development/production.
 */
const SALT_ROUNDS = appConfig.server.nodeEnv === "test" ? 10 : 12;

/**
 * Hashes a plaintext password securely using bcrypt with appropriate cost factor.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a candidate plaintext password against a stored bcrypt hash using constant-time comparison.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
