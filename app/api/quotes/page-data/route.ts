import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchQuotesList, fetchQuotesTabCounts } from "@/lib/utils/fetch-quotes-data";
import { isAccountantQuoteWorkflowDenied } from "@/lib/utils/ticket-access";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import { parseQuotesListFilters } from "@/lib/utils/ticket-list-filters";
import {
  attachLinePreviews,
  fetchTicketLinePreviewsBatch,
} from "@/lib/utils/fetch-ticket-line-previews-batch";

/** GET /api/quotes/page-data — paginated quote list + tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  if (isAccountantQuoteWorkflowDenied(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  const pageDeny = await requirePageAccess(userId!, roleName, "/quotes");
  if (pageDeny) return pageDeny;

  const filters = parseQuotesListFilters(request.nextUrl.searchParams, roleName);
  const pagination = parseListPaginationParams(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const [{ rows, total }, counts] = await Promise.all([
      fetchQuotesList(admin, roleName, userId!, filters, pagination),
      fetchQuotesTabCounts(admin, roleName, userId!, filters),
    ]);

    const previews = await fetchTicketLinePreviewsBatch(admin, rows);
    const tickets = attachLinePreviews(rows, previews);

    return NextResponse.json({
      tickets,
      counts,
      pagination: toPaginatedMeta({ ...pagination, total, rowCount: rows.length }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load quotes data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
