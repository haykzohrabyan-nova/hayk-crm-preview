import type { createAdminClient } from "@/lib/supabase/admin";
import { sumProductionReleasedValue } from "@/lib/utils/dashboard-metrics";
import {
  pctChange,
  type SdrMetricTrend as DashboardMetricTrend,
} from "@/lib/utils/sdr-dashboard-metrics";
import {
  resolveSalesRepId,
  type LeadAttribution,
  type TicketAttribution,
} from "@/lib/utils/reports-attribution";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface SalesDashboardMetrics {
  lead_claimed: DashboardMetricTrend;
  lead_created: DashboardMetricTrend;
  order_value: DashboardMetricTrend;
  order_value_breakdown: { total: number; received: number; balance: number };
  order_created: DashboardMetricTrend;
  inbox: { value: number };
  rejected: DashboardMetricTrend;
  on_hold: DashboardMetricTrend;
}

function trend(current: number, prior: number): DashboardMetricTrend {
  return { value: current, prior, pct_change: pctChange(current, prior) };
}

async function distinctLeadActivityCount(
  admin: AdminClient,
  userId: string,
  type: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { data, error } = await admin
    .from("activities")
    .select("lead_id")
    .eq("by_user_id", userId)
    .eq("type", type)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .not("lead_id", "is", null);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.lead_id as string)).size;
}

/** Quotes created by this sales rep in the period. */
async function countQuotesCreated(
  admin: AdminClient,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { data: acts, error } = await admin
    .from("activities")
    .select("ticket_id")
    .eq("by_user_id", userId)
    .eq("type", "order_ticket_created")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .not("ticket_id", "is", null);

  if (error) throw error;
  if (!acts?.length) return 0;

  const ticketIds = [...new Set(acts.map((a) => a.ticket_id as string))];
  const { data: tickets } = await admin
    .from("job_tickets")
    .select("id, ticket_kind")
    .in("id", ticketIds);

  const quoteIds = new Set(
    (tickets ?? [])
      .filter((t) => t.ticket_kind === "quote")
      .map((t) => t.id as string),
  );

  return [...new Set(acts.map((a) => a.ticket_id as string).filter((id) => quoteIds.has(id)))].length;
}

async function countOrdersCreated(
  admin: AdminClient,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { data: converts, error } = await admin
    .from("activities")
    .select("ticket_id")
    .eq("type", "ticket_converted")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .not("ticket_id", "is", null);

  if (error) throw error;
  if (!converts?.length) return 0;

  const ticketIds = [...new Set(converts.map((c) => c.ticket_id as string))];
  const { data: tickets } = await admin
    .from("job_tickets")
    .select("id, linked_lead_id, created_by_id, routed_by_id")
    .in("id", ticketIds);

  const leadIds = [
    ...new Set(
      (tickets ?? [])
        .map((t) => t.linked_lead_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data: leads } = leadIds.length
    ? await admin.from("leads").select("id, sales_owner_id, sdr_id").in("id", leadIds)
    : { data: [] as LeadAttribution[] };

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

  let count = 0;
  const seen = new Set<string>();
  for (const row of converts) {
    const ticketId = row.ticket_id as string;
    if (seen.has(ticketId)) continue;
    const ticket = (tickets ?? []).find((t) => t.id === ticketId);
    if (!ticket) continue;
    const lead = ticket.linked_lead_id
      ? leadMap.get(ticket.linked_lead_id as string)
      : null;
    const salesId = resolveSalesRepId(
      {
        id: ticket.id as string,
        linked_lead_id: ticket.linked_lead_id as string | null,
        created_by_id: ticket.created_by_id as string | null,
        routed_by_id: ticket.routed_by_id as string | null,
      } satisfies TicketAttribution,
      lead,
    );
    if (salesId === userId) {
      seen.add(ticketId);
      count += 1;
    }
  }
  return count;
}

async function snapshotSalesInbox(admin: AdminClient): Promise<number> {
  const { count, error } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_inbox", false)
    .eq("status", "Routed to Sales")
    .is("sales_owner_id", null);

  if (error) throw error;
  return count ?? 0;
}

async function metricsForWindow(
  admin: AdminClient,
  userId: string,
  startIso: string,
  endIso: string,
) {
  const [
    lead_claimed,
    lead_created,
    rejected,
    on_hold,
    order_created,
    released,
  ] = await Promise.all([
    distinctLeadActivityCount(admin, userId, "lead_sales_claimed", startIso, endIso),
    countQuotesCreated(admin, userId, startIso, endIso),
    distinctLeadActivityCount(admin, userId, "lead_rejected", startIso, endIso),
    distinctLeadActivityCount(admin, userId, "lead_held", startIso, endIso),
    countOrdersCreated(admin, userId, startIso, endIso),
    sumProductionReleasedValue(admin, startIso, endIso, userId),
  ]);

  return {
    lead_claimed,
    lead_created,
    rejected,
    on_hold,
    order_created,
    order_value: released.value,
    order_received: released.received,
    order_balance: released.balance,
  };
}

export async function buildSalesDashboardMetrics(
  admin: AdminClient,
  userId: string,
  current: { startIso: string; endIso: string },
  prior: { startIso: string; endIso: string },
): Promise<SalesDashboardMetrics> {
  const [cur, prev, inbox] = await Promise.all([
    metricsForWindow(admin, userId, current.startIso, current.endIso),
    metricsForWindow(admin, userId, prior.startIso, prior.endIso),
    snapshotSalesInbox(admin),
  ]);

  return {
    lead_claimed: trend(cur.lead_claimed, prev.lead_claimed),
    lead_created: trend(cur.lead_created, prev.lead_created),
    order_value: trend(cur.order_value, prev.order_value),
    order_value_breakdown: {
      total: cur.order_value,
      received: cur.order_received,
      balance: cur.order_balance,
    },
    order_created: trend(cur.order_created, prev.order_created),
    inbox: { value: inbox },
    rejected: trend(cur.rejected, prev.rejected),
    on_hold: trend(cur.on_hold, prev.on_hold),
  };
}
