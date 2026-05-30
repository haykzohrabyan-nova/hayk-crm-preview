import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { sdrScopedLeadActionError } from "@/lib/utils/lead-sdr-scoped-tab";
import { salesScopedLeadActionError } from "@/lib/utils/lead-sales-scoped-tab";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const role = body?.role ?? "sdr";

  const admin = createAdminClient();
  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("prev_status, prev_sales_status, status, sales_status, sdr_id, locked_by_id, sales_owner_id")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const isSales = role === "sales";
  const resumedFrom = isSales ? current.sales_status : current.status;
  const scopeError = isSales
    ? salesScopedLeadActionError(current, userId!, roleName)
    : sdrScopedLeadActionError(current, userId!, roleName);
  if (scopeError) {
    return NextResponse.json({ error: scopeError, code: "FORBIDDEN" }, { status: 403 });
  }
  const update: Record<string, unknown> = {
    hold_reason: null,
    hold_notes: null,
    hold_until: null,
    held_by_id: null,
    held_at: null,
    follow_up_reason: null,
    follow_up_notes: null,
    follow_up_until: null,
    follow_up_by_id: null,
    follow_up_at: null,
    updated_at: new Date().toISOString(),
  };

  if (isSales) {
    update.sales_status = current.prev_sales_status ?? "Ongoing";
    update.prev_sales_status = null;
  } else {
    // Restore to prev_status if recorded; fall back to Pending.
    // Validated is now system-set (by ticket creation) — never restore manually to it.
    const restoredStatus = current.prev_status === "Validated" ? "Pending" : (current.prev_status ?? "Pending");
    update.status = restoredStatus;
    update.prev_status = null;
  }

  const { data: lead, error } = await admin
    .from("leads")
    .update(update)
    .eq("id", id)
    .select("*, customer:customers(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  await admin.from("activities").insert({
    lead_id: id,
    customer_id: lead.customer_id,
    type: "lead_resumed",
    by_user_id: userId,
    payload: { role, from: resumedFrom ?? null },
  });

  return NextResponse.json({ lead });
}
