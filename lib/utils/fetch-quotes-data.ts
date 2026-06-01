import type { createAdminClient } from "@/lib/supabase/admin";
import {
  countExact,
  scopeJobTicketsQuery,
  scopedTicketCount,
  type TicketSelectQuery,
} from "@/lib/utils/db-counts";
import type { PaginationParams } from "@/lib/utils/pagination";
import {
  applyTicketDateFilter,
  applyTicketSearchFilterWithCustomerIds,
  resolveTicketSearchCustomerIds,
  tabToQuoteStatuses,
  type QuotesListFilters,
} from "@/lib/utils/ticket-list-filters";
import {
  QUOTE_LIST_STATUSES,
  TICKET_QUOTE_LIST_SELECT,
} from "@/lib/utils/ticket-list-select";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Delegates to `scopeJobTicketsQuery` — single source of truth for ticket list scoping. */
export function applyTicketScope<T extends TicketSelectQuery>(
  query: T,
  roleName: string,
  userId: string | null,
  adminFilterUserId?: string | null,
): T {
  return scopeJobTicketsQuery(query, roleName, userId, adminFilterUserId ?? null);
}

async function buildScopedQuotesQuery(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: QuotesListFilters,
  options?: { count?: "exact"; pagination?: PaginationParams },
): Promise<TicketSelectQuery> {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  let query = applyTicketScope(
    admin
      .from("job_tickets")
      .select(TICKET_QUOTE_LIST_SELECT, options?.count ? { count: "exact" } : undefined) as TicketSelectQuery,
    roleName,
    userId,
    filters.adminFilterUserId ?? null,
  );

  query = query.eq("ticket_kind", "quote") as TicketSelectQuery;
  query = query.in("ticket_status", tabToQuoteStatuses(filters.tab)) as TicketSelectQuery;
  query = applyTicketDateFilter(query, filters.dateFrom, filters.dateTo, "created_at") as TicketSelectQuery;
  query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds) as TicketSelectQuery;

  query = query.order("created_at", { ascending: false }) as TicketSelectQuery;

  if (options?.pagination) {
    const { offset, limit } = options.pagination;
    query = query.range(offset, offset + limit - 1) as TicketSelectQuery;
  }

  return query;
}

type QuoteRow = {
  ticket_status?: string;
  created_by_id?: string | null;
  reference_code?: string | null;
  title?: string | null;
  customer?:
    | { first_name?: string | null; last_name?: string | null; company?: string | null }
    | Array<{ first_name?: string | null; last_name?: string | null; company?: string | null }>
    | null;
  [key: string]: unknown;
};

async function enrichQuoteRows(admin: AdminClient, tickets: QuoteRow[]) {
  const creatorIds = [...new Set(tickets.map((t) => t.created_by_id).filter(Boolean))] as string[];
  if (creatorIds.length === 0) return tickets;

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, full_name")
    .in("id", creatorIds);
  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  return tickets.map((t) => ({
    ...t,
    created_by_name: t.created_by_id ? (nameMap[t.created_by_id] ?? "—") : undefined,
    created_by: t.created_by_id
      ? { id: t.created_by_id, full_name: nameMap[t.created_by_id] ?? null }
      : null,
  }));
}

export async function fetchQuotesList(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: QuotesListFilters = {},
  pagination?: PaginationParams,
) {
  const query = await buildScopedQuotesQuery(
    admin,
    roleName,
    userId,
    filters,
    pagination ? { count: "exact", pagination } : undefined,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  const tickets = (data ?? []) as QuoteRow[];
  const rows = await enrichQuoteRows(admin, tickets);
  const total = pagination ? (count ?? rows.length) : rows.length;

  return { rows, total };
}

async function countFilteredQuotesByStatus(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: QuotesListFilters,
  status: string,
  searchCustomerIds: string[],
): Promise<number> {
  return scopedTicketCount(
    admin,
    roleName,
    userId,
    (q) => {
      let query = q.eq("ticket_kind", "quote").eq("ticket_status", status);
      query = applyTicketDateFilter(query, filters.dateFrom, filters.dateTo, "created_at");
      query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds);
      return query;
    },
    filters.adminFilterUserId ?? undefined,
  );
}

export async function fetchQuotesTabCounts(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: QuotesListFilters = {},
) {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  const [draft, sent, approved, cancelled, scopedRouted] = await Promise.all([
    countFilteredQuotesByStatus(admin, roleName, userId, filters, "draft", searchCustomerIds),
    countFilteredQuotesByStatus(admin, roleName, userId, filters, "sent", searchCustomerIds),
    countFilteredQuotesByStatus(admin, roleName, userId, filters, "approved", searchCustomerIds),
    countFilteredQuotesByStatus(admin, roleName, userId, filters, "cancelled", searchCustomerIds),
    countFilteredQuotesByStatus(admin, roleName, userId, filters, "routed", searchCustomerIds),
  ]);

  const globalRouted =
    roleName === "sales" || roleName === "admin"
      ? await countExact(admin, "job_tickets", (q) => {
          let query = q.eq("ticket_status", "routed");
          if (roleName === "admin" && filters.adminFilterUserId) {
            query = query.eq("created_by_id", filters.adminFilterUserId);
          }
          query = applyTicketDateFilter(query, filters.dateFrom, filters.dateTo, "created_at");
          query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds);
          return query;
        })
      : scopedRouted;

  const routed =
    roleName === "sales" || roleName === "admin" ? globalRouted : scopedRouted;

  return {
    all: draft + sent + approved,
    draft,
    sent,
    approved,
    cancelled,
    routed,
  };
}

/** Scope helper exported for tickets route non-quote-list queries. */
export { QUOTE_LIST_STATUSES };
