import { resolveAllowedPageRoutes } from "@/lib/auth/resolve-allowed-page-routes";

const ALLOWED_ROUTES_TTL_MS = 45_000;

type RoutesEntry = {
  routes: string[];
  expiresAt: number;
};

const allowedRoutesCache = new Map<string, RoutesEntry>();

function cacheKey(userId: string, roleName: string): string {
  return `${userId}:${roleName}`;
}

/** Cached mirror of `resolveAllowedPageRoutes` — shared by `requireSession` and page-access checks. */
export async function getCachedAllowedPageRoutes(
  userId: string,
  roleName: string,
): Promise<string[]> {
  const key = cacheKey(userId, roleName);
  const hit = allowedRoutesCache.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.routes;
  }

  const routes = await resolveAllowedPageRoutes(userId, roleName);
  allowedRoutesCache.set(key, {
    routes,
    expiresAt: Date.now() + ALLOWED_ROUTES_TTL_MS,
  });
  return routes;
}

export function setCachedAllowedPageRoutes(
  userId: string,
  roleName: string,
  routes: string[],
) {
  allowedRoutesCache.set(cacheKey(userId, roleName), {
    routes,
    expiresAt: Date.now() + ALLOWED_ROUTES_TTL_MS,
  });
}

export function invalidateAllowedRoutesCache(userId?: string) {
  if (!userId) {
    allowedRoutesCache.clear();
    return;
  }
  for (const key of allowedRoutesCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      allowedRoutesCache.delete(key);
    }
  }
}
