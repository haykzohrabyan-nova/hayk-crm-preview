import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/tickets/[id] ────────────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data: ticket, error } = await admin
    .from("job_tickets")
    .select(
      `*,
       customer:customers(id, first_name, last_name, company, phone, email),
       lead:leads(
         id, status, sales_status, urgency, initial_interest, source,
         sdr_comment, hold_reason, rejection_reason, is_returning_customer, interests,
         customer:customers(id, first_name, last_name, company, phone, email, industry)
       )`
    )
    .eq("id", id)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Scope check: reps can only view their own tickets.
  // Exception: sales/admin can view 'routed' tickets (SDR hand-offs awaiting claim).
  const isRoutedForSales =
    ticket.ticket_status === "routed" &&
    (roleName === "sales" || roleName === "admin");

  if (roleName !== "admin" && ticket.created_by_id !== userId && !isRoutedForSales) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  // Fetch creator name separately (created_by_id → auth.users, not user_profiles FK)
  let created_by: { id: string; full_name: string } | null = null;
  if (ticket.created_by_id) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", ticket.created_by_id)
      .single();
    created_by = profile ?? null;
  }

  return NextResponse.json({ ticket: { ...ticket, created_by } });
}

// ─── PATCH /api/tickets/[id] ──────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load existing ticket to check ownership and current status
  const { data: existing, error: fetchErr } = await admin
    .from("job_tickets")
    .select("id, created_by_id, ticket_status, ticket_kind, linked_lead_id, customer_id")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // ── Claim action: sales/admin can claim a routed ticket ────────────────────
  // Body: { ticket_status: "draft", claim_ownership: true }
  if (body.claim_ownership === true) {
    if (roleName !== "sales" && roleName !== "admin") {
      return NextResponse.json({ error: "Only Sales or Admin users can claim routed quotes.", code: "FORBIDDEN" }, { status: 403 });
    }
    if (existing.ticket_status !== "routed") {
      return NextResponse.json({ error: "Only routed quotes can be claimed.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: claimed, error: claimErr } = await admin
      .from("job_tickets")
      .update({ ticket_status: "draft", created_by_id: userId, updated_at: now })
      .eq("id", id)
      .select()
      .single();

    if (claimErr) {
      return NextResponse.json({ error: claimErr.message, code: "DB_ERROR" }, { status: 500 });
    }

    await admin.from("activities").insert({
      type: "order_ticket_status_changed",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: id,
      by_user_id: userId,
      payload: { from: "routed", to: "draft", action: "claimed" },
      created_at: now,
    });

    return NextResponse.json({ ticket: claimed });
  }

  // Normal update — enforce ownership (non-admins can only update their own tickets)
  if (roleName !== "admin" && existing.created_by_id !== userId) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  // Once a ticket is in 'order' status, only admins can modify it
  if (existing.ticket_status === "order" && roleName !== "admin") {
    return NextResponse.json(
      { error: "Ticket is locked in order status. Contact an admin.", code: "LOCKED" },
      { status: 403 }
    );
  }

  const ALLOWED_FIELDS = [
    "title",
    "ticket_status",
    "ticket_kind",
    "customer_id",
    "contact_name",
    "contact_email",
    "contact_company",
    "contact_phone",
    "quote_skus",
    "notes",
    "order_source",
    "priority",
    "due_date",
    "rush",
    "design_required",
    "die_cut",
    "special_requirements",
    "quote_channel",
    "quote_destination",
    "quote_subtotal",
    "quote_shipping",
    "discount_type",
    "discount_value",
    "discount_reason",
    "quote_pre_tax_total",
    "quote_tax_rate_percent",
    "quote_tax_amount",
    "quote_final_total",
    "tax_exempt",
    "sales_permit_number",
    "quote_payment_types",
    "prepayment_type",
    "prepayment_value",
    "quote_reminder_date",
    "follow_up_cycles",
    "follow_up_frequency",
    "client_confirmed",
    "follow_up_at",
    "follow_up_completed",
    "quote_approval_last_requested_at",
  ];

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  const { data: updated, error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Log activity if ticket_status changed
  if ("ticket_status" in body && body.ticket_status !== existing.ticket_status) {
    await admin.from("activities").insert({
      type: "order_ticket_status_changed",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: id,
      by_user_id: userId,
      payload: { from: existing.ticket_status, to: body.ticket_status },
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ticket: updated });
}
