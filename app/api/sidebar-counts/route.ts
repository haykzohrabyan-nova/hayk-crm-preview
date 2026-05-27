import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchSidebarCounts } from "@/lib/utils/sidebar-counts-query";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const routesParam = request.nextUrl.searchParams.get("routes") ?? "";
  const visibleRoutes = routesParam
    ? new Set(routesParam.split(",").map((r) => r.trim()).filter(Boolean))
    : undefined;

  const admin = createAdminClient();

  try {
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
