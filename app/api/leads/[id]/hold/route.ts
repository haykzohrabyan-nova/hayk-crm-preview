import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireLeadApiPageAccess } from "@/lib/auth/require-page-access";
import { sdrScopedLeadActionError } from "@/lib/utils/lead-sdr-scoped-tab";
import { salesScopedLeadActionError } from "@/lib/utils/lead-sales-scoped-tab";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireLeadApiPageAccess(userId!, roleName);
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { hold_reason, hold_notes, hold_until } = body;
  // Sales/SDR roles are derived from the verified session — body.role cannot escalate privileges.
  // Admins are trusted to indicate which workflow they are acting in (they pass both scope checks).
  const isSales = roleName === "sales" || (roleName === "admin" && body.role === "sales");

  if (!hold_reason) {
    return NextResponse.json(
      { error: "Hold reason is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("status, sales_status, sdr_id, locked_by_id, sales_owner_id")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const scopeError = isSales
    ? salesScopedLeadActionError(current, userId!, roleName)
    : sdrScopedLeadActionError(current, userId!, roleName);
  if (scopeError) {
    return NextResponse.json({ error: scopeError, code: "FORBIDDEN" }, { status: 403 });
  }
  const update: Record<string, unknown> = {
    hold_reason,
    hold_notes: hold_notes ?? null,
    hold_until: hold_until || null,
    held_by_id: userId,
    held_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // SDR retains ownership (locked_by_id stays set) so the lead remains
    // in their queue and hidden from other SDRs while on hold.
    // Sales holds still release the lock (sales ownership is via sales_owner_id).
    ...(isSales ? { locked_by_id: null, locked_at: null } : {}),
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
    payload: {
      reason: hold_reason,
      notes: hold_notes ?? null,
      until: hold_until || null,
      role: isSales ? "sales" : "sdr",
    },
  });

  return NextResponse.json({ lead });
}
