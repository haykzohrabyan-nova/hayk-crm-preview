import type { createAdminClient } from "@/lib/supabase/admin";
import type { PaginationParams } from "@/lib/utils/pagination";

type AdminClient = ReturnType<typeof createAdminClient>;

export const CUSTOMER_LIST_SELECT =
  "id, first_name, last_name, email, phone, company, industry, heat_tag, created_at, updated_at";

export type CrmCustomerStatus = "new" | "known";

export type CrmListFilters = {
  search?: string;
  status?: "all" | CrmCustomerStatus;
  heat?: "all" | "hot" | "warm" | "cold";
  duplicates?: boolean;
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
  is_duplicate_phone?: boolean;
};

// ─── DB-level filter builder ───────────────────────────────────────────────────

type AnyQuery = ReturnType<ReturnType<AdminClient["from"]>["select"]>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDbFilters(query: AnyQuery, filters: CrmListFilters): any {
  if (filters.heat && filters.heat !== "all") {
    query = (query as AnyQuery).eq("heat_tag", filters.heat);
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    query = (query as AnyQuery).or(
      `first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q},company.ilike.${q}`,
    );
  }
  return query;
}

// ─── Enrich a small set of customer rows ──────────────────────────────────────

async function enrichCustomerPage(
  admin: AdminClient,
  customers: Array<{ id: string; updated_at: string; phone?: string | null; [k: string]: unknown }>,
  knownIds: Set<string>,
  duplicatePhones?: Set<string>,
): Promise<CrmCustomerRow[]> {
  if (customers.length === 0) return [];

  const ids = customers.map((c) => c.id);

  const [leadsRes, ticketsRes] = await Promise.all([
    admin
      .from("leads")
      .select("customer_id, status, sales_status, updated_at")
      .in("customer_id", ids),
    admin
      .from("job_tickets")
      .select("customer_id, created_at")
      .in("customer_id", ids),
  ]);

  type LeadRow = { customer_id: string; status: string; sales_status: string | null; updated_at: string };
  type TicketRow = { customer_id: string; created_at: string };

  const agg = new Map<string, { lead_count: number; ticket_count: number; last_activity: string }>();

  for (const l of (leadsRes.data ?? []) as LeadRow[]) {
    const cur = agg.get(l.customer_id) ?? { lead_count: 0, ticket_count: 0, last_activity: l.updated_at };
    cur.lead_count += 1;
    if (l.updated_at > cur.last_activity) cur.last_activity = l.updated_at;
    agg.set(l.customer_id, cur);
  }
  for (const t of (ticketsRes.data ?? []) as TicketRow[]) {
    const cur = agg.get(t.customer_id) ?? { lead_count: 0, ticket_count: 0, last_activity: t.created_at };
    cur.ticket_count += 1;
    if (t.created_at > cur.last_activity) cur.last_activity = t.created_at;
    agg.set(t.customer_id, cur);
  }

  return customers.map((c) => {
    const a = agg.get(c.id) ?? { lead_count: 0, ticket_count: 0, last_activity: c.updated_at as string };
    return {
      ...(c as Omit<CrmCustomerRow, "lead_count" | "ticket_count" | "last_activity" | "customer_status" | "is_duplicate_phone">),
      lead_count: a.lead_count,
      ticket_count: a.ticket_count,
      last_activity: a.last_activity > (c.updated_at as string) ? a.last_activity : (c.updated_at as string),
      customer_status: knownIds.has(c.id) ? "known" : "new",
      is_duplicate_phone: duplicatePhones != null && c.phone ? duplicatePhones.has(c.phone) : undefined,
    };
  });
}

// ─── Find phones that appear more than once ───────────────────────────────────

async function fetchDuplicatePhoneIds(
  admin: AdminClient,
  filters: CrmListFilters,
): Promise<{ duplicateIds: string[]; duplicatePhones: Set<string> }> {
  // Fetch id + phone for all customers matching search/heat filters (no pagination).
  const q = applyDbFilters(
    admin.from("customers").select("id, phone"),
    filters,
  ).not("phone", "is", null).order("updated_at", { ascending: false }).limit(100000);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { id: string; phone: string }[];

  // Count occurrences per phone
  const phoneCounts = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.phone) continue;
    if (!phoneCounts.has(r.phone)) phoneCounts.set(r.phone, []);
    phoneCounts.get(r.phone)!.push(r.id);
  }

  const duplicatePhones = new Set<string>();
  const duplicateIds: string[] = [];
  for (const [phone, ids] of phoneCounts) {
    if (ids.length > 1) {
      duplicatePhones.add(phone);
      // Preserve the updated_at order (already ordered from DB)
      ids.forEach((id) => duplicateIds.push(id));
    }
  }

  return { duplicateIds, duplicatePhones };
}

// ─── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchCrmCustomers(
  admin: AdminClient,
  filters: CrmListFilters = {},
  pagination?: PaginationParams,
) {
  const { offset = 0, limit = 25 } = pagination ?? {};
  const needsStatusFilter = filters.status && filters.status !== "all";

  // Always fetch the set of customer IDs that have any lead or ticket activity.
  // This is a lightweight query — just UUIDs, no row data.
  const [leadsIdsRes, ticketIdsRes] = await Promise.all([
    admin.from("leads").select("customer_id").not("customer_id", "is", null).limit(100000),
    admin.from("job_tickets").select("customer_id").not("customer_id", "is", null).limit(100000),
  ]);

  const knownIds = new Set<string>([
    ...((leadsIdsRes.data ?? []) as { customer_id: string }[]).map((r) => r.customer_id),
    ...((ticketIdsRes.data ?? []) as { customer_id: string }[]).map((r) => r.customer_id),
  ]);

  // Always resolve duplicate phones (id+phone only — two tiny columns, ~20ms for thousands of rows).
  // This lets the merge icon appear on any tab, not just the Duplicates filter view.
  const { duplicatePhones } = await fetchDuplicatePhoneIds(admin, {});

  // ── Duplicates filter path ────────────────────────────────────────────────────
  if (filters.duplicates) {
    const { duplicateIds } = await fetchDuplicatePhoneIds(admin, filters);
    const total = duplicateIds.length;

    if (total === 0 || !pagination) return { rows: [], total, duplicateCount: total };

    const pageIds = duplicateIds.slice(offset, offset + limit);
    if (pageIds.length === 0) return { rows: [], total, duplicateCount: total };

    const { data: pageCustomers, error: pageErr } = await admin
      .from("customers")
      .select(CUSTOMER_LIST_SELECT)
      .in("id", pageIds);
    if (pageErr) throw new Error(pageErr.message);

    const orderMap = new Map(pageIds.map((id, i) => [id, i]));
    const sorted = ((pageCustomers ?? []) as Parameters<typeof enrichCustomerPage>[1]).sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );

    const rows = await enrichCustomerPage(admin, sorted, knownIds, duplicatePhones);
    return { rows, total, duplicateCount: total };
  }

  // ── Fast path: no status filter ──────────────────────────────────────────────
  if (!needsStatusFilter) {
    const { count } = await applyDbFilters(
      admin.from("customers").select("*", { count: "exact", head: true }),
      filters,
    );
    const total = count ?? 0;
    if (total === 0) return { rows: [], total };

    let rowQuery = applyDbFilters(
      admin.from("customers").select(CUSTOMER_LIST_SELECT),
      filters,
    ).order("updated_at", { ascending: false });

    // With pagination: fetch only the current page. Without: return up to 500 rows (e.g. search/merge lookups).
    rowQuery = pagination
      ? rowQuery.range(offset, offset + limit - 1)
      : rowQuery.limit(500);

    const { data: pageCustomers, error } = await rowQuery;
    if (error) throw new Error(error.message);

    const rows = await enrichCustomerPage(admin, (pageCustomers ?? []) as Parameters<typeof enrichCustomerPage>[1], knownIds, duplicatePhones);
    return { rows, total };
  }

  // ── Status-filter path (new / known) ─────────────────────────────────────────
  const { data: idRows, error: idErr } = await applyDbFilters(
    admin.from("customers").select("id"),
    filters,
  ).order("updated_at", { ascending: false }).limit(100000);
  if (idErr) throw new Error(idErr.message);

  const allIds = ((idRows ?? []) as { id: string }[]).map((r) => r.id);
  const filteredIds =
    filters.status === "known"
      ? allIds.filter((id) => knownIds.has(id))
      : allIds.filter((id) => !knownIds.has(id));

  const total = filteredIds.length;
  if (total === 0) return { rows: [], total };

  // With pagination: slice to page. Without: return up to 500.
  const pageIds = pagination
    ? filteredIds.slice(offset, offset + limit)
    : filteredIds.slice(0, 500);
  if (pageIds.length === 0) return { rows: [], total };

  const { data: pageCustomers, error: pageErr } = await admin
    .from("customers")
    .select(CUSTOMER_LIST_SELECT)
    .in("id", pageIds);
  if (pageErr) throw new Error(pageErr.message);

  const orderMap = new Map(pageIds.map((id, i) => [id, i]));
  const sorted = ((pageCustomers ?? []) as Parameters<typeof enrichCustomerPage>[1]).sort(
    (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
  );

  const rows = await enrichCustomerPage(admin, sorted, knownIds, duplicatePhones);
  return { rows, total };
}

// ─── Filter parsers ────────────────────────────────────────────────────────────

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
    duplicates: searchParams.get("duplicates") === "1",
  };
}
