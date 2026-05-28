import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  fetchProductionOrders,
  fetchProductionTabCounts,
} from "@/lib/utils/fetch-production-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import { parseProductionListFilters } from "@/lib/utils/ticket-list-filters";

/** GET /api/production/page-data — paginated production list + tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const filters = parseProductionListFilters(request.nextUrl.searchParams);
  const pagination = parseListPaginationParams(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const [{ rows, total }, counts] = await Promise.all([
      fetchProductionOrders(admin, filters, pagination),
      fetchProductionTabCounts(admin, filters),
    ]);
    return NextResponse.json({
      orders: rows,
      counts,
      pagination: toPaginatedMeta({ ...pagination, total, rowCount: rows.length }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load production data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
