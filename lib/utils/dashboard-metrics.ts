import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveSalesRepId,
  resolveSdrId,
  type LeadAttribution,
  type TicketAttribution,
} from "@/lib/utils/reports-attribution";
import { roundMoney } from "@/lib/utils/format";
import { getAmountPaid } from "@/lib/utils/invoice-payment-summary";
import {
  excludeRefundedTickets,
  isExcludedFromRevenueKpis,
} from "@/lib/utils/exclude-refunded-tickets";

/** Sum recorded payment amounts in a date window (matches Reports cash collected). */
export async function sumCashCollectedInPeriod(
  admin: SupabaseClient,
  periodStartIso: string,
  periodEndIso: string,
  filter?: { userId: string; role: "sales" | "sdr" | null },
): Promise<{ total: number; payment_count: number }> {
  const { data: payments } = await admin
    .from("activities")
    .select("payload, ticket_id")
    .eq("type", "ticket_payment_recorded")
    .gte("created_at", periodStartIso)
    .lte("created_at", periodEndIso)
    .not("ticket_id", "is", null);

  if (!payments?.length) return { total: 0, payment_count: 0 };

  const ticketIds = [...new Set(payments.map((p) => p.ticket_id as string).filter(Boolean))];
  const { data: tickets } = await admin
    .from("job_tickets")
    .select("id, linked_lead_id, created_by_id, routed_by_id, refund_status, ticket_status")
    .in("id", ticketIds);

  const leadIds = [
    ...new Set(
      (tickets ?? [])
        .map((t) => t.linked_lead_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const { data: leads } = leadIds.length
    ? await admin.from("leads").select("id, sales_owner_id, sdr_id").in("id", leadIds)
    : { data: [] as LeadAttribution[] };

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));
  const ticketMap = new Map((tickets ?? []).map((t) => [t.id as string, t]));

  let total = 0;
  let count = 0;
  for (const row of payments) {
    const amount = Number((row.payload as { amount?: number } | null)?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const ticket = ticketMap.get(row.ticket_id as string);
    if (!ticket) continue;
    if (isExcludedFromRevenueKpis(ticket)) continue;

    if (filter?.userId) {
      const lead = ticket.linked_lead_id ? leadMap.get(ticket.linked_lead_id as string) : null;
      const ticketAttr: TicketAttribution = {
        id: ticket.id as string,
        linked_lead_id: ticket.linked_lead_id as string | null,
        created_by_id: ticket.created_by_id as string | null,
        routed_by_id: ticket.routed_by_id as string | null,
      };

      const salesId = resolveSalesRepId(ticketAttr, lead);
      const sdrId = resolveSdrId(ticketAttr, lead);

      const match =
        filter.role === "sdr"
          ? sdrId === filter.userId
          : filter.role === "sales"
            ? salesId === filter.userId
            : salesId === filter.userId || sdrId === filter.userId;

      if (!match) continue;
    }

    total += amount;
    count += 1;
  }

  return { total: roundMoney(total), payment_count: count };
}

/** Sum of active draft/sent quote totals — excludes cancelled and refunded tickets. */
export async function sumPipelineQuoteValue(admin: SupabaseClient): Promise<number> {
  let query = admin
    .from("job_tickets")
    .select("quote_final_total")
    .eq("ticket_kind", "quote")
    .in("ticket_status", ["draft", "sent"]);
  query = excludeRefundedTickets(query);
  const { data, error } = await query;
  if (error) throw error;
  const total = (data ?? []).reduce(
    (sum, row) => sum + Number(row.quote_final_total ?? 0),
    0,
  );
  return roundMoney(total);
}

/** Order value for tickets released to production in the period. */
export async function sumProductionReleasedValue(
  admin: SupabaseClient,
  periodStartIso: string,
  periodEndIso: string,
  filterUserId?: string | null,
): Promise<{ value: number; received: number; balance: number; count: number }> {
  let releasedQuery = admin
    .from("job_tickets")
    .select(
      "id, quote_final_total, payment_amount_received, deposit_amount, linked_lead_id, created_by_id, routed_by_id",
    )
    .in("ticket_status", ["in_production", "completed"])
    .not("production_released_at", "is", null)
    .gte("production_released_at", periodStartIso)
    .lte("production_released_at", periodEndIso);
  releasedQuery = excludeRefundedTickets(releasedQuery);
  const { data: tickets } = await releasedQuery;

  if (!tickets?.length) return { value: 0, received: 0, balance: 0, count: 0 };

  type Row = (typeof tickets)[number];

  function sums(rows: Row[]) {
    let value = 0;
    let received = 0;
    for (const t of rows) {
      const total = Number(t.quote_final_total ?? 0);
      const paid = getAmountPaid(t);
      value += total;
      received += paid;
    }
    const balance = Math.max(0, value - received);
    return {
      value: roundMoney(value),
      received: roundMoney(received),
      balance: roundMoney(balance),
      count: rows.length,
    };
  }

  if (!filterUserId) {
    return sums(tickets);
  }

  const leadIds = [
    ...new Set(
      tickets
        .map((t) => t.linked_lead_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const { data: leads } = leadIds.length
    ? await admin.from("leads").select("id, sales_owner_id, sdr_id").in("id", leadIds)
    : { data: [] as LeadAttribution[] };

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

  const matched: Row[] = [];
  for (const t of tickets) {
    const lead = t.linked_lead_id ? leadMap.get(t.linked_lead_id as string) : null;
    const salesId = resolveSalesRepId(
      {
        id: t.id as string,
        linked_lead_id: t.linked_lead_id as string | null,
        created_by_id: t.created_by_id as string | null,
        routed_by_id: t.routed_by_id as string | null,
      },
      lead,
    );
    if (salesId !== filterUserId) continue;
    matched.push(t);
  }

  return sums(matched);
}
