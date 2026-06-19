/** Whether submitted evidence is for deposit, balance, or full payment. */

import { computeDepositDueFromTicket, type TicketPaymentFields } from "@/lib/utils/invoice-payment-summary";

export type PaymentEvidenceMode = "deposit" | "balance" | "full";

export type PaymentEvidenceModeFields = TicketPaymentFields & {
  stripe_amount_cents?: number | null;
};

function evidenceAmountDollars(ticket: PaymentEvidenceModeFields): number | null {
  if (ticket.payment_evidence_amount != null) {
    return Number(ticket.payment_evidence_amount);
  }
  if (ticket.stripe_amount_cents != null) {
    return Number(ticket.stripe_amount_cents) / 100;
  }
  return null;
}

export function inferPaymentEvidenceMode(
  ticket: PaymentEvidenceModeFields,
): PaymentEvidenceMode {
  const strategy = ticket.ticket_payment_strategy ?? "full";

  if (strategy === "full" || strategy === "net") return "full";

  const total = Number(ticket.quote_final_total ?? 0);
  const received = Number(ticket.payment_amount_received ?? 0);
  const evidenceAmt = evidenceAmountDollars(ticket);

  const depositAlreadyPaid = !!ticket.deposit_paid_at || received > 0.01;
  if (depositAlreadyPaid) return "balance";

  if (evidenceAmt != null && total > 0) {
    if (evidenceAmt >= total - 0.01) return "full";
    const depositDue = computeDepositDueFromTicket(ticket);
    if (depositDue > 0 && evidenceAmt <= depositDue + 0.02) return "deposit";
    if (evidenceAmt > depositDue + 0.02) return "full";
  }

  return "deposit";
}

export const PAYMENT_EVIDENCE_TYPE_LABELS: Record<PaymentEvidenceMode, string> = {
  deposit: "Deposit",
  balance: "Balance",
  full: "Full payment",
};

export const PAYMENT_EVIDENCE_TYPE_DESCRIPTIONS: Record<PaymentEvidenceMode, string> = {
  deposit: "Prepayment due before production",
  balance: "Remaining balance after deposit",
  full: "Full order total",
};

export function paymentEvidenceTypeLabel(mode: PaymentEvidenceMode): string {
  return PAYMENT_EVIDENCE_TYPE_LABELS[mode];
}

export function paymentEvidenceTypeDescription(mode: PaymentEvidenceMode): string {
  return PAYMENT_EVIDENCE_TYPE_DESCRIPTIONS[mode];
}

export function paymentEvidenceTypeLabelForTicket(
  ticket: PaymentEvidenceModeFields,
): string {
  return paymentEvidenceTypeLabel(inferPaymentEvidenceMode(ticket));
}

/** Orders list / stats row — which payment is awaiting accountant confirm. */
export const PAYMENT_EVIDENCE_AWAITING_LABELS: Record<PaymentEvidenceMode, string> = {
  deposit: "Awaiting Deposit Confirmation",
  balance: "Awaiting Balance Confirmation",
  full: "Awaiting Full Payment Confirmation",
};

export function paymentEvidenceAwaitingConfirmationLabel(
  ticket: PaymentEvidenceModeFields,
): string {
  return PAYMENT_EVIDENCE_AWAITING_LABELS[inferPaymentEvidenceMode(ticket)];
}
