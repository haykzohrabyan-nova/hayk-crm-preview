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
  // prev_status → restrict rows to those whose previous status matches (e.g.
  // "Routed to Sales" to show only sales-pipeline rejections, not SDR rejections)
  const prevStatus = searchParams.get("prev_status") ?? "";

  const admin = createAdminClient();
  let query = admin
    .from("leads")
    .select(
      "*, customer:customers(*), sales_owner:user_profiles!leads_sales_owner_id_fkey(id,full_name), locked_by:user_profiles!leads_locked_by_id_fkey(id,full_name)"
    )
    .eq("is_inbox", false)
    .order("updated_at", { ascending: false });

  if (status) {
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
  // Applies to the all-leads tab only (no status param = Pending/Validated queue).
  // Hold/routed/rejected tabs pass a status param and use scope=mine, so they are unaffected.
  if (roleName === "sdr" && userId && !status) {
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
