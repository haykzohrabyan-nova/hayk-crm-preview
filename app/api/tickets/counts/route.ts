import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  countExact,
  ORDERS_COUNT_PAYMENT_FILTER,
  scopedTicketCount,
} from "@/lib/utils/db-counts";

// ─── GET /api/tickets/counts ──────────────────────────────────────────────────
// Returns counts for all quote/order tab badges in one lightweight request.
//
// Response: { counts: { drafts, sent, approved, orders, in_production, completed, routed, total } }

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [
      drafts,
      sent,
      approved,
      orders,
      in_production,
      completed,
      cancelled,
      scopedRouted,
      scopedTotal,
      globalRouted,
    ] = await Promise.all([
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "draft")),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "sent")),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "approved")),
      scopedTicketCount(admin, roleName, userId, (q) =>
        q.eq("ticket_status", "order").or(ORDERS_COUNT_PAYMENT_FILTER),
      ),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "in_production")),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "completed")),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "cancelled")),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "routed")),
      scopedTicketCount(admin, roleName, userId, (q) => q),
      roleName === "sales" || roleName === "admin" || roleName === "accountant"
        ? countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "routed"))
        : Promise.resolve(0),
    ]);

    const counts = {
      drafts,
      sent,
      approved,
      orders,
      in_production,
      completed,
      cancelled,
      total: scopedTotal,
      routed:
        roleName === "sales" || roleName === "admin" || roleName === "accountant"
          ? globalRouted
          : scopedRouted,
    };

    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
