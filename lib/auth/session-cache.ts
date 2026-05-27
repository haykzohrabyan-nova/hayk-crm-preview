import { createHash } from "crypto";
import type { SessionResult } from "@/lib/auth/require-session";

const SESSION_CACHE_TTL_MS = 3000;

type CachedEntry = {
  result: Extract<SessionResult, { errorResponse: null }>;
  expiresAt: number;
};

const sessionCache = new Map<string, CachedEntry>();

export function buildSessionCacheKey(
  cookieParts: Array<{ name: string; value: string }>,
): string {
  const serialized = cookieParts
    .map((c) => `${c.name}=${c.value}`)
    .sort()
    .join("|");
  return createHash("sha256").update(serialized).digest("hex");
}

export function getCachedSession(cacheKey: string): Extract<SessionResult, { errorResponse: null }> | null {
  const entry = sessionCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(cacheKey);
    return null;
  }
  return entry.result;
}

export function setCachedSession(
  cacheKey: string,
  result: Extract<SessionResult, { errorResponse: null }>,
) {
  sessionCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
}

export function clearSessionCache() {
  sessionCache.clear();
}

/** Test helper — invalidate a single session key after auth failure. */
export function invalidateSessionCacheKey(cacheKey: string) {
  sessionCache.delete(cacheKey);
}
