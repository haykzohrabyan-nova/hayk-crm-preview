import {
  canRecordRefund,
  listRefundablePaymentSlots,
  type RefundableSlotTicket,
  type TicketRefundRow,
} from "@/lib/payments/refundable-payment-slots";

export interface StripeRefundTicketFields {
  stripe_payment_intent_id?: string | null;
  stripe_amount_cents?: number | null;
  stripe_amount_refunded_cents?: number | null;
  payment_evidence_reviewed_at?: string | null;
}

export function stripeRefundableCents(ticket: StripeRefundTicketFields): number {
  const charged = Number(ticket.stripe_amount_cents ?? 0);
  const refunded = Number(ticket.stripe_amount_refunded_cents ?? 0);
  return Math.max(0, charged - refunded);
}

/** @deprecated Use canRecordRefund — kept for existing imports */
export function canProcessStripeRefund(
  ticket: StripeRefundTicketFields & RefundableSlotTicket,
  roleName: string | null,
  priorRefunds?: TicketRefundRow[],
): boolean {
  if (!canRecordRefund(ticket, priorRefunds, roleName)) return false;
  return listRefundablePaymentSlots(ticket, priorRefunds).some((s) => s.refundChannel === "stripe");
}

export { canRecordRefund, listRefundablePaymentSlots };
