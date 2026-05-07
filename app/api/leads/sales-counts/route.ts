import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

/**
 * Returns tab counts for the Sales Pipeline page.
 * - pipeline: Routed to Sales leads with sales_status Ongoing, Quote Sent, or null
 * - hold:     Routed to Sales leads with sales_status = 'On Hold'
 * - rejected: Leads with status = 'Rejected' (SDR-rejected, visible to sales)
 */
export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const [routedResult, rejectedResult] = await Promise.all([
    admin
      .from("leads")
      .select("sales_status")
      .eq("is_inbox", false)
      .eq("status", "Routed to Sales"),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_inbox", false)
      .eq("status", "Rejected"),
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
