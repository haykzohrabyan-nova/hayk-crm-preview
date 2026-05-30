import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Routes any authenticated role may access regardless of role_permissions. */
const UNIVERSAL_ROUTES = ["/dashboard", "/settings", "/profile"];

/**
 * Mirrors proxy.ts page RBAC for API routes. Admin bypasses. Returns 403 response or null.
 */
export async function requirePageAccess(
  userId: string,
  roleName: string,
  requiredRoute: string,
): Promise<NextResponse | null> {
  if (roleName === "admin") return null;

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
