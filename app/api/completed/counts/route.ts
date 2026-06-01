import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchCompletedTabCounts } from "@/lib/utils/fetch-completed-data";
import { parseCompletedListFilters } from "@/lib/utils/ticket-list-filters";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requirePageAccess(userId!, roleName, "/completed");
  if (pageDeny) return pageDeny;

  const filters = parseCompletedListFilters(request.nextUrl.searchParams, roleName);
  const admin = createAdminClient();

  try {
    const counts = await fetchCompletedTabCounts(admin, roleName!, userId!, filters);
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
