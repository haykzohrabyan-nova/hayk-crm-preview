/** Resolve sales / SDR credit for payment attribution (bonus-ready). */

export interface TicketAttribution {
  id: string;
  linked_lead_id: string | null;
  created_by_id: string | null;
  routed_by_id: string | null;
}

export interface LeadAttribution {
  id: string;
  sales_owner_id: string | null;
  sdr_id: string | null;
}

/** Primary: lead sales owner. Fallback: quote creator (direct orders). */
export function resolveSalesRepId(
  ticket: TicketAttribution,
  lead: LeadAttribution | null | undefined,
): string | null {
  if (lead?.sales_owner_id) return lead.sales_owner_id;
  return ticket.created_by_id ?? null;
}

/** Primary: lead SDR. Fallback: ticket routed_by_id. */
export function resolveSdrId(
  ticket: TicketAttribution,
  lead: LeadAttribution | null | undefined,
): string | null {
  if (lead?.sdr_id) return lead.sdr_id;
  return ticket.routed_by_id ?? null;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  wire: "Wire Transfer",
  ach: "ACH / Bank",
  zelle: "Zelle",
  check: "Check",
  card: "Card",
  offline: "Offline",
  other: "Other",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
