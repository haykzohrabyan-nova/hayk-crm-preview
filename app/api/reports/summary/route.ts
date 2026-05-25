import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  paymentMethodLabel,
  resolveSalesRepId,
  resolveSdrId,
} from "@/lib/utils/reports-attribution";
import { reportsTimelineBucket } from "@/lib/utils/reports-period-bucket";
import { buildAwaitingCollection } from "@/lib/utils/reports-awaiting-collection";
import { parseEmbeddedRole } from "@/lib/utils/parse-embedded-role";
import { resolveReportDateRange } from "@/lib/utils/reports-date-range";
import { roundMoney } from "@/lib/utils/format";
import { sumProductionReleasedValue } from "@/lib/utils/dashboard-metrics";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function roundPct(n: number): number | null {
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

interface PaymentPayload {
  amount?: number;
  method?: string;
  mode?: string;
}

interface RepAgg {
  id: string;
  full_name: string;
  cash_collected: number;
  payment_count: number;
  orders_paid: Set<string>;
  booked_value: number;
}

interface LedgerAgg {
  ticket_id: string;
  reference_code: string | null;
  title: string | null;
  customer_label: string;
  sales_rep_id: string | null;
  sales_rep_name: string;
  sdr_id: string | null;
  sdr_name: string;
  quote_total: number;
  paid_in_period: number;
  total_paid: number;
  ticket_status: string;
  payments: {
    date: string;
    amount: number;
    method: string;
    method_label: string;
    mode: string;
  }[];
}

function customerLabel(customer: unknown): string {
  if (!customer || typeof customer !== "object") return "—";
  const c = customer as { company?: string | null; first_name?: string | null; last_name?: string | null };
  if (c.company?.trim()) return c.company.trim();
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || "—";
}

function passesUserFilter(
  filterUserId: string | null,
  filterRole: string | null,
  salesRepId: string | null,
  sdrId: string | null,
): boolean {
  if (!filterUserId) return true;
  if (filterRole === "sdr") return sdrId === filterUserId;
  if (filterRole === "sales") return salesRepId === filterUserId;
  return salesRepId === filterUserId || sdrId === filterUserId;
}

// GET /api/reports/summary?period=week|month|quarter&date_from=&date_to=&user_id= — admin only
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const period = request.nextUrl.searchParams.get("period") ?? "month";
  const dateFrom = request.nextUrl.searchParams.get("date_from");
  const dateTo = request.nextUrl.searchParams.get("date_to");
  const rangeResult = resolveReportDateRange(period, dateFrom, dateTo);
  if ("error" in rangeResult) {
    return NextResponse.json({ error: rangeResult.error }, { status: 400 });
  }
  const range = rangeResult;

  const filterUserId = request.nextUrl.searchParams.get("user_id")?.trim() || null;
  const periodStart = range.startIso;
  const periodEnd = range.endIso;
  const admin = createAdminClient();

  let filterRole: string | null = null;
  let filterUser: { id: string; full_name: string; role_name: string } | null = null;

  if (filterUserId) {
    const { data: filterProfile } = await admin
      .from("user_profiles")
      .select("id, full_name, roles(name)")
      .eq("id", filterUserId)
      .single();
    if (filterProfile) {
      const role = parseEmbeddedRole(filterProfile.roles);
      filterRole = role?.name ?? null;
      filterUser = {
        id: filterProfile.id,
        full_name: filterProfile.full_name ?? "Unknown",
        role_name: filterRole ?? "",
      };
    }
  }

  const [
    paymentActs,
    routedActs,
    cohortTickets,
    releasedTickets,
    activeProfilesResult,
    sdrRoutedActs,
    openTicketsResult,
    releasedOrderValue,
  ] = await Promise.all([
    admin
      .from("activities")
      .select("payload, created_at, ticket_id")
      .eq("type", "ticket_payment_recorded")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .not("ticket_id", "is", null),

    admin
      .from("activities")
      .select("lead_id")
      .eq("type", "lead_routed_to_sales")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .not("lead_id", "is", null),

    admin
      .from("job_tickets")
      .select(
        "ticket_status, client_confirmed, payment_amount_received, payment_evidence_url, payment_status, production_released_at",
      )
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .neq("ticket_status", "draft"),

    admin
      .from("job_tickets")
      .select("created_at, production_released_at")
      .not("production_released_at", "is", null)
      .gte("production_released_at", periodStart)
      .lte("production_released_at", periodEnd),

    admin
      .from("user_profiles")
      .select("id, full_name, roles(name)")
      .eq("is_active", true),

    admin
      .from("activities")
      .select("by_user_id, lead_id")
      .eq("type", "lead_routed_to_sales")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .not("by_user_id", "is", null),

    admin
      .from("job_tickets")
      .select(
        `id, reference_code, title, quote_final_total, payment_amount_received, deposit_amount,
         deposit_paid_at, payment_paid_at, payment_status, ticket_status,
         ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value,
         payment_evidence_url, payment_evidence_submitted_at, payment_evidence_amount,
         linked_lead_id, created_by_id, routed_by_id,
         customer:customers(first_name, last_name, company)`,
      )
      .in("ticket_status", ["sent", "order", "in_production", "completed"])
      .gt("quote_final_total", 0),

    sumProductionReleasedValue(
      admin,
      periodStart,
      periodEnd,
      filterRole === "sales" ? filterUserId : null,
    ),
  ]);

  const activeProfiles = activeProfilesResult.data ?? [];
  const payments = paymentActs.data ?? [];
  const ticketIds = [...new Set(payments.map((p) => p.ticket_id as string).filter(Boolean))];

  const { data: ticketRows } = ticketIds.length
    ? await admin
        .from("job_tickets")
        .select(
          `id, reference_code, title, quote_final_total, payment_amount_received, ticket_status,
           linked_lead_id, created_by_id, routed_by_id,
           customer:customers(first_name, last_name, company)`,
        )
        .in("id", ticketIds)
    : { data: [] as Record<string, unknown>[] };

  const leadIds = [
    ...new Set(
      (ticketRows ?? [])
        .map((t) => t.linked_lead_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const { data: paymentLeadRows } = leadIds.length
    ? await admin.from("leads").select("id, sales_owner_id, sdr_id").in("id", leadIds)
    : { data: [] as { id: string; sales_owner_id: string | null; sdr_id: string | null }[] };

  const openTickets = openTicketsResult.data ?? [];
  const paymentLeadIdSet = new Set(leadIds);
  const openLeadIds = [
    ...new Set(
      openTickets
        .map((t) => t.linked_lead_id as string | null)
        .filter((id): id is string => !!id && !paymentLeadIdSet.has(id)),
    ),
  ];

  let allLeadRows = paymentLeadRows ?? [];
  if (openLeadIds.length > 0) {
    const { data: extraLeads } = await admin
      .from("leads")
      .select("id, sales_owner_id, sdr_id")
      .in("id", openLeadIds);
    allLeadRows = [...allLeadRows, ...(extraLeads ?? [])];
  }

  const leadMap = new Map(allLeadRows.map((l) => [l.id, l]));
  const ticketMap = new Map((ticketRows ?? []).map((t) => [t.id as string, t]));

  const nameMap: Record<string, string> = {};
  const salesRepIds = new Set<string>();
  const sdrIds = new Set<string>();

  for (const p of activeProfiles ?? []) {
    const role = parseEmbeddedRole(p.roles);
    const roleName = role?.name ?? "";
    nameMap[p.id] = p.full_name ?? "Unknown";
    if (roleName === "sales") salesRepIds.add(p.id);
    if (roleName === "sdr") sdrIds.add(p.id);
  }

  for (const t of ticketRows ?? []) {
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
    const sdrId = resolveSdrId(
      {
        id: t.id as string,
        linked_lead_id: t.linked_lead_id as string | null,
        created_by_id: t.created_by_id as string | null,
        routed_by_id: t.routed_by_id as string | null,
      },
      lead,
    );
    if (salesId) salesRepIds.add(salesId);
    if (sdrId) sdrIds.add(sdrId);
  }

  const salesAgg = new Map<string, RepAgg>();
  const sdrAgg = new Map<string, RepAgg>();
  const ledgerMap = new Map<string, LedgerAgg>();

  for (const id of salesRepIds) {
    salesAgg.set(id, {
      id,
      full_name: nameMap[id] ?? "Unknown",
      cash_collected: 0,
      payment_count: 0,
      orders_paid: new Set(),
      booked_value: 0,
    });
  }
  for (const id of sdrIds) {
    sdrAgg.set(id, {
      id,
      full_name: nameMap[id] ?? "Unknown",
      cash_collected: 0,
      payment_count: 0,
      orders_paid: new Set(),
      booked_value: 0,
    });
  }

  let cashTotal = 0;
  let paymentEventsCount = 0;
  const methodMap: Record<string, { amount: number; count: number }> = {};
  const timelineMap: Record<string, number> = {};

  for (const row of payments) {
    const payload = row.payload as PaymentPayload | null;
    const amount = Number(payload?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const ticketId = row.ticket_id as string;
    const ticket = ticketMap.get(ticketId);
    if (!ticket) continue;

    const lead = ticket.linked_lead_id
      ? leadMap.get(ticket.linked_lead_id as string)
      : null;
    const ticketAttr = {
      id: ticketId,
      linked_lead_id: ticket.linked_lead_id as string | null,
      created_by_id: ticket.created_by_id as string | null,
      routed_by_id: ticket.routed_by_id as string | null,
    };

    const salesRepId = resolveSalesRepId(ticketAttr, lead);
    const sdrId = resolveSdrId(ticketAttr, lead);

    if (!passesUserFilter(filterUserId, filterRole, salesRepId, sdrId)) continue;

    cashTotal += amount;
    paymentEventsCount += 1;
    const method = payload?.method ?? "other";
    if (!methodMap[method]) methodMap[method] = { amount: 0, count: 0 };
    methodMap[method].amount += amount;
    methodMap[method].count += 1;

    const timelineKey = reportsTimelineBucket(row.created_at as string, range.timelineMode);
    timelineMap[timelineKey] = (timelineMap[timelineKey] ?? 0) + amount;

    if (salesRepId) {
      if (!salesAgg.has(salesRepId)) {
        salesAgg.set(salesRepId, {
          id: salesRepId,
          full_name: nameMap[salesRepId] ?? "Unknown",
          cash_collected: 0,
          payment_count: 0,
          orders_paid: new Set(),
          booked_value: 0,
        });
      }
      const agg = salesAgg.get(salesRepId)!;
      agg.cash_collected += amount;
      agg.payment_count += 1;
      agg.orders_paid.add(ticketId);
    }

    if (sdrId) {
      if (!sdrAgg.has(sdrId)) {
        sdrAgg.set(sdrId, {
          id: sdrId,
          full_name: nameMap[sdrId] ?? "Unknown",
          cash_collected: 0,
          payment_count: 0,
          orders_paid: new Set(),
          booked_value: 0,
        });
      }
      const agg = sdrAgg.get(sdrId)!;
      agg.cash_collected += amount;
      agg.payment_count += 1;
      agg.orders_paid.add(ticketId);
    }

    const quoteTotal = Number(ticket.quote_final_total ?? 0);
    const totalPaid = Number(ticket.payment_amount_received ?? 0);

    if (!ledgerMap.has(ticketId)) {
      ledgerMap.set(ticketId, {
        ticket_id: ticketId,
        reference_code: ticket.reference_code as string | null,
        title: ticket.title as string | null,
        customer_label: customerLabel(ticket.customer),
        sales_rep_id: salesRepId,
        sales_rep_name: salesRepId ? (nameMap[salesRepId] ?? "Unknown") : "—",
        sdr_id: sdrId,
        sdr_name: sdrId ? (nameMap[sdrId] ?? "Unknown") : "—",
        quote_total: quoteTotal,
        paid_in_period: 0,
        total_paid: totalPaid,
        ticket_status: ticket.ticket_status as string,
        payments: [],
      });
    }

    const ledger = ledgerMap.get(ticketId)!;
    ledger.paid_in_period += amount;
    ledger.total_paid = totalPaid;
    ledger.payments.push({
      date: row.created_at as string,
      amount: roundMoney(amount),
      method,
      method_label: paymentMethodLabel(method),
      mode: payload?.mode ?? "full",
    });
  }

  for (const [ticketId, ledger] of ledgerMap) {
    const ticket = ticketMap.get(ticketId);
    if (!ticket) continue;
    const quoteTotal = Number(ticket.quote_final_total ?? 0);
    if (ledger.sales_rep_id && salesAgg.has(ledger.sales_rep_id)) {
      salesAgg.get(ledger.sales_rep_id)!.booked_value += quoteTotal;
    }
    if (ledger.sdr_id && sdrAgg.has(ledger.sdr_id)) {
      sdrAgg.get(ledger.sdr_id)!.booked_value += quoteTotal;
    }
  }

  const sdrRoutedMap: Record<string, number> = {};
  for (const act of sdrRoutedActs.data ?? []) {
    const uid = act.by_user_id as string;
    sdrRoutedMap[uid] = (sdrRoutedMap[uid] ?? 0) + 1;
  }

  const toScorecard = (agg: RepAgg, routedCount?: number) => {
    const orders = agg.orders_paid.size;
    const booked = roundMoney(agg.booked_value);
    const collected = roundMoney(agg.cash_collected);
    return {
      id: agg.id,
      full_name: agg.full_name,
      cash_collected: collected,
      payment_count: agg.payment_count,
      orders_paid: orders,
      booked_value: booked,
      collection_pct:
        booked > 0 ? roundPct(Math.min(100, (collected / booked) * 100)) : collected > 0 ? 100 : null,
      ...(routedCount !== undefined ? { leads_routed: routedCount } : {}),
    };
  };

  const sales_scorecard = [...salesAgg.values()]
    .map((a) => toScorecard(a))
    .sort((a, b) => b.cash_collected - a.cash_collected);

  const sdr_scorecard = [...sdrAgg.values()]
    .map((a) => toScorecard(a, sdrRoutedMap[a.id] ?? 0))
    .sort((a, b) => b.cash_collected - a.cash_collected);

  const payment_ledger = [...ledgerMap.values()]
    .map((l) => ({
      ...l,
      paid_in_period: roundMoney(l.paid_in_period),
      quote_total: roundMoney(l.quote_total),
      total_paid: roundMoney(l.total_paid),
      payments: l.payments.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    }))
    .sort((a, b) => b.paid_in_period - a.paid_in_period)
    .slice(0, 100);

  const cash_by_method = Object.entries(methodMap)
    .map(([method, v]) => ({
      method,
      label: paymentMethodLabel(method),
      amount: roundMoney(v.amount),
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const cash_timeline = Object.entries(timelineMap)
    .map(([label, amount]) => ({ label, amount: roundMoney(amount) }))
    .slice(-12);

  const routedLeadIds = [...new Set((routedActs.data ?? []).map((a) => a.lead_id as string))];
  let leadsWon = 0;
  if (routedLeadIds.length > 0) {
    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("id", routedLeadIds)
      .eq("sales_status", "Won");
    leadsWon = count ?? 0;
  }

  const cohort = cohortTickets.data ?? [];
  const sentStatuses = new Set(["sent", "order", "in_production", "completed"]);
  const quotesSent = cohort.filter((t) => sentStatuses.has(t.ticket_status as string)).length;
  const quotesWon = cohort.filter(
    (t) =>
      t.production_released_at ||
      t.ticket_status === "in_production" ||
      t.ticket_status === "completed",
  ).length;

  let closeDaysSum = 0;
  let closeDaysCount = 0;
  for (const t of releasedTickets.data ?? []) {
    const start = new Date(t.created_at as string).getTime();
    const end = new Date(t.production_released_at as string).getTime();
    const days = (end - start) / 86_400_000;
    if (days >= 0) {
      closeDaysSum += days;
      closeDaysCount += 1;
    }
  }

  const funnel = {
    quotes_created: cohort.length,
    quotes_sent: quotesSent,
    client_confirmed: cohort.filter((t) => t.client_confirmed).length,
    payment_received: cohort.filter((t) => Number(t.payment_amount_received ?? 0) > 0.01).length,
    in_production: cohort.filter(
      (t) =>
        !!t.production_released_at ||
        t.ticket_status === "in_production" ||
        t.ticket_status === "completed",
    ).length,
    completed: cohort.filter((t) => t.ticket_status === "completed").length,
  };

  const team_members = (activeProfiles ?? [])
    .map((p) => {
      const role = parseEmbeddedRole(p.roles);
      if (!role || role.name === "admin" || role.name === "accountant") return null;
      return {
        id: p.id,
        full_name: p.full_name ?? "Unknown",
        role_name: role.name,
        role_display_name: role.display_name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.full_name.localeCompare(b!.full_name)) as {
    id: string;
    full_name: string;
    role_name: string;
    role_display_name: string;
  }[];

  const awaiting_collection = buildAwaitingCollection(
    openTickets,
    leadMap,
    nameMap,
    filterUserId,
    filterRole,
  );

  return NextResponse.json({
    period: range.period,
    period_label: range.label,
    date_mode: range.mode,
    period_start: periodStart,
    period_end: periodEnd,
    filter_user: filterUser,
    team_members,
    cash_collected: {
      total: roundMoney(cashTotal),
      payment_events: paymentEventsCount,
      by_method: cash_by_method,
      timeline: cash_timeline,
    },
    released_order_value: {
      total: releasedOrderValue.value,
      order_count: releasedOrderValue.count,
    },
    sales_scorecard,
    sdr_scorecard,
    payment_ledger,
    awaiting_collection,
    win_rate: {
      leads_routed: routedLeadIds.length,
      leads_won: leadsWon,
      lead_win_rate_pct:
        routedLeadIds.length > 0 ? Math.round((leadsWon / routedLeadIds.length) * 100) : null,
      quotes_sent: quotesSent,
      quotes_won: quotesWon,
      quote_win_rate_pct: quotesSent > 0 ? Math.round((quotesWon / quotesSent) * 100) : null,
      avg_days_to_production: closeDaysCount > 0 ? round1(closeDaysSum / closeDaysCount) : null,
      production_releases: closeDaysCount,
    },
    funnel,
  });
}
