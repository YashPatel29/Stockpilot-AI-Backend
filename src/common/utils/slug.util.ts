/**
 * Generates a URL-friendly, sanitized slug from a name string.
 */
export function slugify(text: string): string {
  const sanitized = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars except spaces and hyphens
    .replace(/[\s_-]+/g, "-") // Collapse whitespace, underscores, hyphens
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens

  return sanitized || "org";
}

