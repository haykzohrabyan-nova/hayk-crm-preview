import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { orderListStatus } from "@/lib/utils/order-list-status";
import { scopeJobTicketsQuery, type TicketSelectQuery } from "@/lib/utils/db-counts";

// GET /api/orders/orders
// Scoped list for /orders — order, in_production, and cancelled rows, slim payload (no quote_skus).

const CUSTOMER_CONFIRM_VIAS = new Set(["public_confirm", "public_payment", "public_link"]);

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  let query = scopeJobTicketsQuery(
    admin.from("job_tickets").select(`
      id, ticket_kind, ticket_status, client_confirmed,
      ticket_require_client_confirm,
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
    .in("ticket_status", ["order", "in_production", "cancelled"])
    .order("production_released_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  const orders = (data ?? []) as Array<Record<string, unknown> & {
    id: string;
    ticket_status: string;
    client_confirmed?: boolean | null;
    ticket_require_client_confirm?: boolean | null;
    payment_evidence_url?: string | null;
    payment_evidence_submitted_at?: string | null;
    payment_paid_at?: string | null;
  }>;

  const orderRowIds = orders
    .filter((o) => o.ticket_status === "order")
    .map((o) => o.id);

  const customerConfirmedByTicket = new Set<string>();
  const converterByTicket = new Map<string, string>();

  if (orderRowIds.length > 0) {
    const { data: activities } = await admin
      .from("activities")
      .select("ticket_id, type, by_user_id, payload")
      .in("ticket_id", orderRowIds)
      .in("type", ["ticket_converted", "ticket_client_confirmed", "order_ticket_status_changed"])
      .order("created_at", { ascending: true });

    for (const row of activities ?? []) {
      const ticketId = row.ticket_id as string | null;
      if (!ticketId) continue;

      if (row.type === "ticket_client_confirmed") {
        customerConfirmedByTicket.add(ticketId);
        continue;
      }

      if (row.type === "order_ticket_status_changed") {
        const via = (row.payload as { via?: string } | null)?.via;
        if (via && CUSTOMER_CONFIRM_VIAS.has(via)) {
          customerConfirmedByTicket.add(ticketId);
        }
        continue;
      }

      if (
        row.type === "ticket_converted" &&
        row.by_user_id &&
        !converterByTicket.has(ticketId)
      ) {
        converterByTicket.set(ticketId, row.by_user_id);
      }
    }
  }

  const converterIds = [...new Set(converterByTicket.values())];
  const { data: profiles } = converterIds.length
    ? await admin.from("user_profiles").select("id, full_name, roles(name)").in("id", converterIds)
    : { data: [] as { id: string; full_name: string | null; roles: { name: string } | null }[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const enriched = orders.map((o) => {
    const confirmedByCustomer =
      o.ticket_status === "order" &&
      (!!o.client_confirmed || customerConfirmedByTicket.has(o.id));

    const uid =
      o.ticket_status === "order" && !confirmedByCustomer
        ? converterByTicket.get(o.id)
        : undefined;
    const converterProfile = uid ? profileById.get(uid) : undefined;
    const convertedByName = converterProfile?.full_name ?? null;
    const roleRaw = converterProfile?.roles as { name?: string } | { name?: string }[] | null;
    const converterRole = Array.isArray(roleRaw) ? roleRaw[0]?.name : roleRaw?.name;
    const convertedByAdmin =
      converterRole === "admin" &&
      o.ticket_require_client_confirm !== false &&
      !confirmedByCustomer;

    const { label, tone } = orderListStatus({
      ticket_status: o.ticket_status,
      client_confirmed: o.client_confirmed,
      confirmed_by_customer: confirmedByCustomer,
      converted_by_name: convertedByName,
      converted_by_admin: convertedByAdmin,
      require_client_confirm: o.ticket_require_client_confirm,
      payment_evidence_url: o.payment_evidence_url,
      payment_evidence_submitted_at: o.payment_evidence_submitted_at,
      payment_paid_at: o.payment_paid_at,
    });

    return { ...o, status_label: label, status_tone: tone };
  });

  return NextResponse.json({ orders: enriched });
}
