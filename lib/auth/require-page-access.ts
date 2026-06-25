import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isAdminOnlyPagePath, isNonAdminDeniedPage } from "@/lib/auth/admin-only-pages";
import { getCachedAllowedPageRoutes } from "@/lib/auth/allowed-routes-cache";
import { UNIVERSAL_ROUTES } from "@/lib/auth/resolve-allowed-page-routes";

export { resolveAllowedPageRoutes, UNIVERSAL_ROUTES } from "@/lib/auth/resolve-allowed-page-routes";

function routeMatches(allowedRoute: string, requiredRoute: string): boolean {
  return (
    requiredRoute === allowedRoute || requiredRoute.startsWith(`${allowedRoute}/`)
  );
}

function hasPageRoute(allowedRoutes: string[], requiredRoute: string): boolean {
  if (
    UNIVERSAL_ROUTES.some((route) => routeMatches(route, requiredRoute))
  ) {
    return true;
  }
  return allowedRoutes.some((route) => routeMatches(route, requiredRoute));
}

/**
 * Mirrors proxy.ts page RBAC for API routes. Admin bypasses. Returns 403 response or null.
 */
export async function requirePageAccess(
  userId: string,
  roleName: string,
  requiredRoute: string,
): Promise<NextResponse | null> {
  if (roleName === "admin") return null;

  if (isNonAdminDeniedPage(roleName, requiredRoute) || isAdminOnlyPagePath(requiredRoute)) {
    Sentry.logger.warn("requirePageAccess: role denied by policy", { userId, roleName, requiredRoute });
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const allowedRoutes = await getCachedAllowedPageRoutes(userId, roleName);
  if (!hasPageRoute(allowedRoutes, requiredRoute)) {
    Sentry.logger.warn("requirePageAccess: route not in allowedRoutes", { userId, roleName, requiredRoute });
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  return null;
}

/** Pass if the user has any of the listed page routes (admin always passes). */
export async function requireAnyPageAccess(
  userId: string,
  roleName: string,
  requiredRoutes: string[],
): Promise<NextResponse | null> {
  if (roleName === "admin") return null;

  const allowedRoutes = await getCachedAllowedPageRoutes(userId, roleName);
  const hasAny = requiredRoutes.some((required) => hasPageRoute(allowedRoutes, required));
  if (!hasAny) {
    Sentry.logger.warn("requireAnyPageAccess: no matching route", { userId, roleName, requiredRoutes });
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

/** Page routes that may open ticket detail, PDF, print, or PATCH. */
export const TICKET_DETAIL_PAGE_ROUTES = [
  "/quotes",
  "/orders",
  "/payments",
  "/completed",
  "/crm",
  "/leads",
  "/sales",
] as const;

/** Sync check when `requireSession()` already returned `allowedRoutes`. */
export function checkTicketDetailPageAccess(
  allowedRoutes: string[],
  roleName: string,
): NextResponse | null {
  if (roleName === "admin") return null;

  const hasTicketPage = TICKET_DETAIL_PAGE_ROUTES.some((required) =>
    allowedRoutes.some((route) => routeMatches(route, required)),
  );

  if (!hasTicketPage) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  return null;
}

export async function requireTicketDetailPageAccess(
  userId: string,
  roleName: string,
): Promise<NextResponse | null> {
  if (roleName === "admin") return null;
  const allowed = await getCachedAllowedPageRoutes(userId, roleName);
  return checkTicketDetailPageAccess(allowed, roleName);
}

/** Lead drawer / mutation APIs — caller must have `/leads` or `/sales` page permission. */
export async function requireLeadApiPageAccess(
  userId: string,
  roleName: string,
): Promise<NextResponse | null> {
  return requireAnyPageAccess(userId, roleName, ["/leads", "/sales"]);
}
