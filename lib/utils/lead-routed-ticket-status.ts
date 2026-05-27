import { isOrderReferenceCode, isQuoteReferenceCode } from "@/lib/utils/reference-codes";

export type RoutedLeadTicket = {
  reference_code?: string | null;
  ticket_kind?: string | null;
  ticket_status?: string | null;
  client_confirmed?: boolean | null;
  ticket_require_client_confirm?: boolean | null;
  linked_lead_id?: string | null;
  updated_at?: string | null;
};

const ORDER_STATUSES = new Set(["order", "in_production", "completed"]);

export type RoutedLeadTicketDisplay =
  | { kind: "order"; label: string }
  | { kind: "quote"; label: string }
  | { kind: "waiting"; label: "Waiting for Customer" }
  | { kind: "lead_status"; status: string };

function isOrderTicket(ticket: RoutedLeadTicket): boolean {
  const ref = ticket.reference_code?.trim();
  return (
    ticket.ticket_kind === "order" ||
    ORDER_STATUSES.has(ticket.ticket_status ?? "") ||
    (!!ref && isOrderReferenceCode(ref))
  );
}

function isQuoteTicket(ticket: RoutedLeadTicket): boolean {
  if (isOrderTicket(ticket)) return false;
  const ref = ticket.reference_code?.trim();
  return (
    ticket.ticket_kind === "quote" ||
    (!!ref && isQuoteReferenceCode(ref)) ||
    ["draft", "sent", "approved", "routed"].includes(ticket.ticket_status ?? "")
  );
}

export function isWaitingForCustomerConfirm(ticket: RoutedLeadTicket): boolean {
  if (!isQuoteTicket(ticket) || isOrderTicket(ticket)) return false;
  if (ticket.ticket_status !== "sent") return false;
  const requireConfirm = ticket.ticket_require_client_confirm !== false;
  return requireConfirm && !ticket.client_confirmed;
}

function sortTicketsNewestFirst(tickets: RoutedLeadTicket[]): RoutedLeadTicket[] {
  return [...tickets].sort(
    (a, b) =>
      new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
  );
}

/** Directed-to-Sales Lead Status column: order ref → waiting → quote ref → lead status. */
export function routedLeadTicketDisplay(
  lead: { id: string; status: string },
  tickets: RoutedLeadTicket[] | undefined | null,
): RoutedLeadTicketDisplay {
  const linked = sortTicketsNewestFirst(
    (tickets ?? []).filter((t) => !t.linked_lead_id || t.linked_lead_id === lead.id),
  );

  const orderTicket = linked.find(isOrderTicket);
  if (orderTicket?.reference_code?.trim()) {
    return { kind: "order", label: orderTicket.reference_code.trim() };
  }
  if (orderTicket) {
    return { kind: "order", label: "Order" };
  }

  const waitingTicket = linked.find(isWaitingForCustomerConfirm);
  if (waitingTicket) {
    return { kind: "waiting", label: "Waiting for Customer" };
  }

  const quoteTicket = linked.find(isQuoteTicket);
  if (quoteTicket?.reference_code?.trim()) {
    return { kind: "quote", label: quoteTicket.reference_code.trim() };
  }
  if (quoteTicket) {
    return { kind: "quote", label: "Quote" };
  }

  return { kind: "lead_status", status: lead.status };
}
