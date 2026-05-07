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
  const { hold_reason, hold_notes, hold_until, role } = body;

  if (!hold_reason) {
    return NextResponse.json(
      { error: "Hold reason is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("status, sales_status")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const isSales = role === "sales";
  const update: Record<string, unknown> = {
    hold_reason,
    hold_notes: hold_notes ?? null,
    hold_until: hold_until || null,
    held_by_id: userId,
    held_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Unlock on hold
    locked_by_id: null,
    locked_at: null,
  };

  if (isSales) {
    update.prev_sales_status = current.sales_status;
    update.sales_status = "On Hold";
  } else {
    update.prev_status = current.status;
    update.status = "On Hold";
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
    type: "lead_held",
    by_user_id: userId,
    payload: { reason: hold_reason, notes: hold_notes ?? null, role },
  });

  return NextResponse.json({ lead });
}
