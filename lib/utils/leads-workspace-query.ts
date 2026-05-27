import type { createAdminClient } from "@/lib/supabase/admin";
import { countExact } from "@/lib/utils/db-counts";
import { countLeadsWonViaSalesRoute } from "@/lib/utils/lead-sdr-won-filter";
import { countLeadsRoutedToSales } from "@/lib/utils/lead-routed-to-sales-query";
import { leadIdsRoutedToSales } from "@/lib/utils/lead-sdr-won-filter";
import { fetchRoutedToSalesLeadIds } from "@/lib/utils/lead-routed-to-sales-query";

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
  customer: unknown;
  status?: string | null;
  sales_status?: string | null;
  source?: string | null;
  urgency?: string | null;
};

function leadCustomer(lead: { customer: unknown }): LeadCustomer | null {
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
};

export function parseLeadsWorkspaceQuery(searchParams: URLSearchParams): LeadsWorkspaceQuery {
  const statusesParam = searchParams.get("statuses") ?? "";
  return {
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search")?.trim().toLowerCase() ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
    prevStatus: searchParams.get("prev_status") ?? undefined,
    won: searchParams.get("won") === "true",
    routed: searchParams.get("routed") === "true",
    statuses: statusesParam ? statusesParam.split(",").map((s) => s.trim()) : undefined,
  };
}

export async function fetchLeadsWorkspace(
  admin: AdminClient,
  query: LeadsWorkspaceQuery,
  userId: string,
  roleName: string,
) {
  const search = query.search ?? "";

  if (query.routed) {
    const routedIds = await fetchRoutedToSalesLeadIds(admin, { userId, roleName });
    if (routedIds.length === 0) return [];

    const { data, error } = await admin
      .from("leads")
      .select(LEAD_ROUTED_LIST_SELECT)
      .eq("is_inbox", false)
      .in("id", routedIds)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    let leads = (data ?? []) as unknown as WorkspaceListLead[];
    if (search) leads = filterLeadsByCustomerSearch(leads, search);
    return leads;
  }

  if (query.won) {
    let wonQuery = admin
      .from("leads")
      .select(LEAD_WON_LIST_SELECT)
      .eq("is_inbox", false)
      .eq("sales_status", "Won")
      .order("updated_at", { ascending: false });

    if (roleName !== "admin" && userId) {
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
    return leads;
  }

  let dbQuery = admin
    .from("leads")
    .select(LEAD_WORKSPACE_LIST_SELECT)
    .eq("is_inbox", false)
    .order("updated_at", { ascending: false });

  if (query.statuses && query.statuses.length > 0) {
    dbQuery = dbQuery.in("status", query.statuses).not("sales_status", "eq", "Won");
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

  if (roleName === "sales" && userId) {
    dbQuery = dbQuery.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
  }

  if (roleName === "sdr" && userId && !query.status && !(query.statuses && query.statuses.length > 0)) {
    dbQuery = dbQuery.or(`locked_by_id.is.null,locked_by_id.eq.${userId}`);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;

  let leads = (data ?? []) as unknown as WorkspaceListLead[];
  if (search) leads = filterLeadsByCustomerSearch(leads, search);
  return leads;
}

export async function fetchLeadsWorkspaceTabCounts(
  admin: AdminClient,
  userId: string,
  roleName: string,
) {
  const [all, hold, routed, rejected, won] = await Promise.all([
    countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).in("status", ["Pending", "Validated"]);
      if (roleName === "sdr" && userId) {
        query = query.or(`locked_by_id.is.null,locked_by_id.eq.${userId}`);
      }
      return query;
    }),
    countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).eq("status", "On Hold");
      if (roleName !== "admin" && userId) {
        query = query.eq("sdr_id", userId);
      }
      return query;
    }),
    countLeadsRoutedToSales(admin, { userId, roleName }),
    countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).eq("status", "Rejected");
      if (roleName !== "admin" && userId) {
        query = query.eq("sdr_id", userId);
      }
      return query;
    }),
    countLeadsWonViaSalesRoute(admin, { userId, roleName }),
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
