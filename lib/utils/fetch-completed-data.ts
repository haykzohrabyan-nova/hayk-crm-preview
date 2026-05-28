import type { createAdminClient } from "@/lib/supabase/admin";
import {
  countExact,
  scopeCompletedTicketsQuery,
  scopedCompletedTicketCount,
  type TicketSelectQuery,
} from "@/lib/utils/db-counts";
import type { PaginationParams } from "@/lib/utils/pagination";
import {
  applyTicketDateFilter,
  applyTicketSearchFilterWithCustomerIds,
  resolveTicketSearchCustomerIds,
  type CompletedListFilters,
} from "@/lib/utils/ticket-list-filters";

type AdminClient = ReturnType<typeof createAdminClient>;

const COMPLETED_ORDER_SELECT = `
  id, reference_code, title,
  ticket_status,
  payment_status,
  quote_final_total,
  payment_amount_received,
  ticket_payment_strategy,
  priority, due_date, rush,
  updated_at, created_at,
  created_by_id,
  customer:customers(id, first_name, last_name, company)
`.trim();

async function buildScopedCompletedQuery(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: CompletedListFilters,
  options?: { count?: "exact"; pagination?: PaginationParams },
): Promise<TicketSelectQuery> {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  let query = scopeCompletedTicketsQuery(
    admin
      .from("job_tickets")
      .select(COMPLETED_ORDER_SELECT, options?.count ? { count: "exact" } : undefined) as TicketSelectQuery,
    roleName,
    userId,
    filters.adminFilterUserId ?? null,
  );

  query = query.eq("ticket_status", "completed") as TicketSelectQuery;
  query = applyTicketDateFilter(query, filters.dateFrom, filters.dateTo, "updated_at") as TicketSelectQuery;
  query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds) as TicketSelectQuery;

  query = query.order("updated_at", { ascending: false }) as TicketSelectQuery;

  if (options?.pagination) {
    const { offset, limit } = options.pagination;
    query = query.range(offset, offset + limit - 1) as TicketSelectQuery;
  }

  return query;
}

async function enrichCompletedRows(
  admin: AdminClient,
  rows: Array<Record<string, unknown> & { created_by_id?: string | null }>,
) {
  const creatorIds = [...new Set(rows.map((r) => r.created_by_id).filter(Boolean))] as string[];
  const { data: profiles } = creatorIds.length
    ? await admin.from("user_profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((row) => ({
    ...row,
    created_by: row.created_by_id
      ? { id: row.created_by_id, full_name: nameMap[row.created_by_id] ?? null }
      : null,
  }));
}

export async function fetchCompletedOrders(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: CompletedListFilters = {},
  pagination?: PaginationParams,
) {
  const query = await buildScopedCompletedQuery(
    admin,
    roleName,
    userId,
    filters,
    pagination ? { count: "exact", pagination } : undefined,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = await enrichCompletedRows(admin, (data ?? []) as Array<Record<string, unknown> & { created_by_id?: string | null }>);
  const total = pagination ? (count ?? rows.length) : rows.length;

  return { rows, total };
}

export async function fetchCompletedTabCounts(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: CompletedListFilters = {},
) {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  const countFiltered = () =>
    countExact(admin, "job_tickets", (q) => {
      let query = scopeCompletedTicketsQuery(q, roleName, userId, filters.adminFilterUserId ?? null);
      query = query.eq("ticket_status", "completed");
      query = applyTicketDateFilter(query, filters.dateFrom, filters.dateTo, "updated_at");
      query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds);
      return query;
    });

  if (roleName === "admin" && !filters.adminFilterUserId && !filters.search && !filters.dateFrom && !filters.dateTo) {
    const completed = await countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "completed"));
    return { completed };
  }

  const completed = await countFiltered();
  return { completed };
}
