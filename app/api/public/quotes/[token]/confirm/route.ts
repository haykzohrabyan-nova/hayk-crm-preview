import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT, type AutoReleaseTicket } from "@/lib/utils/maybe-auto-release-production";
import { maybeConvertQuoteToOrder } from "@/lib/utils/maybe-convert-quote-to-order";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";
import { hasPublicRefundNotice } from "@/lib/utils/public-quote-refund-state";
import { notifyPublicQuoteUpdated } from "@/lib/integrations/notify-public-quote-updated";

// POST /api/public/quotes/[token]/confirm
// No auth required — customer clicks "Confirm & Accept" on the public quote page.
// Sets client_confirmed only; quote stays quote until payment (except net terms).

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "confirm");
  if (rateLimited) return rateLimited;

  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ticket, error: fetchErr } = await admin
    .from("job_tickets")
    .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " ") + ", refund_status")
    .eq("public_token", token)
    .single();

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const row = ticket as unknown as AutoReleaseTicket & { refund_status?: string | null };

  if (hasPublicRefundNotice(row.refund_status)) {
    return NextResponse.json(
      {
        error:
          "This order has a refund on file. Please contact your sales representative for assistance.",
        code: "REFUNDED",
      },
      { status: 409 },
    );
  }

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
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      client_confirmed: true,
      updated_at: now,
    })
    .eq("id", row.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  await admin.from("activities").insert({
    type:        "ticket_client_confirmed",
    lead_id:     row.linked_lead_id ?? null,
    customer_id: row.customer_id ?? null,
    ticket_id:   row.id,
    by_user_id:  null,
    payload:     { via: "public_link", reference_code: row.reference_code },
    created_at:  now,
  });

  const confirmedRow = { ...row, client_confirmed: true };

  // Net terms ($0 upfront): convert to order on confirm.
  const convertResult = await maybeConvertQuoteToOrder(admin, confirmedRow, now, {
    via: "public_confirm",
  });

  const postConvertRow = convertResult.converted
    ? { ...confirmedRow, ticket_status: "order", reference_code: convertResult.reference_code ?? row.reference_code }
    : confirmedRow;

  const releaseResult = await maybeAutoReleaseProduction(
    admin,
    postConvertRow,
    now,
    { via: "public_confirm" },
  );

  notifyPublicQuoteUpdated(token);

  return NextResponse.json({
    ok: true,
    reference_code: releaseResult.reference_code ?? convertResult.reference_code ?? row.reference_code,
    in_production: releaseResult.released,
    converted_to_order: convertResult.converted,
  });
}
