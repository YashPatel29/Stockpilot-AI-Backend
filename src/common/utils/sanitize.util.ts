/**
 * List of sensitive key patterns that must be redacted from logs, responses, and errors.
 */
export const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "accessToken",
  "refreshToken",
  "jwtAccessSecret",
  "jwtRefreshSecret",
  "creditCard",
  "cvv",
  "ssn",
]);

const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * Recursively redacts sensitive keys from any arbitrary object or array.
 * Safe against circular references and non-object primitives.
 */
export function sanitizeData<T>(data: T, seen = new WeakSet<object>()): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (data instanceof Date || data instanceof RegExp || data instanceof Error) {
    return data;
  }

  if (seen.has(data as object)) {
    return "[CIRCULAR]" as unknown as T;
  }

  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, seen)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = Array.from(SENSITIVE_KEYS).some((sens) => {
      const lowerSens = sens.toLowerCase();
      return (
        lowerKey === lowerSens || lowerKey.endsWith(`_${lowerSens}`) || lowerKey.endsWith(lowerSens)
      );
    });

    if (isSensitive && (typeof value !== "object" || value === null)) {
      sanitized[key] = REDACTED_PLACEHOLDER;
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeData(value, seen);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
