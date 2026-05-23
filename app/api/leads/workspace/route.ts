import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

const LEAD_WORKSPACE_LIST_SELECT =
  "id, customer_id, status, sales_status, source, urgency, initial_interest, created_at, updated_at, locked_by_id, sales_owner_id, sdr_id, hold_reason, hold_until, held_at, rejection_reason, prev_status, customer:customers(id, first_name, last_name, company, phone, email, industry, website, authority), sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name), locked_by:user_profiles!leads_locked_by_id_fkey(id, full_name)";

const LEAD_WON_LIST_SELECT =
  "id, customer_id, status, sales_status, source, urgency, initial_interest, created_at, updated_at, customer:customers(id, first_name, last_name, company, phone, email, industry, website, authority), sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name), tickets:job_tickets(id, reference_code, quote_final_total, ticket_status, created_by_id)";

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

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const scope = searchParams.get("scope") ?? "";
  const prevStatus = searchParams.get("prev_status") ?? "";
  const won = searchParams.get("won") === "true";

  const admin = createAdminClient();

  // Won tab: leads where sales_status = "Won" (released to production), scoped to this SDR
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

    let leads = data ?? [];

    const creatorIds = [
      ...new Set(
        leads.flatMap((l) =>
          ((l as Record<string, unknown>).tickets as { created_by_id: string | null }[] ?? [])
            .map((t) => t.created_by_id)
            .filter(Boolean),
        ),
      ),
    ] as string[];

    const creatorMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, full_name")
        .in("id", creatorIds);
      for (const p of profiles ?? []) {
        if (p.id) creatorMap[p.id] = p.full_name ?? "Unknown";
      }
    }

    leads = leads.map((lead) => ({
      ...lead,
      tickets: ((lead as Record<string, unknown>).tickets as { created_by_id: string | null; id: string; reference_code: string | null; quote_final_total: number | null; ticket_status: string }[] ?? []).map((t) => ({
        ...t,
        created_by: t.created_by_id ? { id: t.created_by_id, full_name: creatorMap[t.created_by_id] ?? null } : null,
      })),
    })) as typeof leads;

    if (search) {
      leads = leads.filter((lead) => {
        const c = leadCustomer(lead);
        return (
          c?.first_name?.toLowerCase().includes(search) ||
          c?.last_name?.toLowerCase().includes(search) ||
          c?.email?.toLowerCase().includes(search) ||
          c?.phone?.includes(search) ||
          c?.company?.toLowerCase().includes(search)
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

  let leads = data ?? [];

  if (search) {
    leads = leads.filter((lead) => {
      const c = leadCustomer(lead);
      return (
        c?.first_name?.toLowerCase().includes(search) ||
        c?.last_name?.toLowerCase().includes(search) ||
        c?.email?.toLowerCase().includes(search) ||
        c?.phone?.includes(search) ||
        c?.company?.toLowerCase().includes(search)
      );
    });
  }

  return NextResponse.json({ leads });
}
