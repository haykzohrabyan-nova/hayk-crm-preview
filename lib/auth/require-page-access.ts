import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminOnlyPagePath, isNonAdminDeniedPage } from "@/lib/auth/admin-only-pages";

/** Routes any authenticated role may access regardless of role_permissions. */
const UNIVERSAL_ROUTES = ["/dashboard", "/profile"];

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
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  if (
    UNIVERSAL_ROUTES.some(
      (route) => requiredRoute === route || requiredRoute.startsWith(`${route}/`),
    )
  ) {
    return null;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role_id")
    .eq("id", userId)
    .single();

  if (!profile?.role_id) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const { data: permissions } = await admin
    .from("role_permissions")
    .select("pages!inner(route)")
    .eq("role_id", profile.role_id);

  const allowedRoutes = (permissions ?? []).map(
    (p) => (p.pages as unknown as { route: string }).route,
  );

  const hasAccess = allowedRoutes.some(
    (route) => requiredRoute === route || requiredRoute.startsWith(`${route}/`),
  );

  if (!hasAccess) {
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
  for (const route of requiredRoutes) {
    const deny = await requirePageAccess(userId, roleName, route);
    if (!deny) return null;
  }
  return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
}

/** Page routes this user may access — mirrors proxy + role_permissions (server-side only). */
export async function resolveAllowedPageRoutes(
  userId: string,
  roleName: string,
): Promise<string[]> {
  const admin = createAdminClient();

  if (roleName === "admin") {
    const { data: pages } = await admin.from("pages").select("route");
    return (pages ?? []).map((p) => p.route as string);
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role_id")
    .eq("id", userId)
    .single();

  if (!profile?.role_id) return [...UNIVERSAL_ROUTES];

  const { data: permissions } = await admin
    .from("role_permissions")
    .select("pages!inner(route)")
    .eq("role_id", profile.role_id);

  const permitted = (permissions ?? []).map(
    (p) => (p.pages as unknown as { route: string }).route,
  );

  const grantable = permitted.filter((route) => !isNonAdminDeniedPage(roleName, route));

  return [...UNIVERSAL_ROUTES, ...grantable];
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

export async function requireTicketDetailPageAccess(
  userId: string,
  roleName: string,
): Promise<NextResponse | null> {
  return requireAnyPageAccess(userId, roleName, [...TICKET_DETAIL_PAGE_ROUTES]);
}

/** Lead drawer / mutation APIs — caller must have `/leads` or `/sales` page permission. */
export async function requireLeadApiPageAccess(
  userId: string,
  roleName: string,
): Promise<NextResponse | null> {
  return requireAnyPageAccess(userId, roleName, ["/leads", "/sales"]);
}
