/** PostgREST `.or()` filter — ticket has no partial/full refund on file. */
export const EXCLUDE_REFUNDED_OR_FILTER = "refund_status.is.null,refund_status.eq.none";

/**
 * Refunded orders stay off active ops lists, but cancelled+refunded orders remain
 * findable on Orders → Cancelled and Payment Evidence → Refunded.
 */
export const EXCLUDE_REFUNDED_UNLESS_CANCELLED_OR_FILTER =
  "refund_status.is.null,refund_status.eq.none,ticket_status.eq.cancelled";

/** PostgREST `.or()` filter — exclude only fully refunded orders from revenue KPIs. */
export const EXCLUDE_FULL_REFUND_REVENUE_OR_FILTER =
  "refund_status.is.null,refund_status.eq.none,refund_status.eq.partial";

type OrFilterable = { or: (filters: string) => unknown };

/** Keep refunded orders only on Payment Evidence → Refunded (and Cancelled when applicable). */
export function excludeRefundedTickets<T extends OrFilterable>(query: T): T {
  return query.or(EXCLUDE_REFUNDED_OR_FILTER) as T;
}

/** Orders list: All tab includes cancelled+refunded; Cancelled tab includes all cancelled. */
export function excludeRefundedTicketsForOrdersList<T extends OrFilterable>(
  query: T,
  tab: "all" | "pending" | "in_production" | "cancelled" | undefined,
): T {
  if (tab === "cancelled") return query;
  if (tab === "all") return query.or(EXCLUDE_REFUNDED_UNLESS_CANCELLED_OR_FILTER) as T;
  return excludeRefundedTickets(query);
}

/** Dashboard / reports revenue — partial refunds still count until order is fully refunded. */
export function excludeFullyRefundedFromRevenue<T extends OrFilterable>(query: T): T {
  return query.or(EXCLUDE_FULL_REFUND_REVENUE_OR_FILTER) as T;
}

export function isFullyRefundedTicket(
  refundStatus: string | null | undefined,
): boolean {
  return refundStatus === "full";
}

/** Cash collected, pipeline value, and related KPIs — skip cancelled or refunded tickets. */
export function isExcludedFromRevenueKpis(ticket: {
  ticket_status?: string | null;
  refund_status?: string | null;
}): boolean {
  if (ticket.ticket_status === "cancelled") return true;
  const rs = ticket.refund_status;
  return rs === "partial" || rs === "full";
}
