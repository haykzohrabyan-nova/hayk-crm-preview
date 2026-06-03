import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { computePublicPaymentDueAmount } from "@/lib/utils/invoice-payment-summary";
import { inferPaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";
import { isPaymentEvidencePending } from "@/lib/utils/payment-evidence-pending";
import { publicQuotePaymentBlockedResponse } from "@/lib/utils/public-quote-payment-blocked";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";
import { resolveAppUrl } from "@/lib/utils/resolve-app-url";

type Params = { params: Promise<{ token: string }> };

/** Stripe USD minimum charge (cents). */
const MIN_CHARGE_CENTS = 50;

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "stripe-create-session");
  if (rateLimited) return rateLimited;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured." }, { status: 503 });
  }

  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("job_tickets")
    .select(
      `id, public_token, reference_code, title, ticket_status, contact_email,
       quote_final_total, client_confirmed, ticket_require_client_confirm,
       ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value,
       payment_amount_received, deposit_paid_at, payment_paid_at,
       payment_evidence_submitted_at, payment_evidence_reviewed_at,
       payment_evidence_url, stripe_payment_intent_id, refund_status`,
    )
    .eq("public_token", token)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const blocked = publicQuotePaymentBlockedResponse(row);
  if (blocked) {
    return NextResponse.json(blocked.body, { status: blocked.status });
  }

  const requireConfirm = row.ticket_require_client_confirm ?? true;
  if (requireConfirm && !row.client_confirmed) {
    return NextResponse.json(
      { error: "Please confirm the quote before paying.", code: "CONFIRM_REQUIRED" },
      { status: 409 },
    );
  }

  if (isPaymentEvidencePending(row)) {
    return NextResponse.json(
      { error: "A payment is already awaiting review. Please wait for confirmation." },
      { status: 409 },
    );
  }

  const dueAmount = computePublicPaymentDueAmount(row);
  if (dueAmount <= 0.01) {
    return NextResponse.json({ error: "No payment is due at this time." }, { status: 400 });
  }

  const paymentMode = inferPaymentEvidenceMode({
    quote_final_total: row.quote_final_total,
    ticket_payment_strategy: row.ticket_payment_strategy,
    ticket_deposit_type: row.ticket_deposit_type,
    ticket_deposit_value: row.ticket_deposit_value,
    payment_amount_received: row.payment_amount_received,
    deposit_paid_at: row.deposit_paid_at,
    payment_evidence_amount: dueAmount,
  });

  const modeLabel =
    paymentMode === "deposit" ? "Deposit"
    : paymentMode === "balance" ? "Balance"
    : "Full payment";

  const ref = row.reference_code ?? row.id.slice(0, 8);
  const origin = resolveAppUrl(request.nextUrl.origin);
  const successUrl = `${origin}/q/${token}?stripe=success`;
  const cancelUrl = `${origin}/q/${token}?stripe=cancel`;

  const amountCents = Math.round(dueAmount * 100);
  if (amountCents < MIN_CHARGE_CENTS) {
    return NextResponse.json(
      {
        error: `Card payments must be at least $${(MIN_CHARGE_CENTS / 100).toFixed(2)}. Please contact your sales representative.`,
      },
      { status: 400 },
    );
  }

  const productDescription = row.title?.trim() || undefined;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `${modeLabel} — ${ref}`,
              ...(productDescription ? { description: productDescription } : {}),
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: row.contact_email?.trim() || undefined,
      metadata: {
        ticket_id: row.id,
        public_token: token,
        payment_mode: paymentMode,
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start card payment." }, { status: 500 });
    }

    return NextResponse.json({ session_url: session.url });
  } catch (err) {
    console.error("[stripe/create-session]", err);
    const message =
      err instanceof Stripe.errors.StripeError
        ? err.message
        : "Could not start card payment.";
    const status =
      err instanceof Stripe.errors.StripeError && err.statusCode && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
