/**
 * Validates a redirect path is safe (internal only — starts with "/" but not "//").
 * Returns null for anything that could be an open redirect.
 */
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}
