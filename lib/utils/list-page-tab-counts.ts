/** Client-side tab badge counts from date-filtered list rows (Quotes / Orders pages). */

const QUOTE_EXCLUDED = new Set(["order", "in_production", "completed"]);

export function countQuotesTabBadges(
  items: ReadonlyArray<{ ticket_status: string; ticket_kind?: string | null }>,
): Record<string, number> {
  const quotes = items.filter(
    (q) => !QUOTE_EXCLUDED.has(q.ticket_status) && (q.ticket_kind == null || q.ticket_kind === "quote"),
  );
  const draft = quotes.filter((q) => q.ticket_status === "draft").length;
  const sent = quotes.filter((q) => q.ticket_status === "sent").length;
  const approved = quotes.filter((q) => q.ticket_status === "approved").length;
  const cancelled = quotes.filter((q) => q.ticket_status === "cancelled").length;
  const routed = quotes.filter((q) => q.ticket_status === "routed").length;
  return {
    all: draft + sent + approved,
    draft,
    sent,
    approved,
    cancelled,
    routed,
  };
}

export function countOrdersTabBadges(
  items: ReadonlyArray<{ ticket_status: string; ticket_kind?: string | null }>,
): Record<string, number> {
  const orders = items.filter((o) => o.ticket_kind == null || o.ticket_kind === "order");
  const pending = orders.filter((o) => o.ticket_status === "order").length;
  const inProduction = orders.filter((o) => o.ticket_status === "in_production").length;
  const cancelled = orders.filter((o) => o.ticket_status === "cancelled").length;
  return {
    all: pending + inProduction + cancelled,
    pending,
    in_production: inProduction,
    cancelled,
  };
}
