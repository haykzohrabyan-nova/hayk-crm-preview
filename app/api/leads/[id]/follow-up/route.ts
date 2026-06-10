import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireLeadApiPageAccess } from "@/lib/auth/require-page-access";
import {
  sdrScopedLeadActionError,
  sdrScopedLeadAttribution,
} from "@/lib/utils/lead-sdr-scoped-tab";
import { salesScopedLeadActionError } from "@/lib/utils/lead-sales-scoped-tab";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireLeadApiPageAccess(userId!, roleName);
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { follow_up_reason, follow_up_notes, follow_up_until } = body;
  // Sales/SDR roles are derived from the verified session — body.role cannot escalate privileges.
  // Admins are trusted to indicate which workflow they are acting in (they pass both scope checks).
  const isSales = roleName === "sales" || (roleName === "admin" && body.role === "sales");

  if (!follow_up_reason) {
    return NextResponse.json(
      { error: "Follow-up reason is required.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const notesTrimmed = typeof follow_up_notes === "string" ? follow_up_notes.trim() : "";
  const isOtherFollowUp =
    follow_up_reason.endsWith("_other") || follow_up_reason === "other";
  if (isOtherFollowUp && !notesTrimmed) {
    return NextResponse.json(
      { error: "Please specify a reason when Other is selected.", code: "VALIDATION_ERROR" },
      { status: 400 },
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

  const sharedFields: Record<string, unknown> = {
    follow_up_reason,
    follow_up_notes: notesTrimmed || null,
    follow_up_until: follow_up_until || null,
    follow_up_by_id: userId,
    follow_up_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const update: Record<string, unknown> = isSales
    ? {
        ...sharedFields,
        prev_sales_status: current.sales_status,
        sales_status: "Follow Up Later",
        locked_by_id: null,
        locked_at: null,
      }
    : {
        ...sharedFields,
        prev_status: current.status,
        status: "Follow Up Later",
        ...sdrScopedLeadAttribution(roleName, userId!),
      };

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
    type: "lead_follow_up_later",
    by_user_id: userId,
    payload: {
      reason: follow_up_reason,
      notes: notesTrimmed || null,
      until: follow_up_until || null,
      role: isSales ? "sales" : "sdr",
    },
  });

  return NextResponse.json({ lead });
}
