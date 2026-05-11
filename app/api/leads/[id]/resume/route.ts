import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const body = await request.json();
  const role = body?.role ?? "sdr";

  const admin = createAdminClient();
  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("prev_status, prev_sales_status")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const isSales = role === "sales";
  const update: Record<string, unknown> = {
    hold_reason: null,
    hold_notes: null,
    hold_until: null,
    held_by_id: null,
    held_at: null,
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
    payload: { role },
  });

  return NextResponse.json({ lead });
}
