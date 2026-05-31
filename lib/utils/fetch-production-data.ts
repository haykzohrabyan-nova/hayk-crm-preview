import type { createAdminClient } from "@/lib/supabase/admin";
import { excludeRefundedTickets } from "@/lib/utils/exclude-refunded-tickets";
import { countExact } from "@/lib/utils/db-counts";
import type { PaginationParams } from "@/lib/utils/pagination";
import {
  applyTicketSearchFilterWithCustomerIds,
  resolveTicketSearchCustomerIds,
  type ProductionListFilters,
} from "@/lib/utils/ticket-list-filters";

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
  customer:customers(id, first_name, last_name, company)
`.trim();

async function buildScopedProductionQuery(
  admin: AdminClient,
  filters: ProductionListFilters,
  options?: { count?: "exact"; pagination?: PaginationParams },
) {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  let query = excludeRefundedTickets(
    admin
      .from("job_tickets")
      .select(PRODUCTION_ORDER_SELECT, options?.count ? { count: "exact" } : undefined)
      .eq("ticket_status", "in_production"),
  );

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
  filters: ProductionListFilters = {},
  pagination?: PaginationParams,
) {
  const query = await buildScopedProductionQuery(
    admin,
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
  filters: ProductionListFilters = {},
) {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  const baseFilter = (q: ReturnType<ReturnType<AdminClient["from"]>["select"]>) => {
    let query = excludeRefundedTickets(q.eq("ticket_status", "in_production"));
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
