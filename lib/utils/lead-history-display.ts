import { isOrderReferenceCode, isQuoteReferenceCode } from "@/lib/utils/reference-codes";

export type LeadHistoryTicket = {
  reference_code?: string | null;
  ticket_kind?: string | null;
  ticket_status?: string | null;
  linked_lead_id?: string | null;
};

const ORDER_STATUSES = new Set(["order", "in_production", "completed", "approved"]);

export function leadTicketRefsForLead(
  tickets: LeadHistoryTicket[],
  leadId: string,
): { quoteRef: string | null; orderRef: string | null } {
  const linked = tickets.filter((t) => t.linked_lead_id === leadId);
  let quoteRef: string | null = null;
  let orderRef: string | null = null;

  for (const t of linked) {
    const ref = t.reference_code?.trim();
    if (!ref) continue;

    const isOrder =
      t.ticket_kind === "order" ||
      ORDER_STATUSES.has(t.ticket_status ?? "") ||
      isOrderReferenceCode(ref);

    const isQuote =
      t.ticket_kind === "quote" ||
      isQuoteReferenceCode(ref);

    if (isOrder) {
      orderRef = ref;
    } else if (isQuote) {
      quoteRef = ref;
    }
  }

  return { quoteRef, orderRef };
}

export function leadSourceLabel(
  source: string | null | undefined,
  labels: Record<string, string>,
): string {
  if (!source) return "—";
  return labels[source] ?? source;
}
