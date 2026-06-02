import { createAdminClient } from "@/lib/supabase/admin";
import { isNonAdminDeniedPage } from "@/lib/auth/admin-only-pages";

/** Routes any authenticated role may access regardless of role_permissions. */
export const UNIVERSAL_ROUTES = ["/dashboard", "/profile"] as const;

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
