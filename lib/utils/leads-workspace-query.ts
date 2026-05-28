import type { createAdminClient } from "@/lib/supabase/admin";
import { countExact } from "@/lib/utils/db-counts";
import { applyAdminLeadUserFilter } from "@/lib/utils/admin-user-filter";
import { countLeadsWonViaSalesRoute } from "@/lib/utils/lead-sdr-won-filter";
import { countLeadsRoutedToSales } from "@/lib/utils/lead-routed-to-sales-query";
import { leadIdsRoutedToSales } from "@/lib/utils/lead-sdr-won-filter";
import { fetchRoutedToSalesLeadIds } from "@/lib/utils/lead-routed-to-sales-query";
import {
  countRoutedPipelineStages,
  matchesRoutedPipelineFilter,
  ROUTED_FILTER_OPTIONS,
  type RoutedPipelineFilter,
} from "@/lib/utils/lead-routed-pipeline-stage";
import { parseListPaginationParams, type PaginationParams } from "@/lib/utils/pagination";

type AdminClient = ReturnType<typeof createAdminClient>;

export const LEAD_WORKSPACE_LIST_SELECT =
  "id, customer_id, status, sales_status, source, urgency, interests, quantities, created_at, updated_at, locked_by_id, sales_owner_id, sdr_id, hold_reason, hold_until, held_at, rejection_reason, prev_status, customer:customers(id, first_name, last_name, company, phone, email, industry, website, authority), sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name), locked_by:user_profiles!leads_locked_by_id_fkey(id, full_name)";

const LEAD_ROUTED_LIST_SELECT =
  `${LEAD_WORKSPACE_LIST_SELECT}, tickets:job_tickets(id, reference_code, ticket_kind, ticket_status, client_confirmed, ticket_require_client_confirm, linked_lead_id, updated_at)`;

const LEAD_WON_LIST_SELECT =
  "id, customer_id, status, sales_status, source, urgency, interests, quantities, created_at, updated_at, sdr_id, rejection_reason, tickets:job_tickets(id, reference_code, ticket_kind, ticket_status)";

type LeadCustomer = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  industry?: string | null;
  website?: string | null;
  authority?: string | null;
};

type WorkspaceListLead = {
  id?: string;
  customer?: unknown;
  status?: string | null;
  sales_status?: string | null;
  source?: string | null;
  urgency?: string | null;
  created_at?: string;
  sales_owner_id?: string | null;
  tickets?: unknown;
};

function leadCustomer(lead: { customer?: unknown }): LeadCustomer | null {
  const c = lead.customer;
  if (Array.isArray(c)) return (c[0] as LeadCustomer) ?? null;
  return (c as LeadCustomer) ?? null;
}

function filterLeadsByCustomerSearch(leads: WorkspaceListLead[], search: string) {
  return leads.filter((lead) => {
    const c = leadCustomer(lead);
    return (
      c?.first_name?.toLowerCase().includes(search) ||
      c?.last_name?.toLowerCase().includes(search) ||
      c?.email?.toLowerCase().includes(search) ||
      c?.phone?.includes(search) ||
      c?.company?.toLowerCase().includes(search) ||
      lead.status?.toLowerCase().includes(search) ||
      (lead.sales_status?.toLowerCase().includes(search) ?? false)
    );
  });
}

export type LeadsWorkspaceQuery = {
  status?: string;
  search?: string;
  scope?: string;
  prevStatus?: string;
  won?: boolean;
  routed?: boolean;
  statuses?: string[];
  /** Sales pipeline tab filter when status is Routed to Sales */
  salesTab?: "pipeline" | "hold";
  /** Admin-only — filter by team member (`sdr_id` / lock holder) */
  filterUserId?: string | null;
  /** SDR All Leads tab — unclaimed + mine vs mine only */
  ownerScope?: "all" | "mine";
  /** Routed tab pipeline stage sub-filter */
  routedFilter?: RoutedPipelineFilter;
  sortField?: "created" | "urgency";
  sortDir?: "asc" | "desc";
  pagination?: PaginationParams;
};

export type LeadsWorkspaceResult = {
  rows: WorkspaceListLead[];
  total: number;
  routedSubCounts?: Record<RoutedPipelineFilter, number>;
};

const URGENCY_ORDER: Record<string, number> = { High: 1, Medium: 2, Low: 3 };

/** Exclude Won leads but keep NULL sales_status (PostgREST `neq`/`not.eq` drops NULL rows). */
function applyExcludeSalesStatusWon<T extends { or: (filter: string) => T }>(query: T): T {
  return query.or("sales_status.is.null,sales_status.neq.Won");
}

/** SDR All Leads tab — open pool (unclaimed) vs leads the SDR has claimed. */
function applySdrAllTabOwnerFilter<
  T extends { or: (filter: string) => T; eq: (col: string, val: string) => T; is: (col: string, val: null) => T },
>(query: T, userId: string, ownerScope?: "all" | "mine"): T {
  if (ownerScope === "mine") {
    return query.eq("locked_by_id", userId);
  }
  return query.is("locked_by_id", null);
}

function sortWorkspaceLeads(
  leads: WorkspaceListLead[],
  sortField: "created" | "urgency",
  sortDir: "asc" | "desc",
): WorkspaceListLead[] {
  const sorted = [...leads];
  sorted.sort((a, b) => {
    if (sortField === "urgency") {
      const ua = URGENCY_ORDER[a.urgency ?? ""] ?? 4;
      const ub = URGENCY_ORDER[b.urgency ?? ""] ?? 4;
      const primary = sortDir === "asc" ? ua - ub : ub - ua;
      if (primary !== 0) return primary;
      return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime();
    }
    const diff =
      new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime();
    return sortDir === "asc" ? diff : -diff;
  });
  return sorted;
}

function finalizeLeadsWorkspaceResult(
  leads: WorkspaceListLead[],
  query: LeadsWorkspaceQuery,
): LeadsWorkspaceResult {
  const sortField = query.sortField ?? "created";
  const sortDir = query.sortDir ?? "desc";

  let processed = leads;
  let routedSubCounts: Record<RoutedPipelineFilter, number> | undefined;

  if (query.routed) {
    routedSubCounts = countRoutedPipelineStages(processed as Parameters<typeof countRoutedPipelineStages>[0]);
    const routedFilter = query.routedFilter ?? "all";
    if (routedFilter !== "all") {
      processed = processed.filter((lead) =>
        matchesRoutedPipelineFilter(
          lead as Parameters<typeof matchesRoutedPipelineFilter>[0],
          routedFilter,
        ),
      );
    }
  }

  processed = sortWorkspaceLeads(processed, sortField, sortDir);
  const total = processed.length;

  if (query.pagination) {
    const { offset, limit } = query.pagination;
    processed = processed.slice(offset, offset + limit);
  }

  return { rows: processed, total, routedSubCounts };
}

export function parseLeadsWorkspaceQuery(searchParams: URLSearchParams): LeadsWorkspaceQuery {
  const statusesParam = searchParams.get("statuses") ?? "";
  const filterUserId = searchParams.get("user_id")?.trim() || null;
  const ownerScopeParam = searchParams.get("owner_scope");
  const ownerScope =
    ownerScopeParam === "mine" ? "mine" : ownerScopeParam === "all" ? "all" : undefined;
  const routedFilterParam = searchParams.get("routed_filter") ?? "all";
  const routedFilter = ROUTED_FILTER_OPTIONS.includes(routedFilterParam as RoutedPipelineFilter)
    ? (routedFilterParam as RoutedPipelineFilter)
    : "all";
  const sortParam = searchParams.get("sort");
  const sortField = sortParam === "urgency" ? "urgency" : "created";
  const sortDir = searchParams.get("sort_dir") === "asc" ? "asc" : "desc";
  const pagination =
    searchParams.has("limit") || searchParams.has("offset")
      ? parseListPaginationParams(searchParams)
      : undefined;

  return {
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search")?.trim().toLowerCase() ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
    prevStatus: searchParams.get("prev_status") ?? undefined,
    won: searchParams.get("won") === "true",
    routed: searchParams.get("routed") === "true",
    statuses: statusesParam ? statusesParam.split(",").map((s) => s.trim()) : undefined,
    filterUserId,
    ownerScope,
    routedFilter,
    sortField,
    sortDir,
    pagination,
  };
}

export async function fetchLeadsWorkspace(
  admin: AdminClient,
  query: LeadsWorkspaceQuery,
  userId: string,
  roleName: string,
): Promise<LeadsWorkspaceResult> {
  const search = query.search ?? "";
  const adminFilterUserId =
    roleName === "admin" && query.filterUserId ? query.filterUserId : null;
  const routedOpts = { userId, roleName, adminFilterUserId };

  if (query.routed) {
    const routedIds = await fetchRoutedToSalesLeadIds(admin, routedOpts);
    if (routedIds.length === 0) return finalizeLeadsWorkspaceResult([], query);

    const { data, error } = await admin
      .from("leads")
      .select(LEAD_ROUTED_LIST_SELECT)
      .eq("is_inbox", false)
      .in("id", routedIds)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    let leads = (data ?? []) as unknown as WorkspaceListLead[];
    if (search) leads = filterLeadsByCustomerSearch(leads, search);
    return finalizeLeadsWorkspaceResult(leads, query);
  }

  if (query.won) {
    let wonQuery = admin
      .from("leads")
      .select(LEAD_WON_LIST_SELECT)
      .eq("is_inbox", false)
      .eq("sales_status", "Won")
      .order("updated_at", { ascending: false });

    if (roleName === "admin" && adminFilterUserId) {
      wonQuery = wonQuery.eq("sdr_id", adminFilterUserId);
    } else if (roleName !== "admin" && userId) {
      wonQuery = wonQuery.eq("sdr_id", userId);
    }

    const { data, error } = await wonQuery;
    if (error) throw error;

    const wonIds = (data ?? []).map((lead) => lead.id as string);
    const routedIds = await leadIdsRoutedToSales(admin, wonIds);
    let leads = (data ?? []).filter((lead) => routedIds.has(lead.id as string));

    if (search) {
      leads = leads.filter((lead) => {
        return (
          lead.status?.toLowerCase().includes(search) ||
          lead.sales_status?.toLowerCase().includes(search) ||
          lead.source?.toLowerCase().includes(search) ||
          lead.urgency?.toLowerCase().includes(search)
        );
      });
    }
    return finalizeLeadsWorkspaceResult(leads, query);
  }

  let dbQuery = admin
    .from("leads")
    .select(LEAD_WORKSPACE_LIST_SELECT)
    .eq("is_inbox", false)
    .order("updated_at", { ascending: false });

  if (query.statuses && query.statuses.length > 0) {
    dbQuery = dbQuery.in("status", query.statuses);
    dbQuery = applyExcludeSalesStatusWon(dbQuery);
    if (roleName === "sdr" && userId) {
      dbQuery = applySdrAllTabOwnerFilter(dbQuery, userId, query.ownerScope);
    }
  } else if (query.status) {
    dbQuery = dbQuery.eq("status", query.status);
  }

  if (query.salesTab === "hold") {
    dbQuery = dbQuery.eq("sales_status", "On Hold");
  } else if (query.salesTab === "pipeline") {
    dbQuery = dbQuery.or("sales_status.eq.Ongoing,sales_status.eq.Quote Sent,sales_status.is.null");
  }

  if (query.prevStatus) {
    dbQuery = dbQuery.eq("prev_status", query.prevStatus);
  }

  if (query.scope === "mine" && userId && roleName !== "admin") {
    dbQuery = dbQuery.eq("sdr_id", userId);
  }

  if (adminFilterUserId) {
    const isAllTab =
      Boolean(query.statuses?.length) && !query.status && !query.routed && !query.won;
    dbQuery = applyAdminLeadUserFilter(
      dbQuery,
      roleName,
      adminFilterUserId,
      isAllTab ? "all_tab" : "sdr_id",
    );
  }

  if (roleName === "sales" && userId) {
    dbQuery = dbQuery.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
  }

  if (roleName === "sdr" && userId && !query.status && !(query.statuses && query.statuses.length > 0)) {
    dbQuery = dbQuery.is("locked_by_id", null);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;

  let leads = (data ?? []) as unknown as WorkspaceListLead[];
  if (search) leads = filterLeadsByCustomerSearch(leads, search);
  return finalizeLeadsWorkspaceResult(leads, query);
}

export async function fetchLeadsWorkspaceTabCounts(
  admin: AdminClient,
  userId: string,
  roleName: string,
  filterUserId?: string | null,
) {
  const adminFilterUserId = roleName === "admin" && filterUserId ? filterUserId : null;
  const routedOpts = { userId, roleName, adminFilterUserId };

  const [all, hold, routed, rejected, won] = await Promise.all([
    countExact(admin, "leads", (q) => {
      let query = q
        .eq("is_inbox", false)
        .in("status", ["Pending", "Validated"]);
      query = applyExcludeSalesStatusWon(query);
      if (roleName === "sdr" && userId) {
        query = query.is("locked_by_id", null);
      }
      if (adminFilterUserId) {
        query = applyAdminLeadUserFilter(query, roleName, adminFilterUserId, "all_tab");
      }
      return query;
    }),
    countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).eq("status", "On Hold");
      if (roleName !== "admin" && userId) {
        query = query.eq("sdr_id", userId);
      }
      if (adminFilterUserId) {
        query = applyAdminLeadUserFilter(query, roleName, adminFilterUserId, "sdr_id");
      }
      return query;
    }),
    countLeadsRoutedToSales(admin, routedOpts),
    countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).eq("status", "Rejected");
      if (roleName !== "admin" && userId) {
        query = query.eq("sdr_id", userId);
      }
      if (adminFilterUserId) {
        query = applyAdminLeadUserFilter(query, roleName, adminFilterUserId, "sdr_id");
      }
      return query;
    }),
    countLeadsWonViaSalesRoute(admin, routedOpts),
  ]);

  return { all, hold, routed, rejected, won };
}

export async function fetchLeadsSalesTabCounts(
  admin: AdminClient,
  userId: string,
  roleName: string,
) {
  function routedCount(
    configure: (
      q: ReturnType<ReturnType<AdminClient["from"]>["select"]>,
    ) => ReturnType<ReturnType<AdminClient["from"]>["select"]>,
  ) {
    return countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).eq("status", "Routed to Sales");
      if (roleName === "sales" && userId) {
        query = query.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
      }
      return configure(query);
    });
  }

  const [pipeline, hold, rejected] = await Promise.all([
    routedCount((q) =>
      q.or("sales_status.eq.Ongoing,sales_status.eq.Quote Sent,sales_status.is.null"),
    ),
    routedCount((q) => q.eq("sales_status", "On Hold")),
    countExact(admin, "leads", (q) =>
      q
        .eq("is_inbox", false)
        .eq("status", "Rejected")
        .eq("prev_status", "Routed to Sales"),
    ),
  ]);

  return { pipeline, hold, rejected };
}
