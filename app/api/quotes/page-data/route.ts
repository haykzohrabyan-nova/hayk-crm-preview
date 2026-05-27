import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchQuotesList, fetchQuotesTabCounts } from "@/lib/utils/fetch-quotes-data";

/** GET /api/quotes/page-data — quote list + tab counts in one auth pass. */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [tickets, counts] = await Promise.all([
      fetchQuotesList(admin, roleName, userId!),
      fetchQuotesTabCounts(admin, roleName, userId!),
    ]);
    return NextResponse.json({ tickets, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load quotes data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
