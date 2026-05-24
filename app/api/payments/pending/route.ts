import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// GET /api/payments/pending
// Returns orders that have customer-submitted payment evidence
// but whose payment has not yet been confirmed (payment_paid_at IS NULL).
// Restricted to accountant and admin roles.

export async function GET() {
  const { roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "accountant" && roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: orders, error } = await admin
    .from("job_tickets")
    .select(`
      id, reference_code, title,
      quote_final_total,
      payment_method_used,
      payment_evidence_url,
      payment_evidence_submitted_at,
      payment_evidence_amount,
      payment_amount_received,
      deposit_paid_at,
      ticket_payment_strategy,
      ticket_status,
      customer:customers(first_name, last_name, company)
    `)
    .not("payment_evidence_url", "is", null)
    .is("payment_paid_at", null)
    .in("ticket_status", ["sent", "order", "in_production", "completed"])
    .order("payment_evidence_submitted_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: orders ?? [] });
}
