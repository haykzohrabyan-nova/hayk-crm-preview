import type { createAdminClient } from "@/lib/supabase/admin";
import type { PaginationParams } from "@/lib/utils/pagination";

type AdminClient = ReturnType<typeof createAdminClient>;

export const CUSTOMER_LIST_SELECT =
  "id, first_name, last_name, email, phone, company, industry, heat_tag, created_at, updated_at";

type LeadAggRow = {
  customer_id: string;
  status: string;
  sales_status: string | null;
  updated_at: string;
};

type TicketAggRow = {
  customer_id: string;
  created_at: string;
};

export type CrmCustomerStatus = "new" | "known";

export type CrmListFilters = {
  search?: string;
  status?: "all" | CrmCustomerStatus;
  heat?: "all" | "hot" | "warm" | "cold";
};

export type CrmCustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  heat_tag: string | null;
  created_at: string;
  updated_at: string;
  lead_count: number;
  ticket_count: number;
  last_activity: string;
  customer_status: CrmCustomerStatus;
};

function leadQualifiesForCrm(l: LeadAggRow): boolean {
  return l.sales_status != null || l.status === "Routed to Sales";
}

function defaultCustomerAgg(updatedAt: string) {
  return {
    lead_count: 0,
    ticket_count: 0,
    last_activity: updatedAt,
    qualifies: true,
  };
}

function matchesSearch(c: CrmCustomerRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    c.first_name?.toLowerCase().includes(q) ||
    c.last_name?.toLowerCase().includes(q) ||
    c.email?.toLowerCase().includes(q) ||
    (c.phone?.includes(q) ?? false) ||
    c.company?.toLowerCase().includes(q) ||
    false
  );
}

function applyCrmListFilters(rows: CrmCustomerRow[], filters: CrmListFilters): CrmCustomerRow[] {
  return rows.filter((c) => {
    if (!matchesSearch(c, filters.search ?? "")) return false;
    if (filters.status && filters.status !== "all" && c.customer_status !== filters.status) return false;
    if (filters.heat && filters.heat !== "all" && c.heat_tag !== filters.heat) return false;
    return true;
  });
}

async function buildEnrichedCustomerList(admin: AdminClient): Promise<CrmCustomerRow[]> {
  const [{ data: leadRows, error: leadErr }, { data: ticketRows, error: ticketErr }, { data: customers, error: customerErr }] =
    await Promise.all([
      admin.from("leads").select("customer_id, status, sales_status, updated_at").not("customer_id", "is", null),
      admin.from("job_tickets").select("customer_id, created_at").not("customer_id", "is", null),
      admin.from("customers").select(CUSTOMER_LIST_SELECT).order("updated_at", { ascending: false }),
    ]);

  if (leadErr || ticketErr || customerErr) {
    throw new Error(leadErr?.message ?? ticketErr?.message ?? customerErr?.message ?? "DB error");
  }

  const aggByCustomer = new Map<
    string,
    { lead_count: number; ticket_count: number; last_activity: string; qualifies: boolean }
  >();

  for (const row of (leadRows ?? []) as LeadAggRow[]) {
    const id = row.customer_id;
    const cur = aggByCustomer.get(id) ?? {
      lead_count: 0,
      ticket_count: 0,
      last_activity: row.updated_at,
      qualifies: false,
    };
    cur.lead_count += 1;
    if (row.updated_at > cur.last_activity) cur.last_activity = row.updated_at;
    if (leadQualifiesForCrm(row)) cur.qualifies = true;
    aggByCustomer.set(id, cur);
  }

  for (const row of (ticketRows ?? []) as TicketAggRow[]) {
    const id = row.customer_id;
    const cur = aggByCustomer.get(id) ?? {
      lead_count: 0,
      ticket_count: 0,
      last_activity: row.created_at,
      qualifies: false,
    };
    cur.ticket_count += 1;
    if (row.created_at > cur.last_activity) cur.last_activity = row.created_at;
    cur.qualifies = true;
    aggByCustomer.set(id, cur);
  }

  return (customers ?? [])
    .filter((c) => {
      const agg = aggByCustomer.get(c.id as string);
      return !agg || agg.qualifies;
    })
    .map((c) => {
      const agg = aggByCustomer.get(c.id as string) ?? defaultCustomerAgg(c.updated_at as string);
      const customer_status: CrmCustomerStatus =
        agg.lead_count === 0 && agg.ticket_count === 0 ? "new" : "known";
      return {
        ...(c as Omit<CrmCustomerRow, "lead_count" | "ticket_count" | "last_activity" | "customer_status">),
        lead_count: agg.lead_count,
        ticket_count: agg.ticket_count,
        last_activity:
          agg.last_activity > (c.updated_at as string) ? agg.last_activity : (c.updated_at as string),
        customer_status,
      };
    });
}

export async function fetchCrmCustomers(
  admin: AdminClient,
  filters: CrmListFilters = {},
  pagination?: PaginationParams,
) {
  const allRows = await buildEnrichedCustomerList(admin);
  const filtered = applyCrmListFilters(allRows, filters);
  const total = filtered.length;

  if (!pagination) {
    return { rows: filtered, total };
  }

  const { offset, limit } = pagination;
  const rows = filtered.slice(offset, offset + limit);
  return { rows, total };
}

export function parseCrmListFilters(searchParams: URLSearchParams): CrmListFilters {
  const statusParam = searchParams.get("status") ?? "all";
  const status =
    statusParam === "new" || statusParam === "known" ? statusParam : ("all" as const);
  const heatParam = searchParams.get("heat") ?? "all";
  const heat =
    heatParam === "hot" || heatParam === "warm" || heatParam === "cold" ? heatParam : ("all" as const);

  return {
    search: searchParams.get("search")?.trim() ?? "",
    status,
    heat,
  };
}
