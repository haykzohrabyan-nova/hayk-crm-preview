import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { stripeRefundableCents } from "@/lib/stripe/refund-eligibility";
import { applyTicketRefund } from "@/lib/payments/apply-ticket-refund";
import type { PaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ProcessStripeRefundInput {
  ticketId: string;
  refundReason: string;
  refundNotes?: string | null;
  paymentMode: PaymentEvidenceMode;
  mode: "full" | "partial";
  amountDollars?: number;
  refundMethod?: string;
  evidencePath?: string | null;
  byUserId: string;
}

export interface ProcessStripeRefundResult {
  ok: boolean;
  error?: string;
  refundId?: string;
  amountCents?: number;
}

export async function processStripeRefund(
  admin: AdminClient,
  input: ProcessStripeRefundInput,
): Promise<ProcessStripeRefundResult> {
  const { data: row, error: fetchErr } = await admin
    .from("job_tickets")
    .select(
      `id, stripe_payment_intent_id, stripe_amount_cents, stripe_amount_refunded_cents,
       payment_evidence_reviewed_at`,
    )
    .eq("id", input.ticketId)
    .single();

  if (fetchErr || !row) {
    return { ok: false, error: "Ticket not found." };
  }

  if (!row.stripe_payment_intent_id) {
    return { ok: false, error: "No Stripe card payment on this ticket." };
  }

  if (!row.payment_evidence_reviewed_at) {
    return { ok: false, error: "Refund is only available after the card payment is confirmed." };
  }

  const refundableCents = stripeRefundableCents(row);
  if (refundableCents <= 0) {
    return { ok: false, error: "This payment has already been fully refunded on Stripe." };
  }

  let refundCents: number;
  if (input.mode === "full") {
    refundCents = refundableCents;
  } else {
    const dollars = Number(input.amountDollars);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      return { ok: false, error: "Enter a valid partial refund amount." };
    }
    refundCents = Math.round(dollars * 100);
    if (refundCents > refundableCents) {
      return {
        ok: false,
        error: `Amount cannot exceed ${(refundableCents / 100).toFixed(2)} USD charged on this card payment.`,
      };
    }
    if (refundCents < 1) {
      return { ok: false, error: "Partial refund must be at least $0.01." };
    }
  }

  const stripe = getStripe();
  let refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: row.stripe_payment_intent_id,
      amount: refundCents,
      metadata: {
        ticket_id: row.id,
        refund_reason: input.refundReason,
        payment_mode: input.paymentMode,
      },
    });
  } catch (err) {
    console.error("[stripe/refund]", err);
    const message = err instanceof Error ? err.message : "Stripe refund failed.";
    return { ok: false, error: message };
  }

  if (refund.status === "failed") {
    return { ok: false, error: "Stripe could not process this refund." };
  }

  return applyTicketRefund(admin, {
    ticketId: input.ticketId,
    paymentMode: input.paymentMode,
    amountDollars: refundCents / 100,
    refundMethod: input.refundMethod ?? "card",
    source: "stripe",
    reason: input.refundReason,
    notes: input.refundNotes,
    evidencePath: input.evidencePath,
    stripeRefundId: refund.id,
    byUserId: input.byUserId,
  });
}
