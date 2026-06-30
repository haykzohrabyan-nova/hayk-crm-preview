/** Page routes reserved for the admin role — not grantable to custom roles. */
export const ADMIN_ONLY_PAGE_ROUTES = ["/admin", "/reports", "/activity-log", "/operations"] as const;

export function isAdminOnlyPageRoute(route: string): boolean {
  return (ADMIN_ONLY_PAGE_ROUTES as readonly string[]).includes(route);
}

/** Match App Router pathname (includes subpaths). */
export function isAdminOnlyPagePath(pathname: string): boolean {
  return ADMIN_ONLY_PAGE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Non-admin roles must never see or reach admin-only pages (ignores stale role_permissions). */
export function isNonAdminDeniedPage(
  roleName: string | null | undefined,
  route: string,
): boolean {
  return roleName !== "admin" && isAdminOnlyPageRoute(route);
}

export function filterPagesForRole<T extends { route: string }>(
  pages: T[],
  roleName: string | null | undefined,
): T[] {
  if (roleName === "admin") return pages;
  return pages.filter((p) => !isAdminOnlyPageRoute(p.route));
}
