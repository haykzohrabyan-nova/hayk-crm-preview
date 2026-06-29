import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireLeadApiPageAccess, requirePageAccess } from "@/lib/auth/require-page-access";
import { sdrScopedLeadActionError } from "@/lib/utils/lead-sdr-scoped-tab";
import { salesScopedLeadActionError } from "@/lib/utils/lead-sales-scoped-tab";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const isSales = roleName === "sales" || (roleName === "admin" && body.role === "sales");

  const admin = createAdminClient();

  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("status, sales_status, sdr_id, locked_by_id, sales_owner_id")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (isSales) {
    const pageDeny = await requirePageAccess(userId!, roleName, "/sales");
    if (pageDeny) return pageDeny;

    const scopeError = salesScopedLeadActionError(current, userId!, roleName);
    if (scopeError) {
      return NextResponse.json({ error: scopeError, code: "FORBIDDEN" }, { status: 403 });
    }

    if (current.status !== "Routed to Sales") {
      return NextResponse.json(
        { error: "Lead is not in the sales pipeline.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (current.sales_status !== "Claimed") {
      return NextResponse.json(
        { error: "Only claimed leads can be marked in progress.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { data: lead, error } = await admin
      .from("leads")
      .update({
        prev_sales_status: current.sales_status,
        sales_status: "In Progress",
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
      payload: { from: current.sales_status, role: "sales" },
    });

    return NextResponse.json({ lead });
  }

  const pageDeny = await requireLeadApiPageAccess(userId!, roleName);
  if (pageDeny) return pageDeny;

  const scopeError = sdrScopedLeadActionError(current, userId!, roleName);
  if (scopeError) {
    return NextResponse.json({ error: scopeError, code: "FORBIDDEN" }, { status: 403 });
  }

  const { data: lead, error } = await admin
    .from("leads")
    .update({
      status: "In Progress",
      prev_status: current.status,
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
    payload: { from: current.status, role: "sdr" },
  });

  return NextResponse.json({ lead });
}
