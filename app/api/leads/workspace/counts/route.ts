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

  // Scoped tabs (Hold / Routed / Rejected):
  // - SDRs see only their own leads (sdr_id = userId)
  // - Admins see all leads across every SDR
  let scopedQuery = admin
    .from("leads")
    .select("status")
    .eq("is_inbox", false)
    .in("status", ["On Hold", "Routed to Sales", "Rejected"]);

  if (roleName !== "admin" && userId) {
    scopedQuery = scopedQuery.eq("sdr_id", userId);
  }

  const [allResult, scopedResult] = await Promise.all([allQuery, scopedQuery]);

  const allLeads = allResult.data ?? [];
  const scopedLeads = scopedResult.data ?? [];

  const counts = {
    all: allLeads.length,
    hold: scopedLeads.filter((l) => l.status === "On Hold").length,
    routed: scopedLeads.filter((l) => l.status === "Routed to Sales").length,
    rejected: scopedLeads.filter((l) => l.status === "Rejected").length,
  };

  return NextResponse.json({ counts });
}
