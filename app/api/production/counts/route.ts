import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// GET /api/production/counts
// Returns tab badge counts for the /production page.

export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("job_tickets")
    .select("payment_status, ticket_payment_strategy")
    .eq("ticket_status", "in_production");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const total = rows.length;

  // "Balance Due" = in production but not fully paid AND not net terms
  const balanceDue = rows.filter(
    (r) => r.payment_status !== "paid" && r.ticket_payment_strategy !== "net"
  ).length;

  return NextResponse.json({
    counts: { all: total, balance_due: balanceDue },
  });
}
