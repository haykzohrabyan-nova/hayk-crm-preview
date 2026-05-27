/** Optional website / social URL — empty is allowed; http(s):// prefix is optional. */

export const WEBSITE_FIELD_PLACEHOLDER = "example.com or instagram.com/page";

const INVALID_MSG = "Enter a valid website or social profile URL (e.g. example.com).";

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
      return INVALID_MSG;
    }

    const host = url.hostname;
    if (!host || !/^[a-z0-9.-]+$/i.test(host)) {
      return INVALID_MSG;
    }

    if (!host.includes(".") && host !== "localhost") {
      return INVALID_MSG;
    }

    return null;
  } catch {
    return INVALID_MSG;
  }
}
