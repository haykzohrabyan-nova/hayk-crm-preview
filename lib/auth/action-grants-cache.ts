import { resolveActionGrants } from "@/lib/auth/resolve-action-grants";

const ACTION_GRANTS_TTL_MS = 45_000;

type GrantsEntry = {
  grants: string[];
  expiresAt: number;
};

const actionGrantsCache = new Map<string, GrantsEntry>();

function cacheKey(userId: string, roleName: string): string {
  return `${userId}:${roleName}`;
}

/** Cached mirror of `resolveActionGrants` — shared by `requireSession` and permission checks. */
export async function getCachedActionGrants(
  userId: string,
  roleName: string,
): Promise<string[]> {
  const key = cacheKey(userId, roleName);
  const hit = actionGrantsCache.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.grants;
  }

  const grants = await resolveActionGrants(userId, roleName);
  actionGrantsCache.set(key, {
    grants,
    expiresAt: Date.now() + ACTION_GRANTS_TTL_MS,
  });
  return grants;
}

export function setCachedActionGrants(
  userId: string,
  roleName: string,
  grants: string[],
) {
  actionGrantsCache.set(cacheKey(userId, roleName), {
    grants,
    expiresAt: Date.now() + ACTION_GRANTS_TTL_MS,
  });
}

export function invalidateActionGrantsCache(userId?: string) {
  if (!userId) {
    actionGrantsCache.clear();
    return;
  }
  for (const key of actionGrantsCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      actionGrantsCache.delete(key);
    }
  }
}
