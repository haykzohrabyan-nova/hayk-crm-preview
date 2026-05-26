import type { createAdminClient } from "@/lib/supabase/admin";
import { roundMoney } from "@/lib/utils/format";
import { leadIdsRoutedToSales } from "@/lib/utils/lead-sdr-won-filter";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface SdrMetricTrend {
  value: number;
  prior: number;
  pct_change: number | null;
}

export interface SdrDashboardMetrics {
  lead_claimed: SdrMetricTrend;
  lead_created: SdrMetricTrend;
  order_value: SdrMetricTrend;
  order_created: SdrMetricTrend;
  inbox: { value: number };
  rejected: SdrMetricTrend;
  on_hold: SdrMetricTrend;
  routed_to_sales: SdrMetricTrend;
  sales_win: SdrMetricTrend;
}

export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? null : 100;
  return Math.round(((current - prior) / prior) * 100);
}

function trend(current: number, prior: number): SdrMetricTrend {
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

async function countLeadsCreated(
  admin: AdminClient,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("sdr_id", userId)
    .eq("is_inbox", false)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) throw error;
  return count ?? 0;
}

async function filterSdrRoutedLeadIds(
  admin: AdminClient,
  userId: string,
  leadIds: string[],
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();

  const routed = await leadIdsRoutedToSales(admin, leadIds);
  if (routed.size === 0) return new Set();

  const { data, error } = await admin
    .from("leads")
    .select("id")
    .in("id", [...routed])
    .eq("sdr_id", userId);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id as string));
}

async function countOrdersCreatedRouted(
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
    .select("id, linked_lead_id")
    .in("id", ticketIds);

  const leadIds = [
    ...new Set(
      (tickets ?? [])
        .map((t) => t.linked_lead_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const eligible = await filterSdrRoutedLeadIds(admin, userId, leadIds);
  if (eligible.size === 0) return 0;

  const ticketToLead = new Map(
    (tickets ?? []).map((t) => [t.id as string, t.linked_lead_id as string | null]),
  );

  let count = 0;
  const seen = new Set<string>();
  for (const row of converts) {
    const ticketId = row.ticket_id as string;
    if (seen.has(ticketId)) continue;
    const leadId = ticketToLead.get(ticketId);
    if (leadId && eligible.has(leadId)) {
      seen.add(ticketId);
      count += 1;
    }
  }
  return count;
}

async function productionReleasedRouted(
  admin: AdminClient,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<{ count: number; value: number }> {
  const { data: tickets, error } = await admin
    .from("job_tickets")
    .select("id, quote_final_total, linked_lead_id")
    .in("ticket_status", ["in_production", "completed"])
    .not("production_released_at", "is", null)
    .gte("production_released_at", startIso)
    .lte("production_released_at", endIso)
    .not("linked_lead_id", "is", null);

  if (error) throw error;
  if (!tickets?.length) return { count: 0, value: 0 };

  const leadIds = [
    ...new Set(tickets.map((t) => t.linked_lead_id as string)),
  ];
  const eligible = await filterSdrRoutedLeadIds(admin, userId, leadIds);
  if (eligible.size === 0) return { count: 0, value: 0 };

  let value = 0;
  let count = 0;
  for (const t of tickets) {
    const leadId = t.linked_lead_id as string;
    if (!eligible.has(leadId)) continue;
    value += Number(t.quote_final_total ?? 0);
    count += 1;
  }
  return { count, value: roundMoney(value) };
}

async function snapshotInbox(admin: AdminClient): Promise<number> {
  const { count, error } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_inbox", false)
    .in("status", ["Pending", "Validated"])
    .is("locked_by_id", null);

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
    routed_to_sales,
    order_created,
    production,
  ] = await Promise.all([
    distinctLeadActivityCount(admin, userId, "lead_claimed", startIso, endIso),
    countLeadsCreated(admin, userId, startIso, endIso),
    distinctLeadActivityCount(admin, userId, "lead_rejected", startIso, endIso),
    distinctLeadActivityCount(admin, userId, "lead_held", startIso, endIso),
    distinctLeadActivityCount(admin, userId, "lead_routed_to_sales", startIso, endIso),
    countOrdersCreatedRouted(admin, userId, startIso, endIso),
    productionReleasedRouted(admin, userId, startIso, endIso),
  ]);

  return {
    lead_claimed,
    lead_created,
    rejected,
    on_hold,
    routed_to_sales,
    order_created,
    order_value: production.value,
    sales_win: production.count,
  };
}

export async function buildSdrDashboardMetrics(
  admin: AdminClient,
  userId: string,
  current: { startIso: string; endIso: string },
  prior: { startIso: string; endIso: string },
): Promise<SdrDashboardMetrics> {
  const [cur, prev, inbox] = await Promise.all([
    metricsForWindow(admin, userId, current.startIso, current.endIso),
    metricsForWindow(admin, userId, prior.startIso, prior.endIso),
    snapshotInbox(admin),
  ]);

  return {
    lead_claimed: trend(cur.lead_claimed, prev.lead_claimed),
    lead_created: trend(cur.lead_created, prev.lead_created),
    order_value: trend(cur.order_value, prev.order_value),
    order_created: trend(cur.order_created, prev.order_created),
    inbox: { value: inbox },
    rejected: trend(cur.rejected, prev.rejected),
    on_hold: trend(cur.on_hold, prev.on_hold),
    routed_to_sales: trend(cur.routed_to_sales, prev.routed_to_sales),
    sales_win: trend(cur.sales_win, prev.sales_win),
  };
}
