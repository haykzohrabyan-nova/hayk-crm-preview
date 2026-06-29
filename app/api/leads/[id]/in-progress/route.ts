import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireLeadApiPageAccess } from "@/lib/auth/require-page-access";
import { sdrScopedLeadActionError } from "@/lib/utils/lead-sdr-scoped-tab";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireLeadApiPageAccess(userId!, roleName);
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("status, sales_status, sdr_id, locked_by_id, sales_owner_id")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const scopeError = sdrScopedLeadActionError(current, userId!, roleName);
  if (scopeError) {
    return NextResponse.json({ error: scopeError, code: "FORBIDDEN" }, { status: 403 });
  }

  const { data: lead, error } = await admin
    .from("leads")
    .update({
      status: "In Progress",
      prev_status: current.status,
      // Attribute the lead to this SDR if not already set
      sdr_id: current.sdr_id ?? userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, customer:customers(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  await admin.from("activities").insert({
    lead_id: id,
    customer_id: lead.customer_id,
    type: "lead_in_progress",
    by_user_id: userId,
    payload: { from: current.status },
  });

  return NextResponse.json({ lead });
}
