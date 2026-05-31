import type { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";
import {
  listRefundablePaymentSlots,
  type RefundableSlotTicket,
  type TicketRefundRow,
} from "@/lib/payments/refundable-payment-slots";

type AdminClient = ReturnType<typeof createAdminClient>;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const TICKET_REFUND_SELECT = `
  id, quote_final_total, payment_amount_received, payment_paid_at, deposit_paid_at,
  deposit_amount, deposit_method, balance_paid_at, payment_status, payment_method_used,
  ticket_payment_strategy, stripe_payment_intent_id, stripe_amount_cents,
  stripe_amount_refunded_cents, payment_evidence_reviewed_at,
  linked_lead_id, customer_id, total_refunded_amount, refund_status
`.trim();

export interface ApplyTicketRefundInput {
  ticketId: string;
  paymentMode: PaymentEvidenceMode;
  amountDollars: number;
  refundMethod: string;
  source: "stripe" | "manual";
  reason: string;
  notes?: string | null;
  evidencePath?: string | null;
  stripeRefundId?: string | null;
  byUserId: string;
}

export interface ApplyTicketRefundResult {
  ok: boolean;
  error?: string;
  refundId?: string;
  amountCents?: number;
}

export async function fetchTicketRefunds(
  admin: AdminClient,
  ticketId: string,
): Promise<TicketRefundRow[]> {
  const { data } = await admin
    .from("ticket_payment_refunds")
    .select("payment_mode, amount")
    .eq("ticket_id", ticketId);
  return (data ?? []) as TicketRefundRow[];
}

function computeOrderRefundStatus(
  newReceived: number,
  totalRefunded: number,
): "none" | "partial" | "full" {
  if (totalRefunded <= 0.01) return "none";
  if (newReceived <= 0.01) return "full";
  return "partial";
}

export async function applyTicketRefund(
  admin: AdminClient,
  input: ApplyTicketRefundInput,
): Promise<ApplyTicketRefundResult> {
  const { data: row, error: fetchErr } = await admin
    .from("job_tickets")
    .select(TICKET_REFUND_SELECT)
    .eq("id", input.ticketId)
    .single();

  if (fetchErr || !row) {
    return { ok: false, error: "Ticket not found." };
  }

  const ticket = row as unknown as RefundableSlotTicket & {
    quote_final_total: number | null;
    payment_amount_received: number | null;
    total_refunded_amount: number | null;
    stripe_amount_refunded_cents: number | null;
    payment_paid_at: string | null;
    linked_lead_id: string | null;
    customer_id: string | null;
  };

  const priorRefunds = await fetchTicketRefunds(admin, input.ticketId);
  const slots = listRefundablePaymentSlots(ticket, priorRefunds);
  const slot = slots.find((s) => s.mode === input.paymentMode);

  if (!slot) {
    return { ok: false, error: "This payment is not available to refund." };
  }

  if (input.source === "stripe" && slot.refundChannel !== "stripe") {
    return { ok: false, error: "This payment must be refunded manually in the CRM." };
  }

  if (input.source === "manual" && slot.refundChannel === "stripe") {
    return { ok: false, error: "Card payments must be refunded through Stripe." };
  }

  const amount = Math.round(Number(input.amountDollars) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid refund amount." };
  }
  if (amount > slot.maxRefundable + 0.001) {
    return {
      ok: false,
      error: `Amount cannot exceed ${slot.maxRefundable.toFixed(2)} for this payment.`,
    };
  }

  const refundCents = Math.round(amount * 100);
  const now = new Date().toISOString();
  const quoteTotal = Number(ticket.quote_final_total ?? 0);
  const alreadyPaid = Number(ticket.payment_amount_received ?? 0);
  const newReceived = Math.max(0, Math.round((alreadyPaid - amount) * 100) / 100);
  const orderFullyPaid = newReceived >= quoteTotal - 0.01;
  const priorTotalRefunded = Number(ticket.total_refunded_amount ?? 0);
  const newTotalRefunded = Math.round((priorTotalRefunded + amount) * 100) / 100;

  const { data: ledgerRow, error: ledgerErr } = await admin
    .from("ticket_payment_refunds")
    .insert({
      ticket_id: input.ticketId,
      amount,
      payment_mode: input.paymentMode,
      method: input.refundMethod,
      source: input.source,
      stripe_refund_id: input.stripeRefundId ?? null,
      reason: input.reason,
      notes: input.notes?.trim() || null,
      evidence_path: input.evidencePath ?? null,
      refunded_by_id: input.byUserId,
      created_at: now,
    })
    .select("id")
    .single();

  if (ledgerErr || !ledgerRow) {
    console.error("[apply-ticket-refund] ledger insert failed:", ledgerErr);
    return { ok: false, error: "Failed to record refund." };
  }

  const patch: Record<string, unknown> = {
    updated_at: now,
    payment_amount_received: newReceived,
    total_refunded_amount: newTotalRefunded,
    last_refunded_at: now,
    last_refunded_by_id: input.byUserId,
    refund_status: computeOrderRefundStatus(newReceived, newTotalRefunded),
    stripe_last_refund_reason: input.reason,
    stripe_last_refund_notes: input.notes?.trim() || null,
    stripe_last_refunded_at: now,
  };

  if (input.source === "stripe") {
    patch.stripe_amount_refunded_cents =
      Number(ticket.stripe_amount_refunded_cents ?? 0) + refundCents;
  }

  if (orderFullyPaid && !ticket.payment_paid_at) {
    patch.payment_paid_at = now;
    patch.payment_status = "paid";
  } else if (newReceived > 0.01) {
    patch.payment_status = "partial";
    patch.payment_paid_at = null;
  } else {
    patch.payment_status = "unpaid";
    patch.payment_paid_at = null;
    patch.balance_paid_at = null;
    patch.deposit_paid_at = null;
  }

  const slotFullyRefunded = amount >= slot.maxRefundable - 0.001;
  if (input.paymentMode === "deposit" && slotFullyRefunded) {
    patch.deposit_amount = null;
    patch.deposit_method = null;
    patch.deposit_paid_at = null;
  }
  if (
    (input.paymentMode === "balance" || input.paymentMode === "full") &&
    slotFullyRefunded
  ) {
    patch.balance_paid_at = null;
    if (input.paymentMode === "full" || newReceived <= 0.01) {
      patch.payment_method_used = null;
    }
  }

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", input.ticketId);

  if (updateErr) {
    console.error("[apply-ticket-refund] ticket update failed:", updateErr);
    return {
      ok: false,
      error:
        input.source === "stripe"
          ? "Refund succeeded in Stripe but CRM update failed. Check Stripe Dashboard."
          : "Refund was recorded but ticket update failed.",
      refundId: input.stripeRefundId ?? ledgerRow.id,
      amountCents: refundCents,
    };
  }

  const slotRemaining = roundMoney(slot.maxRefundable - amount);
  await admin.from("activities").insert({
    type: "ticket_payment_refund",
    lead_id: ticket.linked_lead_id ?? null,
    customer_id: ticket.customer_id ?? null,
    ticket_id: input.ticketId,
    by_user_id: input.byUserId,
    payload: {
      refund_ledger_id: ledgerRow.id,
      stripe_refund_id: input.stripeRefundId ?? null,
      amount,
      amount_cents: refundCents,
      payment_mode: input.paymentMode,
      refund_method: input.refundMethod,
      source: input.source,
      reason: input.reason,
      notes: input.notes ?? null,
      slot_refund_type: slotFullyRefunded ? "full" : "partial",
      order_refund_status: patch.refund_status,
      new_payment_amount_received: newReceived,
      slot_remaining: slotRemaining,
    },
    created_at: now,
  });

  return {
    ok: true,
    refundId: input.stripeRefundId ?? ledgerRow.id,
    amountCents: refundCents,
  };
}
