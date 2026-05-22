import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  ORDERS_VISIBLE_PAYMENT_FILTER,
  scopeJobTicketsQuery,
  type TicketSelectQuery,
} from "@/lib/utils/db-counts";

// GET /api/orders/orders
// Scoped list for /orders — order + cancelled rows only, slim payload (no quote_skus).

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  let query = scopeJobTicketsQuery(
    admin.from("job_tickets").select(`
      id, ticket_kind, ticket_status,
      payment_status,
      payment_evidence_url,
      payment_evidence_submitted_at,
      payment_paid_at,
      title, reference_code, quote_final_total,
      priority, due_date, rush, created_at,
      customer:customers(id, first_name, last_name, company)
    `) as TicketSelectQuery,
    roleName,
    userId,
  );

  const { data, error } = await query
    .in("ticket_status", ["order", "cancelled"])
    .or(ORDERS_VISIBLE_PAYMENT_FILTER)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
