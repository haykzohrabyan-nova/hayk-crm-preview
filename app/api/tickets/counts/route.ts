import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// ─── GET /api/tickets/counts ──────────────────────────────────────────────────
// Returns counts for all quote/order tab badges in one lightweight request.
//
// Response: { counts: { drafts, sent, approved, orders, routed, total } }

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  // Fetch minimal status data for tickets this user can see (own tickets)
  let query = admin
    .from("job_tickets")
    .select("ticket_kind, ticket_status");

  if (roleName !== "admin" && userId) {
    query = query.eq("created_by_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  const rows = data ?? [];

  const counts: Record<string, number> = {
    drafts:    rows.filter((r) => r.ticket_status === "draft").length,
    sent:      rows.filter((r) => r.ticket_status === "sent").length,
    approved:  rows.filter((r) => r.ticket_status === "approved").length,
    orders:    rows.filter((r) => r.ticket_status === "order").length,
    cancelled: rows.filter((r) => r.ticket_status === "cancelled").length,
    total:     rows.length,
    // Count routed tickets from this user's own rows (SDR) — overridden below for sales/admin
    routed:    rows.filter((r) => r.ticket_status === "routed").length,
  };

  // For sales/admin: replace with global routed count (all SDRs)
  if (roleName === "sales" || roleName === "admin") {
    const { count } = await admin
      .from("job_tickets")
      .select("*", { count: "exact", head: true })
      .eq("ticket_status", "routed");
    counts.routed = count ?? 0;
  }

  return NextResponse.json({ counts });
}
