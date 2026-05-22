import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT, type AutoReleaseTicket } from "@/lib/utils/maybe-auto-release-production";
import { assignOrderReferenceCode } from "@/lib/utils/reference-codes";

// POST /api/public/quotes/[token]/confirm
// No auth required — customer clicks "Confirm & Accept" on the public quote page.
// Validates that the ticket is in "sent" status, then:
//   1. Sets client_confirmed = true
//   2. Sets ticket_status = "order" (auto-converts; Stripe payment will plug in here later)
//   3. Generates ORD-YYYY-NNN reference code via increment_order_sequence RPC
//   4. Net terms / gate-satisfied tickets auto-release to in_production
//   5. Logs activity entries

type Params = { params: Promise<{ token: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ticket, error: fetchErr } = await admin
    .from("job_tickets")
    .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
    .eq("public_token", token)
    .single();

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const row = ticket as unknown as AutoReleaseTicket;

  if (row.client_confirmed) {
    return NextResponse.json({
      ok: true,
      already_confirmed: true,
      reference_code: row.reference_code,
      in_production: row.ticket_status === "in_production",
    });
  }

  if (row.ticket_status !== "sent") {
    return NextResponse.json(
      { error: "This quote is no longer available for confirmation.", code: "INVALID_STATUS" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  let reference_code: string | null = row.reference_code;

  try {
    reference_code = await assignOrderReferenceCode(admin, reference_code);
  } catch {
    // proceed without ORD if sequence fails
  }

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      client_confirmed: true,
      ticket_status: "order",
      ticket_kind: "order",
      reference_code,
      updated_at: now,
    })
    .eq("id", row.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  await admin.from("activities").insert([
    {
      type: "ticket_client_confirmed",
      lead_id: row.linked_lead_id ?? null,
      customer_id: row.customer_id ?? null,
      ticket_id: row.id,
      by_user_id: null,
      payload: { via: "public_link", reference_code },
      created_at: now,
    },
    {
      type: "order_ticket_status_changed",
      lead_id: row.linked_lead_id ?? null,
      customer_id: row.customer_id ?? null,
      ticket_id: row.id,
      by_user_id: null,
      payload: { from: "sent", to: "order", via: "public_confirm", reference_code },
      created_at: now,
    },
  ]);

  if (row.linked_lead_id) {
    await admin
      .from("leads")
      .update({ sales_status: "Won", updated_at: now })
      .eq("id", row.linked_lead_id);
  }

  const releaseResult = await maybeAutoReleaseProduction(
    admin,
    { ...row, client_confirmed: true, ticket_status: "order", reference_code },
    now,
    { via: "public_confirm" },
  );

  return NextResponse.json({
    ok: true,
    reference_code: releaseResult.reference_code ?? reference_code,
    in_production: releaseResult.released,
  });
}
