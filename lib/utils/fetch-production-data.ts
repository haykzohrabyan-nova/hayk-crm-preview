import type { createAdminClient } from "@/lib/supabase/admin";
import { excludeRefundedTickets } from "@/lib/utils/exclude-refunded-tickets";
import { countExact, scopeJobTicketsQuery, type TicketSelectQuery } from "@/lib/utils/db-counts";
import type { PaginationParams } from "@/lib/utils/pagination";
import {
  applyTicketSearchFilterWithCustomerIds,
  resolveTicketSearchCustomerIds,
  type ProductionListFilters,
} from "@/lib/utils/ticket-list-filters";
import { jobTicketCustomerEmbed } from "@/lib/utils/ticket-list-select";

type AdminClient = ReturnType<typeof createAdminClient>;

const PRODUCTION_ORDER_SELECT = `
  id, reference_code, title,
  ticket_status,
  payment_status,
  quote_final_total,
  payment_amount_received,
  ticket_payment_strategy,
  ticket_net_terms_label,
  priority, due_date, rush,
  production_released_at,
  created_at,
  ${jobTicketCustomerEmbed("id, first_name, last_name, company")}
`.trim();

async function buildScopedProductionQuery(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: ProductionListFilters,
  options?: { count?: "exact"; pagination?: PaginationParams },
) {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  let query = scopeJobTicketsQuery(
    admin
      .from("job_tickets")
      .select(PRODUCTION_ORDER_SELECT, options?.count ? { count: "exact" } : undefined) as TicketSelectQuery,
    roleName,
    userId,
  );

  query = query.eq("ticket_status", "in_production") as TicketSelectQuery;
  query = excludeRefundedTickets(query) as TicketSelectQuery;

  if (filters.tab === "balance_due") {
    query = query.neq("payment_status", "paid").neq("ticket_payment_strategy", "net");
  }

  query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds);

  query = query.order("production_released_at", { ascending: false });

  if (options?.pagination) {
    const { offset, limit } = options.pagination;
    query = query.range(offset, offset + limit - 1);
  }

  return query;
}

export async function fetchProductionOrders(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: ProductionListFilters = {},
  pagination?: PaginationParams,
) {
  const query = await buildScopedProductionQuery(
    admin,
    roleName,
    userId,
    filters,
    pagination ? { count: "exact", pagination } : undefined,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const total = pagination ? (count ?? rows.length) : rows.length;

  return { rows, total };
}

export async function fetchProductionTabCounts(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: ProductionListFilters = {},
) {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  const baseFilter = (q: ReturnType<ReturnType<AdminClient["from"]>["select"]>) => {
    let query = scopeJobTicketsQuery(q, roleName, userId).eq("ticket_status", "in_production");
    query = excludeRefundedTickets(query);
    query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds);
    return query;
  };

  const [all, balance_due] = await Promise.all([
    countExact(admin, "job_tickets", baseFilter),
    countExact(admin, "job_tickets", (q) =>
      baseFilter(q).neq("payment_status", "paid").neq("ticket_payment_strategy", "net"),
    ),
  ]);

  return { all, balance_due };
}
