import { createHash } from "crypto";
import type { SessionSuccess } from "@/lib/auth/require-session";

const SESSION_CACHE_TTL_MS = 45_000;

type CachedEntry = {
  result: SessionSuccess;
  expiresAt: number;
};

const sessionCache = new Map<string, CachedEntry>();

/** Cookies that change without auth state — exclude so dev HMR does not bust the cache. */
const SESSION_CACHE_IGNORE = new Set(["__next_hmr_refresh_hash__"]);

export function buildSessionCacheKey(
  cookieParts: Array<{ name: string; value: string }>,
): string {
  const serialized = cookieParts
    .filter((c) => !SESSION_CACHE_IGNORE.has(c.name))
    .map((c) => `${c.name}=${c.value}`)
    .sort()
    .join("|");
  return createHash("sha256").update(serialized).digest("hex");
}

export function getCachedSession(cacheKey: string): SessionSuccess | null {
  const entry = sessionCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(cacheKey);
    return null;
  }
  return entry.result;
}

export function setCachedSession(cacheKey: string, result: SessionSuccess) {
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
