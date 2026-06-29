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
  "id, customer_id, status, sales_status, source, urgency, interests, quantities, created_at, updated_at, locked_by_id, sales_owner_id, sdr_id, hold_reason, hold_until, held_at, follow_up_reason, follow_up_until, follow_up_at, rejection_reason, prev_status, created_by_id, is_system_created, customer:customers(id, first_name, last_name, company, phone, email, industry, website, authority), sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name), locked_by:user_profiles!leads_locked_by_id_fkey(id, full_name), created_by:user_profiles!leads_created_by_id_fkey(id, full_name)";

const LEAD_ROUTED_LIST_SELECT =
  `${LEAD_WORKSPACE_LIST_SELECT}, tickets:job_tickets(id, reference_code, ticket_kind, ticket_status, client_confirmed, ticket_require_client_confirm, linked_lead_id, updated_at)`;

const LEAD_WON_LIST_SELECT =
  "id, customer_id, status, sales_status, source, urgency, interests, quantities, created_at, updated_at, sdr_id, rejection_reason, created_by_id, is_system_created, created_by:user_profiles!leads_created_by_id_fkey(id, full_name), tickets:job_tickets(id, reference_code, ticket_kind, ticket_status)";

/** Minimal columns needed only for urgency sort — avoids fat JOIN for the full dataset. */
const LEAD_SORT_ONLY_SELECT =
  "id, urgency, created_at";

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

export type LeadsWorkspaceQuery = {
  status?: string;
  search?: string;
  scope?: string;
  prevStatus?: string;
  won?: boolean;
  routed?: boolean;
  statuses?: string[];
  /** Sales pipeline tab filter when status is Routed to Sales */
  salesTab?: "pipeline" | "hold" | "follow_up";
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

function sortLeadsByUrgency(
  leads: { id?: string; urgency?: string | null; created_at?: string }[],
  sortDir: "asc" | "desc",
): typeof leads {
  return [...leads].sort((a, b) => {
    const ua = URGENCY_ORDER[a.urgency ?? ""] ?? 4;
    const ub = URGENCY_ORDER[b.urgency ?? ""] ?? 4;
    const primary = sortDir === "asc" ? ua - ub : ub - ua;
    if (primary !== 0) return primary;
    return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime();
  });
}

/** Resolve customer IDs matching a search term — used for DB-level lead search.
 *  Splits multi-word terms so "John Smith" matches first_name=John + last_name=Smith. */
async function resolveLeadSearchCustomerIds(admin: AdminClient, search: string): Promise<string[]> {
  const words = search.trim().split(/\s+/).filter(Boolean);
  let q = admin.from("customers").select("id");
  for (const word of words) {
    const escaped = word.replace(/[%_\\]/g, (c) => `\\${c}`);
    const pattern = `%${escaped}%`;
    q = (q as any).or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},company.ilike.${pattern}`,
    );
  }
  const { data } = await q;
  return (data ?? []).map((r) => r.id as string);
}

/** Apply DB-level search to a lead query (status fields + customer_id IN resolved IDs). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLeadSearchFilter(query: any, search: string, customerIds: string[]): any {
  const q = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const parts: string[] = [`status.ilike.${q}`, `sales_status.ilike.${q}`];
  if (customerIds.length > 0) {
    parts.push(`customer_id.in.(${customerIds.join(",")})`);
  }
  return query.or(parts.join(","));
}

/** Apply all non-search DB filters for the standard (non-routed, non-won) leads path. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyStandardLeadFilters(query: any, q: LeadsWorkspaceQuery, userId: string, roleName: string, adminFilterUserId: string | null): any {
  if (q.statuses && q.statuses.length > 0) {
    query = query.in("status", q.statuses);
    query = applyExcludeSalesStatusWon(query);
    if (roleName === "sdr" && userId) {
      query = applySdrAllTabOwnerFilter(query, userId, q.ownerScope);
    }
  } else if (q.status) {
    query = query.eq("status", q.status);
  }

  if (q.salesTab === "hold") {
    query = query.eq("sales_status", "On Hold");
  } else if (q.salesTab === "follow_up") {
    query = query.eq("sales_status", "Follow Up Later");
  } else if (q.salesTab === "pipeline") {
    query = query.or("sales_status.eq.Ongoing,sales_status.eq.Quote Sent,sales_status.is.null");
  }

  if (q.prevStatus) {
    query = query.eq("prev_status", q.prevStatus);
  }

  if (q.scope === "mine" && userId && roleName !== "admin") {
    query = query.eq("sdr_id", userId);
  }

  if (adminFilterUserId) {
    const isAllTab = Boolean(q.statuses?.length) && !q.status && !q.routed && !q.won;
    query = applyAdminLeadUserFilter(
      query,
      roleName,
      adminFilterUserId,
      isAllTab ? "all_tab" : "sdr_id",
    );
  }

  if (roleName === "sales" && userId) {
    if (q.salesTab === "follow_up") {
      query = query.eq("sales_owner_id", userId);
    } else if (q.status === "Routed to Sales") {
      query = query.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
    }
  }

  if (roleName === "sdr" && userId && !q.status && !(q.statuses && q.statuses.length > 0)) {
    query = query.is("locked_by_id", null);
  }

  return query;
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
  const sortField = query.sortField ?? "created";
  const sortDir = query.sortDir ?? "desc";

  // ── Routed tab ────────────────────────────────────────────────────────────────
  // Needs ALL routed lead rows to compute pipeline sub-filter stage counts.
  if (query.routed) {
    const routedIds = await fetchRoutedToSalesLeadIds(admin, routedOpts);
    if (routedIds.length === 0) return { rows: [], total: 0 };

    const { data, error } = await admin
      .from("leads")
      .select(LEAD_ROUTED_LIST_SELECT)
      .eq("is_inbox", false)
      .in("id", routedIds)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    let leads = (data ?? []) as unknown as WorkspaceListLead[];
    if (search) leads = leads.filter((lead) => {
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

    const routedSubCounts = countRoutedPipelineStages(leads as Parameters<typeof countRoutedPipelineStages>[0]);
    const routedFilter = query.routedFilter ?? "all";
    if (routedFilter !== "all") {
      leads = leads.filter((lead) =>
        matchesRoutedPipelineFilter(lead as Parameters<typeof matchesRoutedPipelineFilter>[0], routedFilter),
      );
    }

    leads = leads.sort((a, b) => {
      if (sortField === "urgency") {
        const ua = URGENCY_ORDER[a.urgency ?? ""] ?? 4;
        const ub = URGENCY_ORDER[b.urgency ?? ""] ?? 4;
        const primary = sortDir === "asc" ? ua - ub : ub - ua;
        if (primary !== 0) return primary;
        return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime();
      }
      const diff = new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime();
      return sortDir === "asc" ? diff : -diff;
    });

    const total = leads.length;
    const page = query.pagination
      ? leads.slice(query.pagination.offset, query.pagination.offset + query.pagination.limit)
      : leads;
    return { rows: page, total, routedSubCounts };
  }

  // ── Won tab ───────────────────────────────────────────────────────────────────
  // Needs routedIds cross-check — in-memory filter unavoidable.
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

    const sorted = leads.sort((a, b) => {
      if (sortField === "urgency") {
        const ua = URGENCY_ORDER[(a as WorkspaceListLead).urgency ?? ""] ?? 4;
        const ub = URGENCY_ORDER[(b as WorkspaceListLead).urgency ?? ""] ?? 4;
        const primary = sortDir === "asc" ? ua - ub : ub - ua;
        if (primary !== 0) return primary;
        return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime();
      }
      const diff = new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime();
      return sortDir === "asc" ? diff : -diff;
    });

    const total = sorted.length;
    const page = query.pagination
      ? sorted.slice(query.pagination.offset, query.pagination.offset + query.pagination.limit)
      : sorted;
    return { rows: page as WorkspaceListLead[], total };
  }

  // ── Standard path (all other tabs) ───────────────────────────────────────────

  // Pre-resolve customer IDs for search once, reuse across all queries.
  const customerIds = search ? await resolveLeadSearchCustomerIds(admin, search) : [];

  // ── "created" sort: full DB-level pagination ──────────────────────────────────
  if (sortField === "created") {
    let dbQuery = applyStandardLeadFilters(
      admin
        .from("leads")
        .select(LEAD_WORKSPACE_LIST_SELECT, { count: "exact" })
        .eq("is_inbox", false),
      query,
      userId,
      roleName,
      adminFilterUserId,
    );

    if (search) {
      dbQuery = applyLeadSearchFilter(dbQuery, search, customerIds);
    }

    dbQuery = dbQuery.order("updated_at", { ascending: sortDir === "asc" });

    if (query.pagination) {
      dbQuery = dbQuery.range(
        query.pagination.offset,
        query.pagination.offset + query.pagination.limit - 1,
      );
    }

    const { data, count, error } = await dbQuery;
    if (error) throw error;

    return {
      rows: (data ?? []) as unknown as WorkspaceListLead[],
      total: count ?? (data ?? []).length,
    };
  }

  // ── "urgency" sort: two-pass — sort IDs in memory, full select for page only ──
  // Pass 1: fetch only id + urgency + created_at for ALL matching leads (tiny payload).
  let sortPassQuery = applyStandardLeadFilters(
    admin
      .from("leads")
      .select(LEAD_SORT_ONLY_SELECT)
      .eq("is_inbox", false),
    query,
    userId,
    roleName,
    adminFilterUserId,
  );

  if (search) {
    sortPassQuery = applyLeadSearchFilter(sortPassQuery, search, customerIds);
  }

  const { data: sortRows, error: sortErr } = await sortPassQuery.order("updated_at", { ascending: false });
  if (sortErr) throw sortErr;

  const sorted = sortLeadsByUrgency(
    (sortRows ?? []) as { id: string; urgency: string | null; created_at: string }[],
    sortDir,
  );
  const total = sorted.length;

  if (!query.pagination || total === 0) {
    // No pagination — still need to fetch full rows
    if (total === 0) return { rows: [], total: 0 };
    const ids = sorted.map((r) => (r as { id: string }).id);
    const { data: fullRows, error: fullErr } = await admin
      .from("leads")
      .select(LEAD_WORKSPACE_LIST_SELECT)
      .in("id", ids);
    if (fullErr) throw fullErr;
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    const reordered = ((fullRows ?? []) as WorkspaceListLead[]).sort(
      (a, b) => (orderMap.get(a.id!) ?? 0) - (orderMap.get(b.id!) ?? 0),
    );
    return { rows: reordered, total };
  }

  // Pass 2: fetch full rows for just this page's IDs.
  const pageSlice = sorted.slice(query.pagination.offset, query.pagination.offset + query.pagination.limit);
  const pageIds = pageSlice.map((r) => (r as { id: string }).id);

  if (pageIds.length === 0) return { rows: [], total };

  const { data: fullRows, error: fullErr } = await admin
    .from("leads")
    .select(LEAD_WORKSPACE_LIST_SELECT)
    .in("id", pageIds);
  if (fullErr) throw fullErr;

  const orderMap = new Map(pageIds.map((id, i) => [id, i]));
  const reordered = ((fullRows ?? []) as WorkspaceListLead[]).sort(
    (a, b) => (orderMap.get(a.id!) ?? 0) - (orderMap.get(b.id!) ?? 0),
  );

  return { rows: reordered, total };
}

export async function fetchLeadsWorkspaceTabCounts(
  admin: AdminClient,
  userId: string,
  roleName: string,
  filterUserId?: string | null,
) {
  const adminFilterUserId = roleName === "admin" && filterUserId ? filterUserId : null;
  const routedOpts = { userId, roleName, adminFilterUserId };

  const [all, in_progress, follow_up, hold, routed, rejected, won] = await Promise.all([
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
      let query = q.eq("is_inbox", false).eq("status", "In Progress");
      if (roleName !== "admin" && userId) {
        query = query.eq("sdr_id", userId);
      }
      if (adminFilterUserId) {
        query = applyAdminLeadUserFilter(query, roleName, adminFilterUserId, "sdr_id");
      }
      return query;
    }),
    countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).eq("status", "Follow Up Later");
      if (roleName !== "admin" && userId) {
        query = query.eq("sdr_id", userId);
      }
      if (adminFilterUserId) {
        query = applyAdminLeadUserFilter(query, roleName, adminFilterUserId, "sdr_id");
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

  return { all, in_progress, follow_up, hold, routed, rejected, won };
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

  function followUpCount() {
    return countExact(admin, "leads", (q) => {
      let query = q
        .eq("is_inbox", false)
        .eq("status", "Routed to Sales")
        .eq("sales_status", "Follow Up Later");
      if (roleName === "sales" && userId) {
        query = query.eq("sales_owner_id", userId);
      }
      return query;
    });
  }

  const [pipeline, follow_up, hold, rejected] = await Promise.all([
    routedCount((q) =>
      q.or("sales_status.eq.Ongoing,sales_status.eq.Quote Sent,sales_status.is.null"),
    ),
    followUpCount(),
    routedCount((q) => q.eq("sales_status", "On Hold")),
    countExact(admin, "leads", (q) =>
      q
        .eq("is_inbox", false)
        .eq("status", "Rejected")
        .eq("prev_status", "Routed to Sales"),
    ),
  ]);

  return { pipeline, follow_up, hold, rejected };
}
