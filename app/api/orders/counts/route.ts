import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchOrdersTabCounts } from "@/lib/utils/fetch-orders-data";
import { parseOrdersListFilters } from "@/lib/utils/ticket-list-filters";

/** GET /api/orders/counts — tab badge counts for /orders (optional search/date/user filters). */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const filters = parseOrdersListFilters(request.nextUrl.searchParams, roleName);
  const admin = createAdminClient();

  try {
    const counts = await fetchOrdersTabCounts(admin, roleName, userId!, filters);
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
