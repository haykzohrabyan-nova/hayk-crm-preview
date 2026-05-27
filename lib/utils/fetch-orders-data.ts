import type { createAdminClient } from "@/lib/supabase/admin";
import { orderListStatus } from "@/lib/utils/order-list-status";
import {
  countExact,
  scopeJobTicketsQuery,
  scopedTicketCount,
  type TicketSelectQuery,
} from "@/lib/utils/db-counts";

type AdminClient = ReturnType<typeof createAdminClient>;

const CUSTOMER_CONFIRM_VIAS = new Set(["public_confirm", "public_payment", "public_link"]);

const ORDERS_LIST_SELECT = `
  id, ticket_kind, ticket_status, client_confirmed,
  ticket_require_client_confirm,
  payment_status,
  payment_evidence_url,
  payment_evidence_submitted_at,
  payment_paid_at,
  deposit_paid_at,
  deposit_amount,
  payment_amount_received,
  title, reference_code, quote_final_total,
  priority, due_date, rush, created_at,
  customer:customers(id, first_name, last_name, company)
`.trim();

export async function fetchOrdersList(
  admin: AdminClient,
  roleName: string,
  userId: string,
) {
  const query = scopeJobTicketsQuery(
    admin.from("job_tickets").select(ORDERS_LIST_SELECT) as TicketSelectQuery,
    roleName,
    userId,
  );

  const { data, error } = await query
    .in("ticket_status", ["order", "in_production", "cancelled"])
    .order("production_released_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const orders = (data ?? []) as Array<
    Record<string, unknown> & {
      id: string;
      ticket_status: string;
      client_confirmed?: boolean | null;
      ticket_require_client_confirm?: boolean | null;
      payment_evidence_url?: string | null;
      payment_evidence_submitted_at?: string | null;
      payment_paid_at?: string | null;
    }
  >;

  const orderRowIds = orders.filter((o) => o.ticket_status === "order").map((o) => o.id);

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

      if (row.type === "ticket_converted" && row.by_user_id && !converterByTicket.has(ticketId)) {
        converterByTicket.set(ticketId, row.by_user_id);
      }
    }
  }

  const converterIds = [...new Set(converterByTicket.values())];
  const { data: profiles } = converterIds.length
    ? await admin.from("user_profiles").select("id, full_name, roles(name)").in("id", converterIds)
    : { data: [] as { id: string; full_name: string | null; roles: { name: string } | null }[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return orders.map((o) => {
    const confirmedByCustomer =
      o.ticket_status === "order" &&
      (!!o.client_confirmed || customerConfirmedByTicket.has(o.id));

    const uid = o.ticket_status === "order" ? converterByTicket.get(o.id) : undefined;
    const converterProfile = uid ? profileById.get(uid) : undefined;
    const convertedByName = converterProfile?.full_name ?? null;
    const roleRaw = converterProfile?.roles as { name?: string } | { name?: string }[] | null;
    const converterRole = Array.isArray(roleRaw) ? roleRaw[0]?.name : roleRaw?.name;
    const convertedByAdmin = converterRole === "admin";

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
      deposit_paid_at: o.deposit_paid_at as string | null | undefined,
      payment_amount_received: o.payment_amount_received as number | null | undefined,
      deposit_amount: o.deposit_amount as number | null | undefined,
    });

    return { ...o, status_label: label, status_tone: tone };
  });
}

export async function fetchOrdersTabCounts(
  admin: AdminClient,
  roleName: string,
  userId: string,
) {
  const [pending, inProduction, cancelled] = await Promise.all([
    scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "order")),
    scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "in_production")),
    scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "cancelled")),
  ]);

  return {
    all: pending + inProduction + cancelled,
    pending,
    in_production: inProduction,
    cancelled,
  };
}

/** Dedicated orders page counts route — avoids computing unused ticket buckets. */
export async function fetchOrdersCountsOnly(
  admin: AdminClient,
  roleName: string,
  userId: string,
) {
  const counts = await fetchOrdersTabCounts(admin, roleName, userId);
  return { counts };
}

export async function fetchGlobalRoutedCount(admin: AdminClient) {
  return countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "routed"));
}
