import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { leadIdsRoutedToSales } from "@/lib/utils/lead-sdr-won-filter";
import { fetchRoutedToSalesLeadIds } from "@/lib/utils/lead-routed-to-sales-query";

const LEAD_WORKSPACE_LIST_SELECT =
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

function leadCustomer(lead: { customer: unknown }): LeadCustomer | null {
  const c = lead.customer;
  if (Array.isArray(c)) return (c[0] as LeadCustomer) ?? null;
  return (c as LeadCustomer) ?? null;
}

type WorkspaceListLead = {
  customer: unknown;
  status?: string | null;
  sales_status?: string | null;
};

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

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const scope = searchParams.get("scope") ?? "";
  const prevStatus = searchParams.get("prev_status") ?? "";
  const won = searchParams.get("won") === "true";
  const routed = searchParams.get("routed") === "true";

  const admin = createAdminClient();

  // Directed to Sales tab: every lead the SDR routed, regardless of current outcome
  if (routed) {
    const routedIds = await fetchRoutedToSalesLeadIds(admin, { userId, roleName });
    if (routedIds.length === 0) {
      return NextResponse.json({ leads: [] });
    }

    const { data, error } = await admin
      .from("leads")
      .select(LEAD_ROUTED_LIST_SELECT)
      .eq("is_inbox", false)
      .in("id", routedIds)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
    }

    let leads = (data ?? []) as unknown as WorkspaceListLead[];

    if (search) {
      leads = filterLeadsByCustomerSearch(leads, search);
    }

    return NextResponse.json({ leads });
  }

  // Won tab: sales_status Won + SDR routed lead to Sales first (not SDR self-quoted wins)
  if (won) {
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    return NextResponse.json({ leads });
  }

  let query = admin
    .from("leads")
    .select(LEAD_WORKSPACE_LIST_SELECT)
    .eq("is_inbox", false)
    .order("updated_at", { ascending: false });

  const statusesParam = searchParams.get("statuses") ?? "";
  const statusList = statusesParam ? statusesParam.split(",").map((s) => s.trim()) : [];

  if (statusList.length > 0) {
    query = query.in("status", statusList);
    query = query.not("sales_status", "eq", "Won");
  } else if (status) {
    query = query.eq("status", status);
  }

  if (prevStatus) {
    query = query.eq("prev_status", prevStatus);
  }

  if (scope === "mine" && userId && roleName !== "admin") {
    query = query.eq("sdr_id", userId);
  }

  if (roleName === "sales" && userId) {
    query = query.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
  }

  if (roleName === "sdr" && userId && !status && statusList.length === 0) {
    query = query.or(`locked_by_id.is.null,locked_by_id.eq.${userId}`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  let leads = (data ?? []) as unknown as WorkspaceListLead[];

  if (search) {
    leads = filterLeadsByCustomerSearch(leads, search);
  }

  return NextResponse.json({ leads });
}
