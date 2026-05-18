import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  // scope=mine → filter to leads the current SDR worked (sdr_id = userId)
  const scope = searchParams.get("scope") ?? "";
  // prev_status → restrict rows to those whose previous status matches
  const prevStatus = searchParams.get("prev_status") ?? "";
  // won=true → fetch won leads (sales_status = "Won"), scoped to this SDR
  const won = searchParams.get("won") === "true";

  const admin = createAdminClient();

  // Won tab: leads where sales_status = "Won", scoped to this SDR (or all for admin)
  if (won) {
    let wonQuery = admin
      .from("leads")
      .select(
        "*, customer:customers(*), sales_owner:user_profiles!leads_sales_owner_id_fkey(id,full_name), tickets:job_tickets(id,reference_code,quote_final_total,ticket_status,created_by_id,created_by:user_profiles!job_tickets_created_by_id_fkey(id,full_name))"
      )
      .eq("is_inbox", false)
      .eq("sales_status", "Won")
      .order("updated_at", { ascending: false });

    if (roleName !== "admin" && userId) {
      wonQuery = wonQuery.eq("sdr_id", userId);
    }

    if (search) {
      // search applied client-side below
    }

    const { data, error } = await wonQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let leads = data ?? [];
    if (search) {
      leads = leads.filter((lead) => {
        const c = lead.customer;
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
    .select(
      "*, customer:customers(*), sales_owner:user_profiles!leads_sales_owner_id_fkey(id,full_name), locked_by:user_profiles!leads_locked_by_id_fkey(id,full_name)"
    )
    .eq("is_inbox", false)
    .order("updated_at", { ascending: false });

  // statuses = comma-separated list (e.g. "Routed to Sales,Quoted") — used by the
  // "Directed to Sales" tab to show all pipeline stages the SDR's lead may be in.
  const statusesParam = searchParams.get("statuses") ?? "";
  const statusList = statusesParam ? statusesParam.split(",").map((s) => s.trim()) : [];

  if (statusList.length > 0) {
    query = query.in("status", statusList);
    // Exclude Won leads from the routed tab — they belong in the Won tab only.
    // A "Quoted" lead that closed as Won would otherwise appear in both tabs.
    query = query.not("sales_status", "eq", "Won");
  } else if (status) {
    query = query.eq("status", status);
  }


  if (prevStatus) {
    query = query.eq("prev_status", prevStatus);
  }

  // scope=mine → filter to the current SDR's own leads (sdr_id = userId).
  // Admins skip this filter so they see ALL leads across every SDR on these tabs.
  if (scope === "mine" && userId && roleName !== "admin") {
    query = query.eq("sdr_id", userId);
  }


  // Sales reps only see unclaimed leads + leads they own.
  if (roleName === "sales" && userId) {
    query = query.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
  }

  // SDRs only see unlocked leads + leads they themselves have open.
  // Applies to the all-leads tab only (no status param AND no statuses param).
  // Hold/routed/rejected tabs either pass a status param or a statuses list and use
  // scope=mine — the locked_by_id filter must not apply there, because a sales rep
  // locking the lead (after claiming) would otherwise hide it from the SDR's routed tab.
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
      const c = lead.customer;
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
