import { createAdminClient } from "@/lib/supabase/admin";
import { filterPagesForRole } from "@/lib/auth/admin-only-pages";
import { isHiddenNavRoute } from "@/lib/auth/hidden-nav-routes";
import type { Page } from "@/lib/types";

const NAV_PAGES_TTL_MS = 45_000;

type NavEntry = {
  pages: Page[];
  expiresAt: number;
};

const navPagesCache = new Map<string, NavEntry>();

function cacheKey(userId: string, roleName: string): string {
  return `${userId}:${roleName}:nav`;
}

/** Sidebar / mobile nav pages — server-only, same rules as layout used to load client-side. */
export async function resolveNavPagesForUser(
  userId: string,
  roleName: string,
  roleId: string | null,
): Promise<Page[]> {
  const key = cacheKey(userId, roleName);
  const hit = navPagesCache.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.pages;
  }

  const admin = createAdminClient();
  let allPages: Page[] = [];

  if (roleName === "admin") {
    const { data } = await admin.from("pages").select("*").order("sort_order");
    allPages = (data ?? []) as Page[];
  } else if (roleId) {
    const { data } = await admin
      .from("role_permissions")
      .select("pages(*)")
      .eq("role_id", roleId);
    allPages = (data ?? [])
      .map((row: unknown) => (row as { pages: Page }).pages)
      .filter((p): p is Page => p !== null && typeof p === "object")
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const filtered = filterPagesForRole(allPages, roleName).filter(
    (p) => !isHiddenNavRoute(p.route),
  );
  const navPages = filtered.filter(
    (p) =>
      p.section === "main" ||
      p.section === "bottom" ||
      (p.section === "admin" && p.route === "/admin"),
  );

  const orderedNavPages = pinOperationsAfterDashboard(navPages);

  navPagesCache.set(key, {
    pages: orderedNavPages,
    expiresAt: Date.now() + NAV_PAGES_TTL_MS,
  });

  return orderedNavPages;
}

/** Admin pipeline view — always directly below Dashboard in sidebar / mobile nav. */
function pinOperationsAfterDashboard(pages: Page[]): Page[] {
  const dashIdx = pages.findIndex((p) => p.route === "/dashboard");
  const opsIdx = pages.findIndex((p) => p.route === "/operations");
  if (dashIdx === -1 || opsIdx === -1 || opsIdx === dashIdx + 1) {
    return pages;
  }
  const next = [...pages];
  const [operations] = next.splice(opsIdx, 1);
  const insertAt = next.findIndex((p) => p.route === "/dashboard") + 1;
  next.splice(insertAt, 0, operations);
  return next;
}

export function invalidateNavPagesCache(userId?: string) {
  if (!userId) {
    navPagesCache.clear();
    return;
  }
  for (const key of navPagesCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      navPagesCache.delete(key);
    }
  }
}
