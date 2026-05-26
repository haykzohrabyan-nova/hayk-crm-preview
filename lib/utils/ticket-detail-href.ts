import { safeReturnPath } from "@/lib/auth/safe-return-path";

/** Return path when opening a ticket from Reports (Back button target). */
export const REPORTS_RETURN_PATH = "/reports";

/**
 * Detail route for a ticket in its lifecycle stage (orders, quotes, completed).
 * Use `/payments/[id]` only for the accountant payment-review queue — not general navigation.
 */
export function ticketLifecycleHref(ticketId: string, ticketStatus: string): string {
  switch (ticketStatus) {
    case "order":
    case "in_production":
      return `/orders/${ticketId}`;
    case "completed":
      return `/completed/${ticketId}`;
    case "draft":
    case "sent":
    case "routed":
      return `/quotes/${ticketId}`;
    default:
      return `/orders/${ticketId}`;
  }
}

/** Append a validated internal `from` query param for detail Back navigation. */
export function appendReturnPath(href: string, returnPath: string | null | undefined): string {
  const safe = safeReturnPath(returnPath);
  if (!safe) return href;
  const join = href.includes("?") ? "&" : "?";
  return `${href}${join}from=${encodeURIComponent(safe)}`;
}

export function ticketLifecycleHrefWithReturn(
  ticketId: string,
  ticketStatus: string,
  returnPath: string | null | undefined,
): string {
  return appendReturnPath(ticketLifecycleHref(ticketId, ticketStatus), returnPath);
}

export type TicketDetailContext = "quote" | "order" | "production" | "payment" | "completed";

/** Back target: explicit `from` param first, else lifecycle list fallback. */
export function resolveTicketDetailBackPath(
  context: TicketDetailContext,
  ticketStatus: string,
  from: string | null | undefined,
): string {
  const safe = safeReturnPath(from);
  if (safe) return safe;

  if (context === "production" || ticketStatus === "in_production") {
    return "/orders?tab=in_production";
  }
  if (context === "completed") return "/completed";
  if (context === "payment") return "/payments";
  if (context === "order") return "/orders";
  if (context === "quote") return "/quotes";
  return "/orders";
}
