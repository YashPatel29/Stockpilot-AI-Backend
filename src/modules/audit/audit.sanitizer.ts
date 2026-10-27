/**
 * List of regex patterns matching sensitive fields that must be redacted from audit metadata.
 */
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /token/i,
  /secret/i,
  /hash/i,
  /cookie/i,
  /authorization/i,
  /apikey/i,
  /api_key/i,
  /credential/i,
  /private_key/i,
  /access_token/i,
  /refresh_token/i,
];

/**
 * Checks if a given property key is classified as sensitive.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively sanitizes an input payload, redacting sensitive fields and
 * safely transforming dates and complex objects into JSON-compatible values.
 * Clamps traversal depth to prevent circular reference stack overflows.
 */
export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[MAX_DEPTH_REACHED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle Prisma.Decimal or objects with toJSON / toString
  if (
    typeof value === "object" &&
    "toFixed" in value &&
    typeof (value as { toFixed: unknown }).toFixed === "function"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitizeAuditValue(val, depth + 1);
      }
    }
    return sanitizedObj;
  }

  return String(value);
}

/**
 * Sanitizes an audit metadata object ensuring no secrets or tokens are stored.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const sanitized = sanitizeAuditValue(metadata, 0);
  if (typeof sanitized === "object" && sanitized !== null && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }

  return null;
}
