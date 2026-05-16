import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/public/quotes/[token]/confirm
// No auth required — customer clicks "Confirm & Accept" on the public quote page.
// Validates that the ticket is in "sent" status, then:
//   1. Sets client_confirmed = true
//   2. Sets ticket_status = "order" (auto-converts; Stripe payment will plug in here later)
//   3. Generates ORD-YYYY-NNN reference code via increment_order_sequence RPC
//   4. Logs an activity entry

type Params = { params: Promise<{ token: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find the ticket by public token
  const { data: ticket, error: fetchErr } = await admin
    .from("job_tickets")
    .select("id, ticket_status, client_confirmed, linked_lead_id, customer_id, reference_code, title")
    .eq("public_token", token)
    .single();

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  // Already confirmed
  if (ticket.client_confirmed) {
    return NextResponse.json({
      ok: true,
      already_confirmed: true,
      reference_code: ticket.reference_code,
    });
  }

  // Only "sent" tickets can be confirmed
  if (ticket.ticket_status !== "sent") {
    return NextResponse.json(
      { error: "This quote is no longer available for confirmation.", code: "INVALID_STATUS" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  // Generate order reference code ORD-YYYY-NNN
  const year = new Date().getFullYear();
  let reference_code: string | null = ticket.reference_code;

  if (!reference_code) {
    const { data: seq, error: seqErr } = await admin.rpc("increment_order_sequence", { p_year: year });
    if (!seqErr && seq) {
      reference_code = `ORD-${year}-${String(seq).padStart(3, "0")}`;
    }
  }

  // Update ticket: confirmed → order
  // Also update ticket_kind to "order" so the Quotes page (?kind=quote) excludes it.
  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      client_confirmed: true,
      ticket_status: "order",
      ticket_kind: "order",
      reference_code,
      updated_at: now,
    })
    .eq("id", ticket.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Log activity
  await admin.from("activities").insert({
    type: "order_ticket_status_changed",
    lead_id: ticket.linked_lead_id ?? null,
    customer_id: ticket.customer_id ?? null,
    ticket_id: ticket.id,
    by_user_id: null, // customer action, no CRM user
    payload: { from: "sent", to: "order", action: "client_confirmed" },
    created_at: now,
  });

  return NextResponse.json({ ok: true, reference_code });
}
