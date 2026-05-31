import {
  computeInvoicePaymentSummary,
  isTicketPaidInFull,
  type TicketPaymentFields,
} from "@/lib/utils/invoice-payment-summary";
import {
  resolveSalesRepId,
  resolveSdrId,
  type LeadAttribution,
  type TicketAttribution,
} from "@/lib/utils/reports-attribution";
import { isFullyRefundedTicket } from "@/lib/utils/exclude-refunded-tickets";

const STATUS_LABELS: Record<string, string> = {
  sent: "Quote sent",
  order: "Order",
  in_production: "In production",
  completed: "Completed",
};

export interface OutstandingOrderRow {
  ticket_id: string;
  reference_code: string | null;
  title: string | null;
  customer_label: string;
  sales_rep_name: string;
  sdr_name: string;
  quote_total: number;
  total_paid: number;
  balance_due: number;
  ticket_status: string;
  evidence_pending: boolean;
}

export interface AwaitingCollectionSummary {
  total: number;
  order_count: number;
  collected_so_far: number;
  booked_value: number;
  pending_evidence_count: number;
  by_status: { status: string; label: string; count: number; amount: number }[];
  orders: OutstandingOrderRow[];
}

function customerLabel(customer: unknown): string {
  if (!customer || typeof customer !== "object") return "—";
  const c = customer as { company?: string | null; first_name?: string | null; last_name?: string | null };
  if (c.company?.trim()) return c.company.trim();
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || "—";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

export function buildAwaitingCollection(
  openTickets: Record<string, unknown>[],
  leadMap: Map<string, LeadAttribution>,
  nameMap: Record<string, string>,
  filterUserId: string | null,
  filterRole: string | null,
): AwaitingCollectionSummary {
  let total = 0;
  let collectedSoFar = 0;
  let bookedValue = 0;
  let pendingEvidenceCount = 0;
  const statusMap: Record<string, { count: number; amount: number }> = {};
  const orders: OutstandingOrderRow[] = [];

  for (const row of openTickets) {
    const ticketId = row.id as string;
    const fields = row as unknown as TicketPaymentFields & {
      id: string;
      reference_code: string | null;
      title: string | null;
      ticket_status: string;
      linked_lead_id: string | null;
      created_by_id: string | null;
      routed_by_id: string | null;
      refund_status?: string | null;
      customer: unknown;
    };

    if (isFullyRefundedTicket(fields.refund_status)) continue;
    if (Number(fields.quote_final_total ?? 0) <= 0.01) continue;
    if (isTicketPaidInFull(fields)) continue;

    const summary = computeInvoicePaymentSummary(fields);
    if (summary.balanceDue <= 0.01) continue;

    const lead = fields.linked_lead_id ? leadMap.get(fields.linked_lead_id) : null;
    const ticketAttr: TicketAttribution = {
      id: ticketId,
      linked_lead_id: fields.linked_lead_id,
      created_by_id: fields.created_by_id,
      routed_by_id: fields.routed_by_id,
    };

    const salesRepId = resolveSalesRepId(ticketAttr, lead);
    const sdrId = resolveSdrId(ticketAttr, lead);

    if (!passesUserFilter(filterUserId, filterRole, salesRepId, sdrId)) continue;

    const balanceDue = round2(summary.balanceDue);
    const amountPaid = round2(summary.amountPaid);
    const quoteTotal = round2(Number(fields.quote_final_total ?? 0));
    const status = fields.ticket_status;

    total += balanceDue;
    collectedSoFar += amountPaid;
    bookedValue += quoteTotal;
    if (summary.evidencePending) pendingEvidenceCount += 1;

    if (!statusMap[status]) statusMap[status] = { count: 0, amount: 0 };
    statusMap[status].count += 1;
    statusMap[status].amount += balanceDue;

    orders.push({
      ticket_id: ticketId,
      reference_code: fields.reference_code,
      title: fields.title,
      customer_label: customerLabel(fields.customer),
      sales_rep_name: salesRepId ? (nameMap[salesRepId] ?? "Unknown") : "—",
      sdr_name: sdrId ? (nameMap[sdrId] ?? "Unknown") : "—",
      quote_total: quoteTotal,
      total_paid: amountPaid,
      balance_due: balanceDue,
      ticket_status: status,
      evidence_pending: summary.evidencePending,
    });
  }

  orders.sort((a, b) => b.balance_due - a.balance_due);

  const by_status = Object.entries(statusMap)
    .map(([status, v]) => ({
      status,
      label: STATUS_LABELS[status] ?? status,
      count: v.count,
      amount: round2(v.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    total: round2(total),
    order_count: orders.length,
    collected_so_far: round2(collectedSoFar),
    booked_value: round2(bookedValue),
    pending_evidence_count: pendingEvidenceCount,
    by_status,
    orders: orders.slice(0, 50),
  };
}
