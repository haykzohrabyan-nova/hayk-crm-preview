import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchOrdersList, fetchOrdersTabCounts } from "@/lib/utils/fetch-orders-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import { parseOrdersListFilters } from "@/lib/utils/ticket-list-filters";
import {
  attachLinePreviews,
  fetchTicketLinePreviewsBatch,
} from "@/lib/utils/fetch-ticket-line-previews-batch";

/** GET /api/orders/page-data — paginated orders list + tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requirePageAccess(userId!, roleName, "/orders");
  if (pageDeny) return pageDeny;

  const { searchParams } = request.nextUrl;
  const filters = parseOrdersListFilters(searchParams, roleName);
  const pagination = parseListPaginationParams(searchParams);
  const admin = createAdminClient();

  try {
    const [{ rows, total }, counts] = await Promise.all([
      fetchOrdersList(admin, roleName, userId!, filters, pagination),
      fetchOrdersTabCounts(admin, roleName, userId!, filters),
    ]);

    const previews = await fetchTicketLinePreviewsBatch(admin, rows);
    const orders = attachLinePreviews(rows, previews);

    return NextResponse.json({
      orders,
      counts,
      pagination: toPaginatedMeta({
        ...pagination,
        total,
        rowCount: rows.length,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load orders data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
