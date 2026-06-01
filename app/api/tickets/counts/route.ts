import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireAnyPageAccess } from "@/lib/auth/require-page-access";
import { isAccountantQuoteWorkflowDenied } from "@/lib/utils/ticket-access";
import {
  countExact,
  scopedTicketCount,
} from "@/lib/utils/db-counts";

// ─── GET /api/tickets/counts ──────────────────────────────────────────────────
// Returns counts for all quote/order tab badges in one lightweight request.
//
// Response: { counts: { drafts, sent, approved, orders, in_production, completed, routed, total } }

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  if (isAccountantQuoteWorkflowDenied(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  const pageDeny = await requireAnyPageAccess(userId!, roleName, ["/quotes", "/orders"]);
  if (pageDeny) return pageDeny;

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
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "order")),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "in_production")),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "completed")),
      scopedTicketCount(admin, roleName, userId, (q) =>
        q.eq("ticket_kind", "quote").eq("ticket_status", "cancelled"),
      ),
      scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "routed")),
      scopedTicketCount(admin, roleName, userId, (q) => q),
      roleName === "sales" || roleName === "admin"
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
      routed: roleName === "sales" || roleName === "admin" ? globalRouted : scopedRouted,
    };

    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
