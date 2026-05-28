import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  fetchCompletedOrders,
  fetchCompletedTabCounts,
} from "@/lib/utils/fetch-completed-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import { parseCompletedListFilters } from "@/lib/utils/ticket-list-filters";

/** GET /api/completed/page-data — paginated completed list + count in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const filters = parseCompletedListFilters(request.nextUrl.searchParams, roleName);
  const pagination = parseListPaginationParams(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const [{ rows, total }, counts] = await Promise.all([
      fetchCompletedOrders(admin, roleName!, userId!, filters, pagination),
      fetchCompletedTabCounts(admin, roleName!, userId!, filters),
    ]);
    return NextResponse.json({
      orders: rows,
      counts,
      pagination: toPaginatedMeta({ ...pagination, total, rowCount: rows.length }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load completed data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
