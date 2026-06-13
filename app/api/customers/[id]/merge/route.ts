import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "admin" && roleName !== "sales") {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  const pageDeny = await requirePageAccess(userId!, roleName, "/crm");
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const target_id: string | undefined = body.target_id;

  // Optional field overrides to apply to the surviving (target) record after merge.
  const overrides: Record<string, unknown> = body.overrides ?? {};

  const ALLOWED_OVERRIDE_FIELDS = new Set([
    "first_name", "last_name", "company", "email", "industry", "heat_tag",
  ]);

  const safeOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([k]) => ALLOWED_OVERRIDE_FIELDS.has(k)),
  );

  if (!target_id) {
    return NextResponse.json(
      { error: "target_id is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (target_id === id) {
    return NextResponse.json(
      { error: "Cannot merge a customer into itself.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const [srcResult, tgtResult] = await Promise.all([
    admin.from("customers").select("id, first_name, last_name").eq("id", id).single(),
    admin.from("customers").select("id, first_name, last_name").eq("id", target_id).single(),
  ]);

  if (srcResult.error || !srcResult.data) {
    return NextResponse.json({ error: "Source customer not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (tgtResult.error || !tgtResult.data) {
    return NextResponse.json({ error: "Target customer not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Apply field overrides to the surviving record before moving child rows.
  if (Object.keys(safeOverrides).length > 0) {
    const { error: overrideErr } = await admin
      .from("customers")
      .update({ ...safeOverrides, updated_at: new Date().toISOString() })
      .eq("id", target_id);
    if (overrideErr) {
      return NextResponse.json({ error: overrideErr.message, code: "DB_ERROR" }, { status: 500 });
    }
  }

  // Move all child records from source → target.
  const { error: leadsError } = await admin
    .from("leads")
    .update({ customer_id: target_id })
    .eq("customer_id", id);
  if (leadsError) {
    return NextResponse.json({ error: leadsError.message, code: "DB_ERROR" }, { status: 500 });
  }

  const { error: ticketsError } = await admin
    .from("job_tickets")
    .update({ customer_id: target_id })
    .eq("customer_id", id);
  if (ticketsError) {
    return NextResponse.json({ error: ticketsError.message, code: "DB_ERROR" }, { status: 500 });
  }

  await admin.from("activities").update({ customer_id: target_id }).eq("customer_id", id);

  await admin.from("activities").insert({
    customer_id: target_id,
    type: "contact_edited",
    by_user_id: userId,
    payload: {
      action: "merge",
      merged_from: id,
      merged_from_name: [srcResult.data.first_name, srcResult.data.last_name].filter(Boolean).join(" "),
      overrides_applied: Object.keys(safeOverrides),
    },
  });

  const { error: deleteError } = await admin.from("customers").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ success: true, surviving_id: target_id });
}
