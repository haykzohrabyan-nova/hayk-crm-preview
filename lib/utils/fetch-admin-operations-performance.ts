import type { createAdminClient } from "@/lib/supabase/admin";
import {
  getOperationsFilterBucket,
  hasOperationsSentQuote,
  matchesOperationsFilter,
  primaryOperationsTicket,
  resolveOperationsTicketRefs,
  type OperationsLead,
  type OperationsLinkedTicket,
} from "@/lib/utils/admin-deal-stage";
import { fetchOperationsLeadPool } from "@/lib/utils/fetch-admin-operations-data";
import type { OperationsListFilters } from "@/lib/utils/fetch-admin-operations-data";
import { roundMoney, formatCurrency } from "@/lib/utils/format";
import {
  computeInvoicePaymentSummary,
  getAmountPaid,
  isTicketPaidInFull,
  type TicketPaymentFields,
} from "@/lib/utils/invoice-payment-summary";
import { isExcludedFromRevenueKpis } from "@/lib/utils/exclude-refunded-tickets";

type AdminClient = ReturnType<typeof createAdminClient>;

export type OperationsPerformanceCounts = {
  leads_on_hand: number;
  unclaimed: number;
  claimed: number;
  in_progress: number;
  on_hold: number;
  rejected: number;
  quoted: number;
  sent_to_customer: number;
  ordered: number;
  completed: number;
  paid_so_far: number;
  awaiting_payment: number;
};

export type OperationsPerformanceRow = OperationsPerformanceCounts & {
  user_id: string;
  full_name: string;
  role_name: string;
  role_display_name: string;
  /** Pre-formatted for table cells — raw numbers in *_raw if needed */
  paid_so_far_label: string;
  awaiting_payment_label: string;
};

export type OperationsPerformanceData = {
  totals: OperationsPerformanceRow;
  users: OperationsPerformanceRow[];
};

/** Plain-language breakdown for Performance table hints (e.g. "2 quoted (1 sent) · 2 ordered"). */
export function formatPerformanceRowSummary(
  row: OperationsPerformanceCounts,
  options?: { includeUnclaimed?: boolean },
): string | null {
  const parts: string[] = [];

  if (options?.includeUnclaimed && row.unclaimed > 0) {
    parts.push(`${row.unclaimed} unclaimed`);
  }

  const earlyPipeline =
    row.leads_on_hand -
    (row.claimed +
      row.in_progress +
      row.on_hold +
      row.rejected +
      row.quoted +
      row.ordered +
      row.completed);

  if (earlyPipeline > 0) {
    parts.push(`${earlyPipeline} SDR / early pipeline`);
  }

  if (row.claimed > 0) {
    parts.push(`${row.claimed} claimed`);
  }
  if (row.in_progress > 0) {
    parts.push(`${row.in_progress} in progress`);
  }
  if (row.on_hold > 0) {
    parts.push(`${row.on_hold} on hold`);
  }
  if (row.rejected > 0) {
    parts.push(`${row.rejected} rejected`);
  }

  if (row.quoted > 0) {
    const notSent = row.quoted - row.sent_to_customer;
    if (row.sent_to_customer > 0 && notSent > 0) {
      parts.push(
        `${row.quoted} quoted (${row.sent_to_customer} sent, ${notSent} not sent)`,
      );
    } else if (row.sent_to_customer > 0) {
      parts.push(`${row.quoted} quoted (all sent)`);
    } else {
      parts.push(`${row.quoted} quoted (not sent yet)`);
    }
  }

  if (row.ordered > 0) {
    parts.push(`${row.ordered} ordered / in production`);
  }
  if (row.completed > 0) {
    parts.push(`${row.completed} completed`);
  }

  if (parts.length === 0) {
    if (row.leads_on_hand > 0) {
      return `${row.leads_on_hand} active — see stage columns`;
    }
    return null;
  }

  if (row.leads_on_hand > 0 && parts.length > 0) {
    return `${row.leads_on_hand} on hand — ${parts.join(" · ")}`;
  }

  return parts.join(" · ");
}

const PAYMENT_TICKET_SELECT =
  "id, quote_final_total, ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value, payment_amount_received, deposit_amount, deposit_paid_at, payment_paid_at, payment_evidence_url, payment_evidence_submitted_at, payment_evidence_reviewed_at, payment_status, ticket_status, refund_status";

function emptyCounts(): OperationsPerformanceCounts {
  return {
    leads_on_hand: 0,
    unclaimed: 0,
    claimed: 0,
    in_progress: 0,
    on_hold: 0,
    rejected: 0,
    quoted: 0,
    sent_to_customer: 0,
    ordered: 0,
    completed: 0,
    paid_so_far: 0,
    awaiting_payment: 0,
  };
}

function addCounts(
  target: OperationsPerformanceCounts,
  source: OperationsPerformanceCounts,
): void {
  for (const key of Object.keys(source) as (keyof OperationsPerformanceCounts)[]) {
    target[key] += source[key];
  }
}

function liveTickets(lead: OperationsLead): OperationsLinkedTicket[] {
  return (lead.tickets ?? []).filter(
    (t) => !t.linked_lead_id || t.linked_lead_id === lead.id,
  ).filter((t) => t.ticket_status !== "cancelled");
}

function isSentToCustomer(lead: OperationsLead, tickets: OperationsLinkedTicket[]): boolean {
  if (lead.sales_status === "Quote Sent") return true;
  if (hasOperationsSentQuote(lead, tickets)) return true;
  return tickets.some((t) => t.ticket_status === "sent");
}

function resolveOwnerId(lead: OperationsLead, bucket: ReturnType<typeof getOperationsFilterBucket>): string | null {
  if (bucket === "sdr") {
    return lead.sdr_id ?? lead.locked_by_id ?? null;
  }
  if (bucket === "sales_queue") {
    return null;
  }
  return lead.sales_owner_id ?? null;
}

function applyLeadToCounts(
  counts: OperationsPerformanceCounts,
  lead: OperationsLead,
  bucket: ReturnType<typeof getOperationsFilterBucket>,
): void {
  const tickets = liveTickets(lead);

  if (matchesOperationsFilter(lead, "all_active")) {
    counts.leads_on_hand += 1;
  }

  switch (bucket) {
    case "sales_queue":
      counts.unclaimed += 1;
      break;
    case "sales_working":
      if (lead.sales_status === "Claimed") counts.claimed += 1;
      else if (lead.sales_status === "In Progress" || lead.sales_status === "Ongoing") {
        counts.in_progress += 1;
      }
      break;
    case "quoted":
      counts.quoted += 1;
      if (isSentToCustomer(lead, tickets)) counts.sent_to_customer += 1;
      break;
    case "order": {
      counts.ordered += 1;
      const primary = primaryOperationsTicket(lead);
      if (primary?.ticket_status === "in_production") {
        // Still counted under ordered — same Operations tab bucket
      }
      break;
    }
    case "completed":
      counts.completed += 1;
      break;
    case "hold":
      counts.on_hold += 1;
      break;
    case "rejected":
      counts.rejected += 1;
      break;
    case "sdr":
      break;
    default:
      break;
  }
}

function toRow(
  userId: string,
  fullName: string,
  roleName: string,
  roleDisplay: string,
  counts: OperationsPerformanceCounts,
): OperationsPerformanceRow {
  return {
    user_id: userId,
    full_name: fullName,
    role_name: roleName,
    role_display_name: roleDisplay,
    ...counts,
    paid_so_far: roundMoney(counts.paid_so_far),
    awaiting_payment: roundMoney(counts.awaiting_payment),
    paid_so_far_label: formatCurrency(counts.paid_so_far),
    awaiting_payment_label: formatCurrency(counts.awaiting_payment),
  };
}

async function fetchOrderPaymentMap(
  admin: AdminClient,
  ticketIds: string[],
): Promise<Map<string, TicketPaymentFields & { ticket_status?: string | null; refund_status?: string | null }>> {
  const map = new Map<
    string,
    TicketPaymentFields & { ticket_status?: string | null; refund_status?: string | null }
  >();
  if (ticketIds.length === 0) return map;

  const { data, error } = await admin
    .from("job_tickets")
    .select(PAYMENT_TICKET_SELECT)
    .in("id", ticketIds);

  if (error) throw error;

  for (const row of data ?? []) {
    map.set(row.id as string, row as TicketPaymentFields & {
      ticket_status?: string | null;
      refund_status?: string | null;
    });
  }
  return map;
}

async function fetchTeamProfiles(admin: AdminClient) {
  const { data, error } = await admin
    .from("user_profiles")
    .select("id, full_name, is_active, roles(name, display_name)")
    .eq("is_active", true)
    .order("full_name");

  if (error) throw error;

  const ROLE_ORDER: Record<string, number> = { admin: 0, sdr: 1, sales: 2, accountant: 3 };

  return (data ?? [])
    .map((p) => {
      const role = p.roles as unknown as { name: string; display_name: string } | null;
      return {
        id: p.id as string,
        full_name: (p.full_name as string | null) ?? "Unknown",
        role_name: role?.name ?? "",
        role_display_name: role?.display_name ?? role?.name ?? "—",
      };
    })
    .filter((p) => ["admin", "sdr", "sales"].includes(p.role_name))
    .sort((a, b) => {
      const byRole = (ROLE_ORDER[a.role_name] ?? 99) - (ROLE_ORDER[b.role_name] ?? 99);
      if (byRole !== 0) return byRole;
      return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" });
    });
}

export async function fetchAdminOperationsPerformance(
  admin: AdminClient,
  filters: Pick<OperationsListFilters, "dateRange" | "userId">,
): Promise<OperationsPerformanceData> {
  const { leads } = await fetchOperationsLeadPool(admin, filters);
  return buildAdminOperationsPerformance(admin, leads, filters);
}

export async function buildAdminOperationsPerformance(
  admin: AdminClient,
  leads: OperationsLead[],
  filters: Pick<OperationsListFilters, "userId">,
): Promise<OperationsPerformanceData> {

  const orderTicketIds = [
    ...new Set(
      leads.flatMap((lead) => {
        const { order } = resolveOperationsTicketRefs(lead);
        return order?.id ? [order.id] : [];
      }),
    ),
  ];
  const paymentMap = await fetchOrderPaymentMap(admin, orderTicketIds);

  const perUser = new Map<string, OperationsPerformanceCounts>();
  const totals = emptyCounts();

  for (const lead of leads) {
    const bucket = getOperationsFilterBucket(lead);
    const ownerId = resolveOwnerId(lead, bucket);

    applyLeadToCounts(totals, lead, bucket);

    const { order } = resolveOperationsTicketRefs(lead);
    if (order?.id) {
      const payment = paymentMap.get(order.id);
      if (payment && !isExcludedFromRevenueKpis(payment)) {
        const paid = getAmountPaid(payment);
        totals.paid_so_far += paid;
        if (!isTicketPaidInFull(payment)) {
          totals.awaiting_payment += computeInvoicePaymentSummary(payment).balanceDue;
        }
        if (ownerId) {
          const userCounts = perUser.get(ownerId) ?? emptyCounts();
          userCounts.paid_so_far += paid;
          if (!isTicketPaidInFull(payment)) {
            userCounts.awaiting_payment += computeInvoicePaymentSummary(payment).balanceDue;
          }
          perUser.set(ownerId, userCounts);
        }
      }
    }

    if (ownerId) {
      const userCounts = perUser.get(ownerId) ?? emptyCounts();
      applyLeadToCounts(userCounts, lead, bucket);
      perUser.set(ownerId, userCounts);
    }
  }

  totals.paid_so_far = roundMoney(totals.paid_so_far);
  totals.awaiting_payment = roundMoney(totals.awaiting_payment);

  const profiles = await fetchTeamProfiles(admin);
  const profileIds = new Set(profiles.map((p) => p.id));

  for (const [userId, counts] of perUser) {
    if (!profileIds.has(userId)) {
      profiles.push({
        id: userId,
        full_name: "Unknown user",
        role_name: "sales",
        role_display_name: "Sales",
      });
    }
    counts.paid_so_far = roundMoney(counts.paid_so_far);
    counts.awaiting_payment = roundMoney(counts.awaiting_payment);
  }

  const users = profiles
    .filter((p) => {
      if (filters.userId) return p.id === filters.userId;
      const counts = perUser.get(p.id);
      if (!counts) return false;
      return Object.values(counts).some((v) => v > 0);
    })
    .map((p) =>
      toRow(
        p.id,
        p.full_name,
        p.role_name,
        p.role_display_name,
        perUser.get(p.id) ?? emptyCounts(),
      ),
    );

  return {
    totals: toRow("__total__", "Total", "all", "All team", totals),
    users,
  };
}
