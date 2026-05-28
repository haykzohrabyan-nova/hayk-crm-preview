import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchQuotesList, fetchQuotesTabCounts } from "@/lib/utils/fetch-quotes-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import { parseQuotesListFilters } from "@/lib/utils/ticket-list-filters";

/** GET /api/quotes/page-data — paginated quote list + tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const filters = parseQuotesListFilters(request.nextUrl.searchParams, roleName);
  const pagination = parseListPaginationParams(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const [{ rows, total }, counts] = await Promise.all([
      fetchQuotesList(admin, roleName, userId!, filters, pagination),
      fetchQuotesTabCounts(admin, roleName, userId!, filters),
    ]);
    return NextResponse.json({
      tickets: rows,
      counts,
      pagination: toPaginatedMeta({ ...pagination, total, rowCount: rows.length }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load quotes data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
