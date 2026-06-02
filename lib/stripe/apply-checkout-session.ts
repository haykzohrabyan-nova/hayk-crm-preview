import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computePublicPaymentDueAmount } from "@/lib/utils/invoice-payment-summary";
import { inferPaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";
import { notifyPublicQuoteUpdated } from "@/lib/integrations/notify-public-quote-updated";
import { maybeConvertQuoteToOrder } from "@/lib/utils/maybe-convert-quote-to-order";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT } from "@/lib/utils/maybe-auto-release-production";
import { markLinkedLeadWonOnProduction } from "@/lib/utils/mark-lead-won-on-production";
import { logTicketPaymentRecorded } from "@/lib/utils/log-ticket-payment-recorded";
import { sendPaymentConfirmed } from "@/lib/integrations/send-quote";

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
       balance_paid_at, payment_paid_at,
       payment_evidence_submitted_at, payment_evidence_reviewed_at, payment_evidence_url,
       stripe_payment_intent_id, linked_lead_id, customer_id,
       quote_channel, quote_destination, ticket_quote_channel, ticket_dest_email, ticket_dest_phone,
       client_confirmed, production_released_at`,
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

  // Compute updated payment totals
  const alreadyPaid = Number(row.payment_amount_received ?? 0);
  const quoteTotal  = Number(row.quote_final_total ?? 0);
  const newTotal    = Math.min(alreadyPaid + dueAmount, quoteTotal);
  const fullyPaid   = newTotal >= quoteTotal - 0.01;

  // Auto-approve Stripe payments — no accountant review required.
  // Set payment_evidence_reviewed_at immediately and update payment amounts,
  // mirroring the record_payment accountant flow.
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
    payment_evidence_reviewed_at: now, // auto-approve — no manual accountant step needed
    payment_evidence_amount: dueAmount,
    payment_amount_received: newTotal,
  };

  // Mode-specific payment timestamp fields
  if (paymentMode === "deposit" && !row.deposit_paid_at) {
    patch.deposit_amount  = dueAmount;
    patch.deposit_paid_at = now;
    patch.deposit_method  = "card";
  } else if (paymentMode === "balance" || paymentMode === "full") {
    patch.balance_paid_at = now;
  }

  if (fullyPaid && !row.payment_paid_at) {
    patch.payment_paid_at = now;
    patch.payment_status  = "paid";
  } else if (newTotal > 0.01 && !fullyPaid) {
    patch.payment_status = "partial";
  }

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", ticketId);

  if (updateErr) {
    console.error("[stripe] ticket update failed:", updateErr);
    return { ok: false, error: "Failed to save Stripe payment." };
  }

  // Log payment recorded activity (same event the dashboards/reports read)
  await logTicketPaymentRecorded(admin, {
    ticketId,
    leadId:    row.linked_lead_id ?? null,
    customerId: row.customer_id ?? null,
    byUserId:  null,
    mode:      paymentMode,
    method:    "card",
    amount:    dueAmount,
    newTotal,
    fullyPaid,
    via:       "public_payment",
    createdAt: now,
  });

  // Attempt quote → order conversion and production auto-release
  let productionReleased = false;
  try {
    const { data: freshRow } = await admin
      .from("job_tickets")
      .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
      .eq("id", ticketId)
      .single();

    if (freshRow) {
      await maybeConvertQuoteToOrder(
        admin,
        freshRow as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket,
        now,
        { byUserId: null, via: "stripe_auto_approve" },
      );

      const { data: afterConvert } = await admin
        .from("job_tickets")
        .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
        .eq("id", ticketId)
        .single();

      if (afterConvert) {
        const releaseResult = await maybeAutoReleaseProduction(
          admin,
          afterConvert as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket,
          now,
          { byUserId: null, via: "stripe_auto_approve" },
        );
        productionReleased = releaseResult.released;
      }
    }
  } catch (err) {
    console.error("[stripe] auto-release after payment failed:", err);
  }

  if (productionReleased) {
    await markLinkedLeadWonOnProduction(admin, row.linked_lead_id, now);
  }

  // Notify customer — fire-and-forget, same as accountant confirm flow
  if (row.reference_code && row.public_token) {
    try {
      const { data: companyRow } = await admin
        .from("company_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (companyRow) {
        sendPaymentConfirmed(
          {
            reference_code:   row.reference_code,
            public_token:     row.public_token,
            quote_channel:    row.quote_channel,
            quote_destination: row.quote_destination,
            customer:         null,
          },
          companyRow,
          {
            amountConfirmed: dueAmount,
            inProduction:    productionReleased || !!row.production_released_at,
            fullyPaid,
          },
        ).then((result) => {
          if (!result.ok) {
            console.error("[stripe] sendPaymentConfirmed failed:", result.error, { ticketId });
          }
        });

        await admin.from("activities").insert({
          type:        "ticket_payment_confirmed_sent",
          lead_id:     row.linked_lead_id ?? null,
          customer_id: row.customer_id ?? null,
          ticket_id:   ticketId,
          by_user_id:  null,
          payload: {
            amount:       dueAmount,
            in_production: productionReleased || !!row.production_released_at,
            fully_paid:   fullyPaid,
            via:          "stripe_auto_approve",
          },
          created_at: now,
        });
      }
    } catch (err) {
      console.error("[stripe] payment confirmed notification failed:", err);
    }
  }

  if (row.public_token) {
    notifyPublicQuoteUpdated(row.public_token);
  }

  return { ok: true, ticketId };
}
