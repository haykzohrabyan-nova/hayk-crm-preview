import type { createAdminClient } from "@/lib/supabase/admin";
import {
  countExact,
  scopeJobTicketsQuery,
  scopedTicketCount,
  type TicketSelectQuery,
} from "@/lib/utils/db-counts";
import {
  QUOTE_LIST_STATUSES,
  TICKET_QUOTE_LIST_SELECT,
} from "@/lib/utils/ticket-list-select";

type AdminClient = ReturnType<typeof createAdminClient>;

function applyTicketScope<T extends { or: (filter: string) => T }>(
  query: T,
  roleName: string,
  userId: string | null,
): T {
  if (roleName === "admin") return query;
  if (roleName === "sales" && userId) {
    return query.or(`created_by_id.eq.${userId},ticket_status.eq.routed`) as T;
  }
  if (userId) {
    return query.or(`created_by_id.eq.${userId},routed_by_id.eq.${userId}`) as T;
  }
  return query;
}

export async function fetchQuotesList(
  admin: AdminClient,
  roleName: string,
  userId: string,
  search = "",
) {
  const result = await applyTicketScope(
    admin
      .from("job_tickets")
      .select(TICKET_QUOTE_LIST_SELECT)
      .eq("ticket_kind", "quote")
      .in("ticket_status", [...QUOTE_LIST_STATUSES])
      .order("created_at", { ascending: false }),
    roleName,
    userId,
  );

  if (result.error) throw result.error;

  let tickets = (result.data ?? []) as unknown as Array<{
    ticket_status?: string;
    created_by_id?: string | null;
    reference_code?: string | null;
    title?: string | null;
    customer?:
      | { first_name?: string | null; last_name?: string | null; company?: string | null }
      | Array<{ first_name?: string | null; last_name?: string | null; company?: string | null }>
      | null;
    [key: string]: unknown;
  }>;

  const routedTickets = tickets.filter((t) => t.ticket_status === "routed");
  if (routedTickets.length > 0) {
    const creatorIds = [...new Set(routedTickets.map((t) => t.created_by_id).filter(Boolean))];
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .in("id", creatorIds as string[]);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "SDR"]));
    tickets = tickets.map((t) =>
      t.ticket_status === "routed" && t.created_by_id
        ? { ...t, created_by_name: nameMap[t.created_by_id] ?? "SDR" }
        : t,
    );
  }

  const normalizedSearch = search.trim().toLowerCase();
  if (normalizedSearch) {
    tickets = tickets.filter((t) => {
      const raw = t.customer;
      const customer = Array.isArray(raw) ? raw[0] : raw;
      const name = `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.toLowerCase();
      const company = (customer?.company ?? "").toLowerCase();
      const ref = String(t.reference_code ?? "").toLowerCase();
      const title = String(t.title ?? "").toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        company.includes(normalizedSearch) ||
        ref.includes(normalizedSearch) ||
        title.includes(normalizedSearch)
      );
    });
  }

  return tickets;
}

export async function fetchQuotesTabCounts(
  admin: AdminClient,
  roleName: string,
  userId: string,
) {
  const [drafts, sent, approved, scopedRouted, globalRouted] = await Promise.all([
    scopedTicketCount(admin, roleName, userId, (q) =>
      q.eq("ticket_kind", "quote").eq("ticket_status", "draft"),
    ),
    scopedTicketCount(admin, roleName, userId, (q) =>
      q.eq("ticket_kind", "quote").eq("ticket_status", "sent"),
    ),
    scopedTicketCount(admin, roleName, userId, (q) =>
      q.eq("ticket_kind", "quote").eq("ticket_status", "approved"),
    ),
    scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "routed")),
    roleName === "sales" || roleName === "admin" || roleName === "accountant"
      ? countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "routed"))
      : Promise.resolve(0),
  ]);

  const routed =
    roleName === "sales" || roleName === "admin" || roleName === "accountant"
      ? globalRouted
      : scopedRouted;

  return {
    all: drafts + sent + approved,
    draft: drafts,
    sent,
    approved,
    routed,
  };
}

/** Scope helper exported for tickets route non-quote-list queries. */
export { applyTicketScope };
