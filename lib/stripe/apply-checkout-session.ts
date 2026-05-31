import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computePublicPaymentDueAmount } from "@/lib/utils/invoice-payment-summary";
import { inferPaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";
import { notifyPublicQuoteUpdated } from "@/lib/integrations/notify-public-quote-updated";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ApplyStripeCheckoutResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  ticketId?: string;
}

export async function applyStripeCheckoutSession(
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<ApplyStripeCheckoutResult> {
  const ticketId = session.metadata?.ticket_id;
  if (!ticketId) {
    return { ok: false, error: "Missing ticket_id in session metadata." };
  }

  if (session.payment_status !== "paid") {
    return { ok: false, error: `Session payment_status is ${session.payment_status}.` };
  }

  const sessionId = session.id;
  if (!sessionId) {
    return { ok: false, error: "Missing session id." };
  }

  const { data: existing } = await admin
    .from("job_tickets")
    .select("id, stripe_checkout_session_id, public_token")
    .eq("id", ticketId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "Ticket not found." };
  }

  if (existing.stripe_checkout_session_id === sessionId) {
    return { ok: true, skipped: true, ticketId };
  }

  const { data: row, error: fetchErr } = await admin
    .from("job_tickets")
    .select(
      `id, public_token, reference_code, quote_final_total, ticket_payment_strategy,
       ticket_deposit_type, ticket_deposit_value, payment_amount_received, deposit_paid_at,
       payment_evidence_submitted_at, payment_evidence_reviewed_at, payment_evidence_url,
       stripe_payment_intent_id, linked_lead_id, customer_id`,
    )
    .eq("id", ticketId)
    .single();

  if (fetchErr || !row) {
    return { ok: false, error: "Ticket not found." };
  }

  const dueAmount = computePublicPaymentDueAmount(row);
  const amountTotalCents = session.amount_total ?? 0;
  const expectedCents = Math.round(dueAmount * 100);

  if (dueAmount <= 0.01) {
    return { ok: false, error: "No payment was due on this ticket." };
  }

  if (Math.abs(amountTotalCents - expectedCents) > 1) {
    return {
      ok: false,
      error: `Amount mismatch: Stripe ${amountTotalCents} cents, expected ${expectedCents}.`,
    };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  if (!paymentIntentId) {
    return { ok: false, error: "Missing payment_intent on session." };
  }

  let chargeId: string | null = null;
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let receiptUrl: string | null = null;

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
    const charge = pi.latest_charge;
    if (charge && typeof charge !== "string") {
      chargeId = charge.id;
      receiptUrl = charge.receipt_url ?? null;
      const card = charge.payment_method_details?.card;
      if (card) {
        cardBrand = card.brand ?? null;
        cardLast4 = card.last4 ?? null;
      }
    }
  } catch (err) {
    console.error("[stripe] paymentIntents.retrieve failed:", err);
  }

  const now = new Date().toISOString();
  const paymentMode =
    (session.metadata?.payment_mode as "deposit" | "balance" | "full" | undefined) ??
    inferPaymentEvidenceMode({
      quote_final_total: row.quote_final_total,
      ticket_payment_strategy: row.ticket_payment_strategy,
      ticket_deposit_type: row.ticket_deposit_type,
      ticket_deposit_value: row.ticket_deposit_value,
      payment_amount_received: row.payment_amount_received,
      deposit_paid_at: row.deposit_paid_at,
      payment_evidence_amount: dueAmount,
    });

  const customerEmail =
    session.customer_details?.email ?? session.customer_email ?? null;

  const patch: Record<string, unknown> = {
    updated_at: now,
    stripe_checkout_session_id: sessionId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    stripe_payment_status: session.payment_status,
    stripe_amount_cents: amountTotalCents,
    stripe_card_brand: cardBrand,
    stripe_card_last4: cardLast4,
    stripe_receipt_url: receiptUrl,
    stripe_customer_email: customerEmail,
    payment_method_used: "card",
    payment_evidence_submitted_at: now,
    payment_evidence_amount: dueAmount,
    payment_evidence_reviewed_at: null,
  };

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", ticketId);

  if (updateErr) {
    console.error("[stripe] ticket update failed:", updateErr);
    return { ok: false, error: "Failed to save Stripe payment evidence." };
  }

  await admin.from("activities").insert({
    type: "ticket_payment_evidence_submitted",
    lead_id: row.linked_lead_id ?? null,
    customer_id: row.customer_id ?? null,
    ticket_id: ticketId,
    by_user_id: null,
    payload: {
      via: "stripe",
      payment_mode: paymentMode,
      session_id: sessionId,
      payment_intent_id: paymentIntentId,
      charge_id: chargeId,
      amount_cents: amountTotalCents,
      amount: dueAmount,
      currency: session.currency ?? "usd",
      card_brand: cardBrand,
      card_last4: cardLast4,
      customer_email: customerEmail,
      receipt_url: receiptUrl,
    },
    created_at: now,
  });

  if (row.public_token) {
    notifyPublicQuoteUpdated(row.public_token);
  }

  return { ok: true, ticketId };
}
