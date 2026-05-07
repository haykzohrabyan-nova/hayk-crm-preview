import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET() {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  // All Leads tab: all non-inbox leads (Pending + Validated) — shared queue
  // Other tabs: scoped to this SDR's own leads (sdr_id = userId)
  const [allResult, mineResult] = await Promise.all([
    admin
      .from("leads")
      .select("status")
      .eq("is_inbox", false)
      .in("status", ["Pending", "Validated"]),
    admin
      .from("leads")
      .select("status")
      .eq("is_inbox", false)
      .eq("sdr_id", userId)
      .in("status", ["On Hold", "Routed to Sales", "Rejected"]),
  ]);

  const allLeads = allResult.data ?? [];
  const myLeads = mineResult.data ?? [];

  const counts = {
    all: allLeads.length,
    hold: myLeads.filter((l) => l.status === "On Hold").length,
    routed: myLeads.filter((l) => l.status === "Routed to Sales").length,
    rejected: myLeads.filter((l) => l.status === "Rejected").length,
  };

  return NextResponse.json({ counts });
}
