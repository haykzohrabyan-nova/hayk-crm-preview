import type { createAdminClient } from "@/lib/supabase/admin";
import { parseAdminFilterUserId } from "@/lib/utils/admin-user-filter";
import { parseOrdersListSort, type OrdersListSortField } from "@/lib/utils/orders-list-sort";

type AdminClient = ReturnType<typeof createAdminClient>;

export type OrdersListTab = "all" | "pending" | "in_production" | "cancelled";

export type TicketListFilters = {
  tab?: OrdersListTab;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  adminFilterUserId?: string | null;
  sort?: OrdersListSortField;
};

const ORDERS_TAB_STATUSES: Record<OrdersListTab, string[]> = {
  all: ["order", "in_production", "cancelled"],
  pending: ["order"],
  in_production: ["in_production"],
  cancelled: ["cancelled"],
};

const VALID_ORDERS_TABS = new Set<string>(Object.keys(ORDERS_TAB_STATUSES));

export function parseOrdersListFilters(
  searchParams: URLSearchParams,
  roleName: string | null,
): TicketListFilters {
  const tabParam = searchParams.get("tab") ?? "all";
  const tab = VALID_ORDERS_TABS.has(tabParam) ? (tabParam as OrdersListTab) : "all";
  const search = searchParams.get("search")?.trim() ?? "";
  const dateFrom = searchParams.get("date_from")?.trim() || undefined;
  const dateTo = searchParams.get("date_to")?.trim() || undefined;

  return {
    tab,
    search,
    dateFrom,
    dateTo,
    adminFilterUserId: parseAdminFilterUserId(searchParams, roleName),
    sort: parseOrdersListSort(searchParams),
  };
}

export function tabToTicketStatuses(tab: OrdersListTab | undefined): string[] {
  return ORDERS_TAB_STATUSES[tab ?? "all"];
}

// ─── Quotes list filters ─────────────────────────────────────────────────────

export type QuotesListTab = "all" | "draft" | "sent" | "approved" | "cancelled" | "routed";

export type QuotesListFilters = {
  tab?: QuotesListTab;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  adminFilterUserId?: string | null;
};

const QUOTES_TAB_STATUSES: Record<QuotesListTab, string[]> = {
  all: ["draft", "sent", "approved"],
  draft: ["draft"],
  sent: ["sent"],
  approved: ["approved"],
  cancelled: ["cancelled"],
  routed: ["routed"],
};

const VALID_QUOTES_TABS = new Set<string>(Object.keys(QUOTES_TAB_STATUSES));

export function parseQuotesListFilters(
  searchParams: URLSearchParams,
  roleName: string | null,
): QuotesListFilters {
  const tabParam = searchParams.get("tab") ?? "all";
  const tab = VALID_QUOTES_TABS.has(tabParam) ? (tabParam as QuotesListTab) : "all";
  return {
    tab,
    search: searchParams.get("search")?.trim() ?? "",
    dateFrom: searchParams.get("date_from")?.trim() || undefined,
    dateTo: searchParams.get("date_to")?.trim() || undefined,
    adminFilterUserId: parseAdminFilterUserId(searchParams, roleName),
  };
}

export function tabToQuoteStatuses(tab: QuotesListTab | undefined): string[] {
  return QUOTES_TAB_STATUSES[tab ?? "all"];
}

// ─── Completed list filters ──────────────────────────────────────────────────

export type CompletedListFilters = {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  adminFilterUserId?: string | null;
};

export function parseCompletedListFilters(
  searchParams: URLSearchParams,
  roleName: string | null,
): CompletedListFilters {
  return {
    search: searchParams.get("search")?.trim() ?? "",
    dateFrom: searchParams.get("date_from")?.trim() || undefined,
    dateTo: searchParams.get("date_to")?.trim() || undefined,
    adminFilterUserId: parseAdminFilterUserId(searchParams, roleName),
  };
}

// ─── Production list filters ─────────────────────────────────────────────────

export type ProductionListTab = "all" | "balance_due";

export type ProductionListFilters = {
  tab?: ProductionListTab;
  search?: string;
};

const VALID_PRODUCTION_TABS = new Set<string>(["all", "balance_due"]);

export function parseProductionListFilters(searchParams: URLSearchParams): ProductionListFilters {
  const tabParam = searchParams.get("tab") ?? "all";
  const tab = VALID_PRODUCTION_TABS.has(tabParam) ? (tabParam as ProductionListTab) : "all";
  return {
    tab,
    search: searchParams.get("search")?.trim() ?? "",
  };
}

export function parseListSearchDateParams(searchParams: URLSearchParams) {
  return {
    search: searchParams.get("search")?.trim() ?? "",
    dateFrom: searchParams.get("date_from")?.trim() || undefined,
    dateTo: searchParams.get("date_to")?.trim() || undefined,
  };
}

type FilterableQuery = {
  gte: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  or: (filters: string) => FilterableQuery;
};

export function applyTicketDateFilter<Q extends FilterableQuery>(
  query: Q,
  dateFrom?: string,
  dateTo?: string,
  column = "created_at",
): Q {
  let next = query;
  if (dateFrom) next = next.gte(column, dateFrom) as Q;
  if (dateTo) next = next.lte(column, dateTo) as Q;
  return next;
}

function ticketSearchPattern(term: string): string {
  return `%${term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

export async function resolveTicketSearchCustomerIds(
  admin: AdminClient,
  search: string,
): Promise<string[]> {
  const term = search.trim();
  if (!term) return [];

  const pattern = ticketSearchPattern(term);
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},company.ilike.${pattern}`);

  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export function applyTicketSearchFilterWithCustomerIds<Q extends { or: (filters: string) => Q }>(
  query: Q,
  search: string | undefined,
  customerIds: string[],
): Q {
  const term = search?.trim();
  if (!term) return query;

  const pattern = ticketSearchPattern(term);
  const parts = [`reference_code.ilike.${pattern}`, `title.ilike.${pattern}`];
  if (customerIds.length > 0) {
    parts.push(`customer_id.in.(${customerIds.join(",")})`);
  }

  return query.or(parts.join(","));
}

export async function applyTicketSearchFilter<Q extends { or: (filters: string) => Q }>(
  query: Q,
  admin: AdminClient,
  search?: string,
): Promise<Q> {
  const term = search?.trim();
  if (!term) return query;
  const customerIds = await resolveTicketSearchCustomerIds(admin, term);
  return applyTicketSearchFilterWithCustomerIds(query, search, customerIds);
}
