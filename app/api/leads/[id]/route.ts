import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireLeadApiPageAccess } from "@/lib/auth/require-page-access";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";
import { canReadLead, canMutateLead } from "@/lib/utils/lead-access";
import { validateLeadInterestsPayload } from "@/lib/utils/validate-lead-product-interests";
import { resolveActiveKeyAccountSalesRep } from "@/lib/utils/resolve-key-account-sales-rep";

// Only these fields may be written via a general PATCH.
// Privileged columns (locked_by_id, sdr_id, hold_*, follow_up_*, etc.)
// are managed exclusively by their dedicated endpoints.
// sales_owner_id is allowed here so the Route-to-Sales modal can optionally
// assign a rep in the same atomic request that changes status.
const ALLOWED_PATCH_FIELDS = [
  "urgency",
  "interests",
  "quantities",
  "has_design",
  "sdr_comment",
  "is_returning_customer",
  "brand",
  "source",
  "quote_destination",
  "sales_notes",
  "sales_status",
  "status",
  "rejection_reason",
  "rejection_notes",
  "sales_owner_id",
] as const;

// ─── GET /api/leads/[id] ──────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireLeadApiPageAccess(userId!, roleName);
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: lead, error } = await admin
    .from("leads")
    .select(
      `*,
      customer:customers(id, first_name, last_name, company, phone, email, industry, website, authority),
      sales_owner:user_profiles!leads_sales_owner_id_fkey(id, full_name),
      locked_by:user_profiles!leads_locked_by_id_fkey(id, full_name)`,
    )
    .eq("id", id)
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const row = lead as unknown as {
    status: string;
    sales_status: string | null;
    sdr_id: string | null;
    sales_owner_id: string | null;
    locked_by_id: string | null;
    prev_status: string | null;
  };

  if (!canReadLead(row, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({ lead });
}

// Fields whose changes are worth recording in the activity timeline
const TRACKED_FIELDS = [
  "urgency", "interests", "quantities", "has_design", "sdr_comment",
  "is_returning_customer", "brand", "source",
  "sales_notes",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireLeadApiPageAccess(userId!, roleName);
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Extract customer authority before whitelist filtering (it updates a different table)
  const customerAuthority =
    body.authority !== undefined ? normalizeAuthority(String(body.authority ?? "")) : undefined;

  // Build update from the whitelist only — unknown keys are silently dropped
  const update: Record<string, unknown> = {};
  for (const f of ALLOWED_PATCH_FIELDS) {
    if (f in body) update[f] = body[f];
  }

  // Normalize "not_defined" sentinel → null, and capitalize to match DB constraint
  if ("urgency" in update) {
    if (update.urgency === "not_defined" || update.urgency === "") {
      update.urgency = null;
    } else if (typeof update.urgency === "string" && update.urgency) {
      update.urgency = update.urgency.charAt(0).toUpperCase() + (update.urgency as string).slice(1).toLowerCase();
    }
  }

  // Normalize phone-like fields
  if (update.quote_destination) {
    update.quote_destination = digitsOnly(update.quote_destination as string);
  }

  const admin = createAdminClient();

  // Fetch current lead for guards and change-detection.
  // Fields must be listed as a static string — Supabase's type parser does not
  // support dynamic template literals.
  const { data: current, error: fetchErr } = await admin
    .from("leads")
    .select("status, sales_status, locked_by_id, customer_id, sdr_id, sales_owner_id, prev_status, urgency, interests, quantities, has_design, sdr_comment, is_returning_customer, brand, source, authority")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const scopeRow = current as unknown as {
    status: string;
    sales_status: string | null;
    sdr_id: string | null;
    sales_owner_id: string | null;
    locked_by_id: string | null;
    prev_status: string | null;
  };

  if (!canMutateLead(scopeRow, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
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

  if (
    update.interests !== undefined ||
    update.quantities !== undefined ||
    update.has_design !== undefined
  ) {
    const interestsErr = validateLeadInterestsPayload(
      update.interests as Record<string, unknown> | undefined,
      update.quantities as Record<string, unknown> | undefined,
      update.has_design as Record<string, unknown> | undefined,
    );
    if (interestsErr) {
      return NextResponse.json({ error: interestsErr, code: "VALIDATION_ERROR" }, { status: 400 });
    }
  }

  const prevStatus = current.status;
  const prevSalesStatus = current.sales_status;

  // When rejecting, persist prev_status so consumers can distinguish
  // "rejected by SDR" (prev_status != "Routed to Sales") from
  // "rejected from the sales pipeline" (prev_status == "Routed to Sales").
  if (update.status === "Rejected") {
    update.prev_status = current.status;
  }

  if (update.status === "Routed to Sales" && current.customer_id) {
    const hasExplicitOwner = "sales_owner_id" in body;
    const choseQueue = hasExplicitOwner && update.sales_owner_id == null;
    if (!choseQueue && !update.sales_owner_id) {
      const keyRep = await resolveActiveKeyAccountSalesRep(admin, current.customer_id);
      if (keyRep) {
        update.sales_owner_id = keyRep.id;
        update.sales_status = "Claimed";
      }
    }
  }

  update.updated_at = new Date().toISOString();

  const { data: lead, error } = await admin
    .from("leads")
    .update(update)
    .eq("id", id)
    .select("*, customer:customers(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  if (customerAuthority !== undefined && current.customer_id) {
    await admin
      .from("customers")
      .update({ authority: customerAuthority, updated_at: new Date().toISOString() })
      .eq("id", current.customer_id);
  }

  let resultLead = lead;
  if (customerAuthority !== undefined && current.customer_id) {
    const { data: refreshed } = await admin
      .from("leads")
      .select("*, customer:customers(*)")
      .eq("id", id)
      .single();
    if (refreshed) resultLead = refreshed;
  }

  // Log field-level edits when no status change is happening
  if (!update.status) {
    const changedFields = TRACKED_FIELDS.filter(
      (f) => update[f] !== undefined && JSON.stringify(update[f]) !== JSON.stringify((current as Record<string, unknown>)[f])
    );
    if (customerAuthority !== undefined) changedFields.push("authority");
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
  if (update.status && update.status !== prevStatus) {
    await admin.from("activities").insert({
      lead_id: id,
      customer_id: lead.customer_id,
      type: "lead_status_changed",
      by_user_id: userId,
      payload: { from: prevStatus, to: update.status },
    });

    if (update.status === "Routed to Sales") {
      await admin.from("activities").insert({
        lead_id: id,
        customer_id: lead.customer_id,
        type: "lead_routed_to_sales",
        by_user_id: userId,
        payload: {},
      });

      if (update.sales_owner_id) {
        const { data: assignee } = await admin
          .from("user_profiles")
          .select("full_name")
          .eq("id", update.sales_owner_id)
          .single();
        await admin.from("activities").insert({
          lead_id: id,
          customer_id: lead.customer_id,
          type: "lead_reassigned",
          by_user_id: userId,
          payload: {
            from_user_id: null,
            from_name: null,
            to_user_id: update.sales_owner_id,
            to_name: assignee?.full_name ?? null,
            role: "sales",
          },
        });
      }
    }
    if (update.status === "Rejected") {
      await admin.from("activities").insert({
        lead_id: id,
        customer_id: lead.customer_id,
        type: "lead_rejected",
        by_user_id: userId,
        payload: {
          from: prevStatus,
          reason: update.rejection_reason ?? null,
          notes: update.rejection_notes ?? null,
        },
      });
    }
  }

  if (update.sales_status && update.sales_status !== prevSalesStatus) {
    await admin.from("activities").insert({
      lead_id: id,
      customer_id: lead.customer_id,
      type: "lead_status_changed",
      by_user_id: userId,
      payload: { sales_from: prevSalesStatus, sales_to: update.sales_status },
    });
  }

  return NextResponse.json({ lead: resultLead });
}
