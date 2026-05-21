import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// GET /api/completed/orders
// Returns all completed orders (ticket_status = completed).
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
      priority, due_date, rush,
      updated_at, created_at,
      customer:customers(id, first_name, last_name, company)
    `)
    .eq("ticket_status", "completed")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: orders ?? [] });
}
