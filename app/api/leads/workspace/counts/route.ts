import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  // All Leads tab: SDRs only count leads they can actually see (unlocked + own lock).
  // Admins see the full total.
  // Other tabs: scoped to this SDR's own leads (sdr_id = userId)
  let allQuery = admin
    .from("leads")
    .select("status, locked_by_id")
    .eq("is_inbox", false)
    .in("status", ["Pending", "Validated"]);

  if (roleName === "sdr" && userId) {
    allQuery = allQuery.or(`locked_by_id.is.null,locked_by_id.eq.${userId}`);
  }

  // Scoped tabs (Hold / Routed / Rejected / Won):
  // - SDRs see only their own leads (sdr_id = userId)
  // - Admins see all leads across every SDR
  let scopedQuery = admin
    .from("leads")
    .select("status, sales_status")
    .eq("is_inbox", false)
    .in("status", ["On Hold", "Routed to Sales", "Rejected"]);

  // Won leads: status = "Routed to Sales" AND sales_status = "Won"
  let wonQuery = admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_inbox", false)
    .eq("sales_status", "Won");

  if (roleName !== "admin" && userId) {
    scopedQuery = scopedQuery.eq("sdr_id", userId);
    wonQuery = wonQuery.eq("sdr_id", userId);
  }

  const [allResult, scopedResult, wonResult] = await Promise.all([allQuery, scopedQuery, wonQuery]);

  const allLeads = allResult.data ?? [];
  const scopedLeads = scopedResult.data ?? [];

  const counts = {
    all:      allLeads.length,
    hold:     scopedLeads.filter((l) => l.status === "On Hold").length,
    routed:   scopedLeads.filter((l) => l.status === "Routed to Sales").length,
    rejected: scopedLeads.filter((l) => l.status === "Rejected").length,
    won:      wonResult.count ?? 0,
  };

  return NextResponse.json({ counts });
}
