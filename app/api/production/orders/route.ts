import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// GET /api/production/orders
// Returns all orders currently in production (ticket_status = in_production).
// Accessible to all authenticated roles — the page itself is permission-gated.

export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data: orders, error } = await admin
    .from("job_tickets")
    .select(`
      id, reference_code, title,
      ticket_status,
      payment_status,
      quote_final_total,
      payment_amount_received,
      ticket_payment_strategy,
      ticket_net_terms_label,
      priority, due_date, rush,
      production_released_at,
      created_at,
      customer:customers(id, first_name, last_name, company)
    `)
    .eq("ticket_status", "in_production")
    .order("production_released_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: orders ?? [] });
}
