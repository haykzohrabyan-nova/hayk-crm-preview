/** Optional website / social URL — empty is allowed. */

export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function validateWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = normalizeWebsite(trimmed);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Enter a valid website or social profile URL.";
    }

    const host = url.hostname;
    if (!host || !/^[a-z0-9.-]+$/i.test(host)) {
      return "Enter a valid website or social profile URL.";
    }

    if (!host.includes(".") && host !== "localhost") {
      return "Enter a valid website or social profile URL (e.g. https://example.com).";
    }

    return null;
  } catch {
    return "Enter a valid website or social profile URL (e.g. https://example.com).";
  }
}
