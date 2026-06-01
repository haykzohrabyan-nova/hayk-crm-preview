import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchQuotesTabCounts } from "@/lib/utils/fetch-quotes-data";
import { isAccountantQuoteWorkflowDenied } from "@/lib/utils/ticket-access";
import { parseQuotesListFilters } from "@/lib/utils/ticket-list-filters";

/** GET /api/quotes/counts — quote-stage tab counts (optional search/date/user filters). */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  if (isAccountantQuoteWorkflowDenied(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  const pageDeny = await requirePageAccess(userId!, roleName, "/quotes");
  if (pageDeny) return pageDeny;

  const filters = parseQuotesListFilters(request.nextUrl.searchParams, roleName);
  const admin = createAdminClient();

  try {
    const counts = await fetchQuotesTabCounts(admin, roleName, userId!, filters);
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
