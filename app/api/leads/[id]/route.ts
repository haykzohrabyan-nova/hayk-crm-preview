import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";

const IMMUTABLE = ["id", "created_at"];

// ─── GET /api/leads/[id] ──────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: lead, error } = await admin
    .from("leads")
    .select(`
      *,
      customer:customers(id, first_name, last_name, company, phone, email, industry, website)
    `)
    .eq("id", id)
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Reps can only view leads they own; admins see all
  if (roleName !== "admin" && lead.sdr_id !== userId && lead.sales_owner_id !== userId) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({ lead });
}

// Fields whose changes are worth recording in the activity timeline
const TRACKED_FIELDS = [
  "urgency", "interests", "quantities", "has_design", "sdr_comment",
  "is_returning_customer", "brand", "source", "authority",
  "sales_notes",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const body = await request.json();

  // Strip immutable fields
  for (const f of IMMUTABLE) delete body[f];

  // Normalize "not_defined" sentinel → null, and capitalize to match DB constraint
  if (body.urgency === "not_defined" || body.urgency === "") {
    body.urgency = null;
  } else if (typeof body.urgency === "string" && body.urgency) {
    body.urgency = body.urgency.charAt(0).toUpperCase() + body.urgency.slice(1).toLowerCase();
  }

  // Normalize phone-like fields
  if (body.quote_destination) {
    body.quote_destination = digitsOnly(body.quote_destination);
  }

  const admin = createAdminClient();

  // Fetch current lead for guards and change-detection.
  // Fields must be listed as a static string — Supabase's type parser does not
  // support dynamic template literals.
  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("status, sales_status, locked_by_id, customer_id, urgency, interests, quantities, has_design, sdr_comment, is_returning_customer, brand, source, authority")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Terminal state guard
  if (current.status === "Rejected" && roleName !== "admin") {
    return NextResponse.json(
      { error: "This lead is rejected and cannot be modified.", code: "LEAD_REJECTED_TERMINAL" },
      { status: 403 }
    );
  }

  // Lock guard
  if (
    current.locked_by_id &&
    current.locked_by_id !== userId &&
    roleName !== "admin"
  ) {
    return NextResponse.json(
      { error: "Lead is locked by another user.", code: "LEAD_LOCKED" },
      { status: 409 }
    );
  }

  const prevStatus = current.status;
  const prevSalesStatus = current.sales_status;

  // When rejecting, persist prev_status so consumers can distinguish
  // "rejected by SDR" (prev_status != "Routed to Sales") from
  // "rejected from the sales pipeline" (prev_status == "Routed to Sales").
  if (body.status === "Rejected") {
    body.prev_status = current.status;
  }

  body.updated_at = new Date().toISOString();

  const { data: lead, error } = await admin
    .from("leads")
    .update(body)
    .eq("id", id)
    .select("*, customer:customers(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Log field-level edits when no status change is happening
  if (!body.status) {
    const changedFields = TRACKED_FIELDS.filter(
      (f) => body[f] !== undefined && JSON.stringify(body[f]) !== JSON.stringify((current as Record<string, unknown>)[f])
    );
    if (changedFields.length > 0) {
      await admin.from("activities").insert({
        lead_id: id,
        customer_id: lead.customer_id,
        type: "lead_edited",
        by_user_id: userId,
        payload: { fields: changedFields },
      });
    }
  }

  // Log status change activity if status changed
  if (body.status && body.status !== prevStatus) {
    await admin.from("activities").insert({
      lead_id: id,
      customer_id: lead.customer_id,
      type: "lead_status_changed",
      by_user_id: userId,
      payload: { from: prevStatus, to: body.status },
    });

    if (body.status === "Routed to Sales") {
      await admin.from("activities").insert({
        lead_id: id,
        customer_id: lead.customer_id,
        type: "lead_routed_to_sales",
        by_user_id: userId,
        payload: {},
      });
    }
    if (body.status === "Rejected") {
      await admin.from("activities").insert({
        lead_id: id,
        customer_id: lead.customer_id,
        type: "lead_rejected",
        by_user_id: userId,
        payload: {
          from: prevStatus,
          reason: body.rejection_reason ?? null,
          notes: body.rejection_notes ?? null,
        },
      });
    }
  }

  if (body.sales_status && body.sales_status !== prevSalesStatus) {
    await admin.from("activities").insert({
      lead_id: id,
      customer_id: lead.customer_id,
      type: "lead_status_changed",
      by_user_id: userId,
      payload: { sales_from: prevSalesStatus, sales_to: body.sales_status },
    });
  }

  return NextResponse.json({ lead });
}
