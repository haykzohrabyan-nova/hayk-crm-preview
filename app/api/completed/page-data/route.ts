import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  fetchCompletedOrders,
  fetchCompletedTabCounts,
} from "@/lib/utils/fetch-completed-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import { parseCompletedListFilters } from "@/lib/utils/ticket-list-filters";
import {
  attachLinePreviews,
  fetchTicketLinePreviewsBatch,
  toTicketRefRows,
} from "@/lib/utils/fetch-ticket-line-previews-batch";

/** GET /api/completed/page-data — paginated completed list + count in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requirePageAccess(userId!, roleName, "/completed");
  if (pageDeny) return pageDeny;

  const filters = parseCompletedListFilters(request.nextUrl.searchParams, roleName);
  const pagination = parseListPaginationParams(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const [{ rows, total }, counts] = await Promise.all([
      fetchCompletedOrders(admin, roleName!, userId!, filters, pagination),
      fetchCompletedTabCounts(admin, roleName!, userId!, filters),
    ]);

    const refs = toTicketRefRows(
      rows as Array<{ id?: string; reference_code?: string | null }>,
    );
    const previews = await fetchTicketLinePreviewsBatch(admin, refs);
    const orders = attachLinePreviews(rows, previews);

    return NextResponse.json({
      orders,
      counts,
      pagination: toPaginatedMeta({ ...pagination, total, rowCount: rows.length }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load completed data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
