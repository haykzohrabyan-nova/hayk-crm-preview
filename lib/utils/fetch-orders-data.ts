import type { createAdminClient } from "@/lib/supabase/admin";
import { excludeRefundedTicketsForOrdersList } from "@/lib/utils/exclude-refunded-tickets";
import { orderListStatus } from "@/lib/utils/order-list-status";
import {
  countExact,
  scopeJobTicketsQuery,
  type TicketSelectQuery,
} from "@/lib/utils/db-counts";
import type { PaginationParams } from "@/lib/utils/pagination";
import {
  applyTicketDateFilter,
  applyTicketSearchFilterWithCustomerIds,
  resolveTicketSearchCustomerIds,
  tabToTicketStatuses,
  type TicketListFilters,
} from "@/lib/utils/ticket-list-filters";
import { sortOrdersRows } from "@/lib/utils/orders-list-sort";
import { jobTicketCustomerEmbed } from "@/lib/utils/ticket-list-select";

type AdminClient = ReturnType<typeof createAdminClient>;

const CUSTOMER_CONFIRM_VIAS = new Set(["public_confirm", "public_payment", "public_link"]);

const ORDERS_LIST_SELECT = `
  id, ticket_kind, ticket_status, client_confirmed,
  ticket_require_client_confirm,
  payment_status,
  refund_status,
  payment_evidence_url,
  payment_evidence_submitted_at,
  payment_evidence_reviewed_at,
  stripe_payment_intent_id,
  stripe_amount_cents,
  payment_evidence_amount,
  ticket_payment_strategy,
  ticket_deposit_type,
  ticket_deposit_value,
  payment_paid_at,
  deposit_paid_at,
  deposit_amount,
  payment_amount_received,
  tax_exempt,
  sales_permit_storage_path,
  sales_permit_reviewed_at,
  title, reference_code, quote_final_total,
  priority, due_date, rush, created_at, production_released_at,
  created_by_id,
  ${jobTicketCustomerEmbed("id, first_name, last_name, company")}
`.trim();

type RawOrderRow = Record<string, unknown> & {
  id: string;
  ticket_status: string;
  client_confirmed?: boolean | null;
  ticket_require_client_confirm?: boolean | null;
  payment_evidence_url?: string | null;
  payment_evidence_submitted_at?: string | null;
  payment_evidence_reviewed_at?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_amount_cents?: number | null;
  payment_evidence_amount?: number | null;
  ticket_payment_strategy?: "partial" | "full" | "net" | null;
  ticket_deposit_type?: "percent" | "fixed" | null;
  ticket_deposit_value?: number | null;
  payment_paid_at?: string | null;
  created_by_id?: string | null;
  deposit_paid_at?: string | null;
  deposit_amount?: number | null;
  payment_amount_received?: number | null;
};

async function buildScopedOrdersQuery(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: TicketListFilters,
  select: string,
  options?: { count?: "exact"; pagination?: PaginationParams; skipDefaultOrder?: boolean },
): Promise<TicketSelectQuery> {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  let query = scopeJobTicketsQuery(
    admin.from("job_tickets").select(select, options?.count ? { count: "exact" } : undefined) as TicketSelectQuery,
    roleName,
    userId,
    filters.adminFilterUserId ?? null,
  );

  query = query.eq("ticket_kind", "order") as TicketSelectQuery;
  query = query.in("ticket_status", tabToTicketStatuses(filters.tab)) as TicketSelectQuery;
  query = excludeRefundedTicketsForOrdersList(query, filters.tab) as TicketSelectQuery;
  query = applyTicketDateFilter(query, filters.dateFrom, filters.dateTo) as TicketSelectQuery;
  query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds) as TicketSelectQuery;

  if (!options?.skipDefaultOrder) {
    query = query
      .order("production_released_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }) as TicketSelectQuery;
  }

  if (options?.pagination) {
    const { offset, limit } = options.pagination;
    query = query.range(offset, offset + limit - 1) as TicketSelectQuery;
  }

  return query;
}

async function countFilteredOrdersByStatus(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: TicketListFilters,
  status: "order" | "in_production" | "cancelled",
  searchCustomerIds: string[],
): Promise<number> {
  return countExact(admin, "job_tickets", (q) => {
    let query = scopeJobTicketsQuery(q, roleName, userId, filters.adminFilterUserId ?? null);
    query = query.eq("ticket_kind", "order").eq("ticket_status", status);
    if (status !== "cancelled") {
      query = excludeRefundedTicketsForOrdersList(query, status === "order" ? "pending" : "in_production");
    }
    query = applyTicketDateFilter(query, filters.dateFrom, filters.dateTo);
    query = applyTicketSearchFilterWithCustomerIds(query, filters.search, searchCustomerIds);
    return query;
  });
}

async function enrichOrdersPage(admin: AdminClient, orders: RawOrderRow[]) {
  const orderRowIds = orders.filter((o) => o.ticket_status === "order").map((o) => o.id);

  const customerConfirmedByTicket = new Set<string>();
  const converterByTicket = new Map<string, string>();

  if (orderRowIds.length > 0) {
    const { data: activities } = await admin
      .from("activities")
      .select("ticket_id, type, by_user_id, payload")
      .in("ticket_id", orderRowIds)
      .in("type", ["ticket_converted", "ticket_client_confirmed", "order_ticket_status_changed"])
      .order("created_at", { ascending: true });

    for (const row of activities ?? []) {
      const ticketId = row.ticket_id as string | null;
      if (!ticketId) continue;

      if (row.type === "ticket_client_confirmed") {
        customerConfirmedByTicket.add(ticketId);
        continue;
      }

      if (row.type === "order_ticket_status_changed") {
        const via = (row.payload as { via?: string } | null)?.via;
        if (via && CUSTOMER_CONFIRM_VIAS.has(via)) {
          customerConfirmedByTicket.add(ticketId);
        }
        continue;
      }

      if (row.type === "ticket_converted" && row.by_user_id && !converterByTicket.has(ticketId)) {
        converterByTicket.set(ticketId, row.by_user_id);
      }
    }
  }

  const converterIds = [...new Set(converterByTicket.values())];
  const creatorIds = [
    ...new Set(
      orders
        .map((o) => o.created_by_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const profileIds = [...new Set([...converterIds, ...creatorIds])];
  const { data: profiles } = profileIds.length
    ? await admin.from("user_profiles").select("id, full_name, roles(name)").in("id", profileIds)
    : { data: [] as { id: string; full_name: string | null; roles: { name: string } | null }[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return orders.map((o) => {
    const confirmedByCustomer =
      o.ticket_status === "order" &&
      (!!o.client_confirmed || customerConfirmedByTicket.has(o.id));

    const uid = o.ticket_status === "order" ? converterByTicket.get(o.id) : undefined;
    const converterProfile = uid ? profileById.get(uid) : undefined;
    const convertedByName = converterProfile?.full_name ?? null;
    const roleRaw = converterProfile?.roles as { name?: string } | { name?: string }[] | null;
    const converterRole = Array.isArray(roleRaw) ? roleRaw[0]?.name : roleRaw?.name;
    const convertedByAdmin = converterRole === "admin";

    const { label, tone } = orderListStatus({
      ticket_status: o.ticket_status,
      client_confirmed: o.client_confirmed,
      confirmed_by_customer: confirmedByCustomer,
      converted_by_name: convertedByName,
      converted_by_admin: convertedByAdmin,
      require_client_confirm: o.ticket_require_client_confirm,
      payment_evidence_url: o.payment_evidence_url,
      payment_evidence_submitted_at: o.payment_evidence_submitted_at,
      payment_evidence_reviewed_at: o.payment_evidence_reviewed_at,
      stripe_payment_intent_id: o.stripe_payment_intent_id,
      payment_paid_at: o.payment_paid_at,
      deposit_paid_at: o.deposit_paid_at,
      payment_amount_received: o.payment_amount_received,
      deposit_amount: o.deposit_amount,
    });

    return {
      ...o,
      status_label: label,
      status_tone: tone,
      created_by: o.created_by_id
        ? {
            id: o.created_by_id,
            full_name: profileById.get(o.created_by_id)?.full_name ?? null,
          }
        : null,
    };
  });
}

export async function fetchOrdersList(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: TicketListFilters = {},
  pagination?: PaginationParams,
) {
  const useCustomSort = filters.sort && filters.sort !== "default";

  if (useCustomSort) {
    const query = await buildScopedOrdersQuery(
      admin,
      roleName,
      userId,
      filters,
      ORDERS_LIST_SELECT,
      { skipDefaultOrder: true },
    );

    const { data, error } = await query;
    if (error) throw error;

    let orders = (data ?? []) as RawOrderRow[];

    let creatorNameById: Map<string, string> | undefined;
    if (filters.sort === "created_by") {
      const creatorIds = [
        ...new Set(
          orders
            .map((o) => o.created_by_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (creatorIds.length > 0) {
        const { data: profiles } = await admin
          .from("user_profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        creatorNameById = new Map(
          (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? ""]),
        );
      }
    }

    orders = sortOrdersRows(orders, filters.sort!, { creatorNameById });

    const total = orders.length;
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? total;
    const pageSlice = pagination ? orders.slice(offset, offset + limit) : orders;
    const rows = await enrichOrdersPage(admin, pageSlice);

    return { rows, total };
  }

  const query = await buildScopedOrdersQuery(
    admin,
    roleName,
    userId,
    filters,
    ORDERS_LIST_SELECT,
    pagination ? { count: "exact", pagination } : undefined,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  const orders = (data ?? []) as RawOrderRow[];
  const rows = await enrichOrdersPage(admin, orders);
  const total = pagination ? (count ?? rows.length) : rows.length;

  return { rows, total };
}

export async function fetchOrdersTabCounts(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: TicketListFilters = {},
) {
  const searchCustomerIds = filters.search?.trim()
    ? await resolveTicketSearchCustomerIds(admin, filters.search)
    : [];

  const [pending, inProduction, cancelled] = await Promise.all([
    countFilteredOrdersByStatus(admin, roleName, userId, filters, "order", searchCustomerIds),
    countFilteredOrdersByStatus(admin, roleName, userId, filters, "in_production", searchCustomerIds),
    countFilteredOrdersByStatus(admin, roleName, userId, filters, "cancelled", searchCustomerIds),
  ]);

  return {
    all: pending + inProduction + cancelled,
    pending,
    in_production: inProduction,
    cancelled,
  };
}

/** Dedicated orders page counts route — avoids computing unused ticket buckets. */
export async function fetchOrdersCountsOnly(
  admin: AdminClient,
  roleName: string,
  userId: string,
  filters: TicketListFilters = {},
) {
  const counts = await fetchOrdersTabCounts(admin, roleName, userId, filters);
  return { counts };
}

export async function fetchGlobalRoutedCount(admin: AdminClient) {
  return countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "routed"));
}
