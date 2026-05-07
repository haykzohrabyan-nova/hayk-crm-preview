import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  // scope=mine → filter to leads the current SDR worked (sdr_id = userId)
  const scope = searchParams.get("scope") ?? "";

  const admin = createAdminClient();
  let query = admin
    .from("leads")
    .select("*, customer:customers(*)")
    .eq("is_inbox", false)
    .order("updated_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  if (scope === "mine" && userId) {
    query = query.eq("sdr_id", userId);
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
