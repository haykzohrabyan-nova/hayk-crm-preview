import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

/**
 * Returns tab counts for the Sales Pipeline page.
 * - pipeline: Routed to Sales leads with sales_status Ongoing, Quote Sent, or null
 * - hold:     Routed to Sales leads with sales_status = 'On Hold'
 * - rejected: Leads with status = 'Rejected' AND prev_status = 'Routed to Sales'
 *             (i.e. rejected FROM the sales pipeline, not SDR-rejected before reaching sales)
 *
 * Sales reps only see unclaimed leads + their own (same filter as the workspace route).
 * Admins see all.
 */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  let routedQuery = admin
    .from("leads")
    .select("sales_status, sales_owner_id")
    .eq("is_inbox", false)
    .eq("status", "Routed to Sales");

  if (roleName === "sales" && userId) {
    routedQuery = routedQuery.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
  }

  const [routedResult, rejectedResult] = await Promise.all([
    routedQuery,
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_inbox", false)
      .eq("status", "Rejected")
      .eq("prev_status", "Routed to Sales"),
  ]);

  const routed = routedResult.data ?? [];

  const counts = {
    pipeline: routed.filter(
      (l) =>
        l.sales_status === "Ongoing" ||
        l.sales_status === "Quote Sent" ||
        l.sales_status === null
    ).length,
    hold: routed.filter((l) => l.sales_status === "On Hold").length,
    rejected: rejectedResult.count ?? 0,
  };

  return NextResponse.json({ counts });
}
