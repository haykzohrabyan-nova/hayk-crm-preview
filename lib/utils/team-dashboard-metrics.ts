import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveSalesRepId,
  resolveSdrId,
  type LeadAttribution,
  type TicketAttribution,
} from "@/lib/utils/reports-attribution";
import {
  computeInvoicePaymentSummary,
  isTicketPaidInFull,
  type TicketPaymentFields,
} from "@/lib/utils/invoice-payment-summary";
import {
  excludeRefundedTickets,
  isExcludedFromRevenueKpis,
} from "@/lib/utils/exclude-refunded-tickets";
import { roundMoney } from "@/lib/utils/format";

const SDR_ACTION_TYPES = [
  "lead_claimed",
  "lead_routed_to_sales",
  "lead_rejected",
  "lead_held",
] as const;

export interface TeamMemberMetrics {
  handled: number;
  routed: number;
  rejected: number;
  sourced_cash: number;
  cash_collected: number;
  released_order_value: number;
  awaiting_collection: number;
  pipeline_value: number;
}

interface TeamMemberAgg extends TeamMemberMetrics {
  handledLeads: Set<string>;
  routedLeads: Set<string>;
  rejectedLeads: Set<string>;
}

function emptyAgg(): TeamMemberAgg {
  return {
    handled: 0,
    routed: 0,
    rejected: 0,
    sourced_cash: 0,
    cash_collected: 0,
    released_order_value: 0,
    awaiting_collection: 0,
    pipeline_value: 0,
    handledLeads: new Set(),
    routedLeads: new Set(),
    rejectedLeads: new Set(),
  };
}

function ensure(map: Record<string, TeamMemberAgg>, userId: string): TeamMemberAgg {
  if (!map[userId]) map[userId] = emptyAgg();
  return map[userId];
}

/** Per-user dashboard stats for admin Team cards (period + live snapshots). */
export async function buildTeamMemberMetrics(
  admin: SupabaseClient,
  periodStartIso: string,
  periodEndIso: string,
): Promise<Record<string, TeamMemberMetrics>> {
  const metrics: Record<string, TeamMemberAgg> = {};

  const [sdrActs, payments, releasedTickets, pipelineTickets, openTickets] =
    await Promise.all([
      admin
        .from("activities")
        .select("by_user_id, lead_id, type")
        .in("type", [...SDR_ACTION_TYPES])
        .gte("created_at", periodStartIso)
        .lte("created_at", periodEndIso)
        .not("by_user_id", "is", null)
        .not("lead_id", "is", null),

      admin
        .from("activities")
        .select("payload, ticket_id")
        .eq("type", "ticket_payment_recorded")
        .gte("created_at", periodStartIso)
        .lte("created_at", periodEndIso)
        .not("ticket_id", "is", null),

      excludeRefundedTickets(
        admin
          .from("job_tickets")
          .select("id, quote_final_total, linked_lead_id, created_by_id, routed_by_id")
          .in("ticket_status", ["in_production", "completed"])
          .not("production_released_at", "is", null)
          .gte("production_released_at", periodStartIso)
          .lte("production_released_at", periodEndIso),
      ),

      excludeRefundedTickets(
        admin
          .from("job_tickets")
          .select("id, quote_final_total, linked_lead_id, created_by_id, routed_by_id")
          .eq("ticket_kind", "quote")
          .in("ticket_status", ["draft", "sent"]),
      ),

      excludeRefundedTickets(
        admin
          .from("job_tickets")
          .select(
            `id, quote_final_total, payment_amount_received, deposit_amount, deposit_paid_at,
           payment_paid_at, payment_status, ticket_status, ticket_payment_strategy,
           ticket_deposit_type, ticket_deposit_value, payment_evidence_url,
           payment_evidence_submitted_at, linked_lead_id, created_by_id, routed_by_id, refund_status`,
          )
          .in("ticket_status", ["sent", "order", "in_production", "completed"])
          .gt("quote_final_total", 0),
      ),
    ]);

  for (const act of sdrActs.data ?? []) {
    const uid = act.by_user_id as string;
    const leadId = act.lead_id as string;
    const m = ensure(metrics, uid);
    m.handledLeads.add(leadId);
    if (act.type === "lead_routed_to_sales") m.routedLeads.add(leadId);
    if (act.type === "lead_rejected") m.rejectedLeads.add(leadId);
  }

  const ticketIdSet = new Set<string>();
  for (const p of payments.data ?? []) ticketIdSet.add(p.ticket_id as string);
  for (const t of releasedTickets.data ?? []) ticketIdSet.add(t.id as string);
  for (const t of pipelineTickets.data ?? []) ticketIdSet.add(t.id as string);
  for (const t of openTickets.data ?? []) ticketIdSet.add(t.id as string);

  const ticketIds = [...ticketIdSet];
  const { data: ticketRows } = ticketIds.length
    ? await admin
        .from("job_tickets")
        .select("id, linked_lead_id, created_by_id, routed_by_id, quote_final_total, refund_status, ticket_status")
        .in("id", ticketIds)
    : { data: [] as Record<string, unknown>[] };

  const allTicketRows = [
    ...(ticketRows ?? []),
    ...(releasedTickets.data ?? []),
    ...(pipelineTickets.data ?? []),
    ...(openTickets.data ?? []),
  ];
  const mergedTicketMap = new Map<string, Record<string, unknown>>();
  for (const t of allTicketRows) mergedTicketMap.set(t.id as string, t as Record<string, unknown>);

  const leadIds = [
    ...new Set(
      [...mergedTicketMap.values()]
        .map((t) => t.linked_lead_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const { data: leads } = leadIds.length
    ? await admin.from("leads").select("id, sales_owner_id, sdr_id").in("id", leadIds)
    : { data: [] as LeadAttribution[] };

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

  function ticketAttr(t: Record<string, unknown>): TicketAttribution {
    return {
      id: t.id as string,
      linked_lead_id: t.linked_lead_id as string | null,
      created_by_id: t.created_by_id as string | null,
      routed_by_id: t.routed_by_id as string | null,
    };
  }

  function repIds(t: Record<string, unknown>) {
    const lead = t.linked_lead_id ? leadMap.get(t.linked_lead_id as string) : null;
    const attr = ticketAttr(t);
    return {
      salesId: resolveSalesRepId(attr, lead),
      sdrId: resolveSdrId(attr, lead),
    };
  }

  for (const row of payments.data ?? []) {
    const amount = Number((row.payload as { amount?: number } | null)?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const ticket = mergedTicketMap.get(row.ticket_id as string);
    if (!ticket) continue;
    if (isExcludedFromRevenueKpis(ticket)) continue;
    const { salesId, sdrId } = repIds(ticket);
    if (salesId) ensure(metrics, salesId).cash_collected += amount;
    if (sdrId) ensure(metrics, sdrId).sourced_cash += amount;
  }

  for (const t of releasedTickets.data ?? []) {
    const row = t as Record<string, unknown>;
    if (isExcludedFromRevenueKpis(row)) continue;
    const value = Number(row.quote_final_total ?? 0);
    const { salesId } = repIds(row);
    if (salesId) ensure(metrics, salesId).released_order_value += value;
  }

  for (const t of pipelineTickets.data ?? []) {
    const row = t as Record<string, unknown>;
    if (isExcludedFromRevenueKpis(row)) continue;
    const value = Number(row.quote_final_total ?? 0);
    const { salesId } = repIds(row);
    if (salesId) ensure(metrics, salesId).pipeline_value += value;
  }

  for (const row of openTickets.data ?? []) {
    const fields = row as unknown as TicketPaymentFields & Record<string, unknown>;
    if (
      isExcludedFromRevenueKpis({
        ticket_status: fields.ticket_status as string | null | undefined,
        refund_status: fields.refund_status as string | null | undefined,
      })
    ) {
      continue;
    }
    if (isTicketPaidInFull(fields)) continue;
    const summary = computeInvoicePaymentSummary(fields);
    if (summary.balanceDue <= 0.01) continue;
    const { salesId } = repIds(row as Record<string, unknown>);
    if (salesId) ensure(metrics, salesId).awaiting_collection += summary.balanceDue;
  }

  const result: Record<string, TeamMemberMetrics> = {};
  for (const [userId, m] of Object.entries(metrics)) {
    result[userId] = {
      handled: m.handledLeads.size,
      routed: m.routedLeads.size,
      rejected: m.rejectedLeads.size,
      sourced_cash: roundMoney(m.sourced_cash),
      cash_collected: roundMoney(m.cash_collected),
      released_order_value: roundMoney(m.released_order_value),
      awaiting_collection: roundMoney(m.awaiting_collection),
      pipeline_value: roundMoney(m.pipeline_value),
    };
  }

  return result;
}
