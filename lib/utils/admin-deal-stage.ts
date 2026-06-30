import { quoteListStatus } from "@/lib/utils/quote-list-status";
import { orderListStatus } from "@/lib/utils/order-list-status";
import {
  isOrderReferenceCode,
  isQuoteReferenceCode,
  quoteReferenceFromOrderReference,
} from "@/lib/utils/reference-codes";

/** Filter pills on GET /api/admin/operations/page-data */
export type OperationsFilter =
  | "all_active"
  | "sdr"
  | "sales_queue"
  | "sales_working"
  | "quoted"
  | "order"
  | "completed"
  | "hold"
  | "rejected"
  | "performance";

export const OPERATIONS_FILTER_OPTIONS: OperationsFilter[] = [
  "performance",
  "all_active",
  "sdr",
  "sales_queue",
  "sales_working",
  "quoted",
  "order",
  "completed",
  "hold",
  "rejected",
];

export const OPERATIONS_FILTER_LABELS: Record<OperationsFilter, string> = {
  all_active: "All active",
  sdr: "SDR",
  sales_queue: "Unclaimed leads",
  sales_working: "Sales working",
  quoted: "Quoted",
  order: "Order",
  completed: "Completed",
  hold: "On hold / Follow up",
  rejected: "Rejected",
  performance: "Performance",
};

export type OperationsLinkedTicket = {
  id: string;
  reference_code?: string | null;
  ticket_kind?: string | null;
  ticket_status?: string | null;
  linked_lead_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  client_confirmed?: boolean | null;
  ticket_require_client_confirm?: boolean | null;
  payment_evidence_url?: string | null;
  payment_evidence_submitted_at?: string | null;
  payment_evidence_reviewed_at?: string | null;
  payment_paid_at?: string | null;
  deposit_paid_at?: string | null;
  payment_amount_received?: number | null;
  deposit_amount?: number | null;
  tax_exempt?: boolean | null;
  sales_permit_storage_path?: string | null;
  sales_permit_reviewed_at?: string | null;
};

export type OperationsLead = {
  id: string;
  status: string;
  sales_status: string | null;
  is_inbox: boolean;
  locked_by_id: string | null;
  sales_owner_id: string | null;
  sdr_id: string | null;
  created_at: string;
  tickets?: OperationsLinkedTicket[] | null;
};

const ORDER_STATUSES = new Set(["order", "in_production", "completed"]);
const QUOTE_STATUSES = new Set(["draft", "sent", "approved", "routed"]);

function linkedTickets(lead: OperationsLead): OperationsLinkedTicket[] {
  return (lead.tickets ?? []).filter(
    (t) => !t.linked_lead_id || t.linked_lead_id === lead.id,
  );
}

function activeTickets(tickets: OperationsLinkedTicket[]): OperationsLinkedTicket[] {
  return tickets.filter((t) => t.ticket_status !== "cancelled");
}

function isWaitingForCustomerConfirm(ticket: OperationsLinkedTicket): boolean {
  if (!isQuoteStageTicket(ticket) || isOrderTicket(ticket)) return false;
  if (ticket.ticket_status !== "sent") return false;
  const requireConfirm = ticket.ticket_require_client_confirm !== false;
  return requireConfirm && !ticket.client_confirmed;
}

export function hasOperationsSentQuote(
  lead: OperationsLead,
  tickets: OperationsLinkedTicket[],
): boolean {
  if (lead.sales_status === "Quote Sent") return true;
  return tickets.some(
    (t) => t.ticket_status === "sent" || isWaitingForCustomerConfirm(t),
  );
}

function isOrderTicket(ticket: OperationsLinkedTicket): boolean {
  const ref = ticket.reference_code?.trim();
  return (
    ticket.ticket_kind === "order" ||
    ORDER_STATUSES.has(ticket.ticket_status ?? "") ||
    (!!ref && isOrderReferenceCode(ref))
  );
}

function isQuoteStageTicket(ticket: OperationsLinkedTicket): boolean {
  if (isOrderTicket(ticket)) return false;
  const ref = ticket.reference_code?.trim();
  return (
    ticket.ticket_kind === "quote" ||
    QUOTE_STATUSES.has(ticket.ticket_status ?? "") ||
    (!!ref && isQuoteReferenceCode(ref))
  );
}

function sortTicketsNewestFirst(tickets: OperationsLinkedTicket[]): OperationsLinkedTicket[] {
  return [...tickets].sort(
    (a, b) =>
      new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
      new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
  );
}

export function resolveOperationsTicketRefs(
  lead: OperationsLead,
): { quote: OperationsLinkedTicket | null; order: OperationsLinkedTicket | null } {
  const sorted = sortTicketsNewestFirst(linkedTickets(lead));
  const active = activeTickets(sorted);
  const pool = active.length > 0 ? active : sorted;
  const order = pool.find(isOrderTicket) ?? null;
  let quote = pool.find(isQuoteStageTicket) ?? null;

  // Same ticket after quote → order conversion: ORD-* replaces QUO-* on one row.
  if (!quote && order) {
    const derivedRef = quoteReferenceFromOrderReference(order.reference_code);
    if (derivedRef) {
      quote = { ...order, reference_code: derivedRef };
    }
  }

  return { quote, order };
}

export function primaryOperationsTicket(lead: OperationsLead): OperationsLinkedTicket | null {
  const sorted = sortTicketsNewestFirst(linkedTickets(lead));
  return activeTickets(sorted)[0] ?? sorted[0] ?? null;
}

/** Current stage label — matches existing list pages / StatusPill vocabulary. */
export function getAdminDealStageLabel(
  lead: OperationsLead,
  primaryTicket: OperationsLinkedTicket | null,
): string {
  if (primaryTicket) {
    const status = primaryTicket.ticket_status ?? "";

    if (status === "cancelled") return "Cancelled";
    if (status === "completed") return "Completed";
    if (status === "in_production") return "In Production";

    if (status === "order" || isOrderTicket(primaryTicket)) {
      const pending = orderListStatus({
        ticket_status: status,
        client_confirmed: primaryTicket.client_confirmed,
        require_client_confirm: primaryTicket.ticket_require_client_confirm,
        payment_evidence_url: primaryTicket.payment_evidence_url,
        payment_evidence_submitted_at: primaryTicket.payment_evidence_submitted_at,
        payment_evidence_reviewed_at: primaryTicket.payment_evidence_reviewed_at,
        payment_paid_at: primaryTicket.payment_paid_at,
        deposit_paid_at: primaryTicket.deposit_paid_at,
        payment_amount_received: primaryTicket.payment_amount_received,
        deposit_amount: primaryTicket.deposit_amount,
      });
      if (pending.label === "Converted" || pending.label.startsWith("Converted by")) {
        return "Pending Payment";
      }
      return pending.label;
    }

    if (isQuoteStageTicket(primaryTicket)) {
      return quoteListStatus({
        ticket_status: status,
        client_confirmed: primaryTicket.client_confirmed,
        ticket_require_client_confirm: primaryTicket.ticket_require_client_confirm,
        tax_exempt: primaryTicket.tax_exempt ?? false,
        sales_permit_storage_path: primaryTicket.sales_permit_storage_path,
        sales_permit_reviewed_at: primaryTicket.sales_permit_reviewed_at,
        payment_evidence_url: primaryTicket.payment_evidence_url,
        payment_evidence_submitted_at: primaryTicket.payment_evidence_submitted_at,
        payment_evidence_reviewed_at: primaryTicket.payment_evidence_reviewed_at,
        payment_paid_at: primaryTicket.payment_paid_at,
        deposit_paid_at: primaryTicket.deposit_paid_at,
        payment_amount_received: primaryTicket.payment_amount_received,
      }).label;
    }
  }

  if (lead.status === "Rejected" || lead.sales_status === "Rejected") return "Rejected";
  if (lead.sales_status === "Dropped") return "Dropped";
  if (lead.sales_status === "Won") return "Won";
  if (lead.sales_status === "On Hold" || lead.status === "On Hold") return "On Hold";
  if (lead.sales_status === "Follow Up Later" || lead.status === "Follow Up Later") {
    return "Follow Up Later";
  }
  if (lead.sales_status === "In Progress") return "In Progress";
  if (lead.sales_status === "Claimed") return "Claimed";
  if (lead.sales_status === "Quote Sent") return "Quote Sent";
  if (lead.status === "Routed to Sales" && !lead.sales_owner_id) return "Routed to Sales";
  if (lead.status === "Quoted") return "Quoted";
  if (lead.status === "Validated") return "Validated";
  if (lead.is_inbox || lead.status === "Pending") return "Pending";

  return lead.status || "Pending";
}

export type OperationsOwnerHighlight = "sdr" | "sales" | "unclaimed" | null;

/** True when the stage label comes from the primary ticket row (Quotes/Orders lists). */
export function isOperationsStageFromTicket(
  primaryTicket: OperationsLinkedTicket | null,
): boolean {
  if (!primaryTicket) return false;
  const status = primaryTicket.ticket_status ?? "";
  if (status === "cancelled") return true;
  if (status === "completed") return true;
  if (status === "in_production") return true;
  if (status === "order" || isOrderTicket(primaryTicket)) return true;
  if (isQuoteStageTicket(primaryTicket)) return true;
  return false;
}

/** Which team column is actively responsible at this pipeline step. */
export function getOperationsOwnerHighlight(lead: OperationsLead): OperationsOwnerHighlight {
  const bucket = getOperationsFilterBucket(lead);
  if (bucket === "sdr") return "sdr";
  if (bucket === "sales_queue") return "unclaimed";
  if (
    bucket === "sales_working" ||
    bucket === "quoted" ||
    bucket === "order" ||
    bucket === "completed" ||
    bucket === "hold"
  ) {
    return "sales";
  }
  return null;
}

export function resolveOperationsStageContext(
  lead: OperationsLead,
  primaryTicket: OperationsLinkedTicket | null,
): {
  stageFromTicket: boolean;
  stageTicketRef: string | null;
  ownerHighlight: OperationsOwnerHighlight;
} {
  const stageFromTicket = isOperationsStageFromTicket(primaryTicket);
  return {
    stageFromTicket,
    stageTicketRef: stageFromTicket
      ? primaryTicket?.reference_code?.trim() || null
      : null,
    ownerHighlight: getOperationsOwnerHighlight(lead),
  };
}

/** Same gate as `/completed` — finished order ticket, not lead `sales_status: Won`. */
export function hasOperationsCompletedOrder(lead: OperationsLead): boolean {
  const { order } = resolveOperationsTicketRefs(lead);
  return order?.ticket_status === "completed";
}

/** Same gate as Sales / Leads Rejected — not cancelled-only deals or Dropped. */
export function isOperationsRejectedLead(lead: OperationsLead): boolean {
  if (lead.status !== "Rejected" && lead.sales_status !== "Rejected") {
    return false;
  }
  const tickets = linkedTickets(lead);
  const liveTickets = activeTickets(tickets);
  // Cancelled/refunded-only tickets → Quotes/Orders Cancelled, not Rejected tab.
  if (tickets.length > 0 && liveTickets.length === 0) {
    return false;
  }
  return true;
}

export function getOperationsFilterBucket(lead: OperationsLead): OperationsFilter {
  const tickets = linkedTickets(lead);
  const liveTickets = activeTickets(tickets);
  const primary = sortTicketsNewestFirst(tickets)[0] ?? null;
  const { quote, order } = resolveOperationsTicketRefs(lead);

  if (isOperationsRejectedLead(lead)) {
    return "rejected";
  }

  if (hasOperationsCompletedOrder(lead)) {
    return "completed";
  }

  if (lead.sales_status === "On Hold" || lead.status === "On Hold") return "hold";
  if (lead.sales_status === "Follow Up Later" || lead.status === "Follow Up Later") {
    return "hold";
  }

  if (
    order ||
    liveTickets.some(isOrderTicket) ||
    primary?.ticket_status === "order" ||
    primary?.ticket_status === "in_production"
  ) {
    return "order";
  }

  if (
    quote ||
    liveTickets.some(isQuoteStageTicket) ||
    hasOperationsSentQuote(lead, liveTickets) ||
    lead.sales_status === "Quote Sent" ||
    lead.status === "Quoted" ||
    (primary && isQuoteStageTicket(primary))
  ) {
    return "quoted";
  }

  if (
    lead.status === "Routed to Sales" &&
    (lead.sales_status === "Claimed" ||
      lead.sales_status === "In Progress" ||
      lead.sales_status === "Ongoing" ||
      (lead.sales_owner_id && !lead.sales_status))
  ) {
    return "sales_working";
  }

  if (lead.status === "Routed to Sales" && !lead.sales_owner_id) {
    return "sales_queue";
  }

  if (
    lead.is_inbox ||
    lead.status === "Pending" ||
    lead.status === "Validated" ||
    lead.locked_by_id
  ) {
    return "sdr";
  }

  return "all_active";
}

export function isOperationsActiveBucket(bucket: OperationsFilter): boolean {
  return bucket !== "rejected" && bucket !== "completed";
}

export function matchesOperationsFilter(
  lead: OperationsLead,
  filter: OperationsFilter,
): boolean {
  if (filter === "performance") return false;
  if (filter === "all_active") {
    if (lead.sales_status === "Dropped") return false;
    return isOperationsActiveBucket(getOperationsFilterBucket(lead));
  }
  return getOperationsFilterBucket(lead) === filter;
}

export function countOperationsFilters(
  leads: OperationsLead[],
): Record<OperationsFilter, number> {
  const counts = Object.fromEntries(
    OPERATIONS_FILTER_OPTIONS.map((k) => [k, 0]),
  ) as Record<OperationsFilter, number>;

  for (const lead of leads) {
    const bucket = getOperationsFilterBucket(lead);
    counts[bucket] += 1;
    if (isOperationsActiveBucket(bucket)) {
      counts.all_active += 1;
    }
  }

  return counts;
}
