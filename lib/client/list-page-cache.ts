/** In-memory cache for list page-data responses (stale-while-revalidate). */

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 48;

type Entry = {
  data: unknown;
  expiresAt: number;
};

const cache = new Map<string, Entry>();

function pruneIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (let i = 0; i < oldest.length - MAX_ENTRIES; i++) {
    cache.delete(oldest[i][0]);
  }
}

export function getListPageCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setListPageCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  pruneIfNeeded();
}

export function invalidateListPageCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export const LIST_PAGE_CACHE_INVALIDATE_EVENT = "bazaar:invalidate-list-cache";
