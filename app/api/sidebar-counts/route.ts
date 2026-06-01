import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { resolveAllowedPageRoutes } from "@/lib/auth/require-page-access";
import { fetchSidebarCounts } from "@/lib/utils/sidebar-counts-query";

/** Routes that may appear as sidebar badge keys — ignore client hints outside this set. */
const BADGE_ROUTES = new Set([
  "/leads",
  "/sales",
  "/quotes",
  "/orders",
  "/payments",
  "/completed",
  "/production",
]);

export async function GET(_request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const allowed = await resolveAllowedPageRoutes(userId!, roleName);
    const visibleRoutes = new Set(
      allowed.filter((route) => BADGE_ROUTES.has(route)),
    );

    const counts = await fetchSidebarCounts(admin, {
      roleName,
      userId: userId!,
      visibleRoutes,
    });
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
