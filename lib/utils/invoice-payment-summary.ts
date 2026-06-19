/** Shared payment breakdown for invoice PDF + public quote page. */

import {
  isPaymentEvidencePending,
  hasPaymentEvidenceSource,
} from "@/lib/utils/payment-evidence-pending";

export interface InvoicePaymentSummary {
  strategy: "full" | "partial" | "net";
  depositDue: number;
  depositPaidAmount: number;
  amountPaid: number;
  balanceDue: number;
  depositPaid: boolean;
  fullyPaid: boolean;
  evidencePending: boolean;
  submittedAmount: number | null;
  showSchedule: boolean;
}

export interface TicketPaymentFields {
  quote_final_total?: number | null;
  ticket_payment_strategy?: "full" | "partial" | "net" | null;
  ticket_deposit_type?: "percent" | "fixed" | null;
  ticket_deposit_value?: number | null;
  payment_amount_received?: number | null;
  deposit_amount?: number | null;
  deposit_paid_at?: string | null;
  payment_paid_at?: string | null;
  payment_evidence_url?: string | null;
  payment_evidence_submitted_at?: string | null;
  payment_evidence_amount?: number | null;
  payment_evidence_reviewed_at?: string | null;
  stripe_payment_intent_id?: string | null;
}

export function isTicketPaidInFull(
  ticket: TicketPaymentFields & { payment_status?: string | null },
): boolean {
  if (ticket.payment_status === "paid") return true;
  return computeInvoicePaymentSummary(ticket).fullyPaid;
}

export { isPaymentEvidencePending, hasPaymentEvidenceSource } from "@/lib/utils/payment-evidence-pending";
export {
  isTaxExemptApprovalPending,
  requiresTaxExemptAccountantReview,
  canMarkTicketCompleted,
} from "@/lib/utils/tax-exempt-approval";

/**
 * Amount already collected — prefers payment_amount_received, falls back to deposit_amount.
 * Use this instead of repeating the fallback chain inline across utility files.
 */
export function getAmountPaid(
  ticket: Pick<TicketPaymentFields, "payment_amount_received" | "deposit_amount">,
): number {
  return Number(ticket.payment_amount_received ?? ticket.deposit_amount ?? 0);
}

export function computeDepositDueFromTicket(ticket: TicketPaymentFields): number {
  const total    = Number(ticket.quote_final_total ?? 0);
  const strategy = ticket.ticket_payment_strategy ?? "full";
  if (strategy === "net") return 0;
  if (strategy === "partial") {
    const depType  = ticket.ticket_deposit_type ?? "percent";
    const depValue = ticket.ticket_deposit_value ?? 0;
    return depType === "percent"
      ? Math.round(total * (depValue / 100) * 100) / 100
      : Math.round(Math.min(depValue, total) * 100) / 100;
  }
  return total;
}

export function computeInvoicePaymentSummary(ticket: TicketPaymentFields): InvoicePaymentSummary {
  const strategy   = ticket.ticket_payment_strategy ?? "full";
  const total      = Number(ticket.quote_final_total ?? 0);
  const depositDue = computeDepositDueFromTicket(ticket);
  const amountPaid = Math.round(
    Number(ticket.payment_amount_received ?? ticket.deposit_amount ?? 0) * 100,
  ) / 100;
  const balanceDue = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
  const depositPaid =
    strategy === "partial" &&
    (!!ticket.deposit_paid_at || amountPaid >= depositDue - 0.01);
  const depositPaidAmount = depositPaid
    ? Number(ticket.deposit_amount ?? amountPaid)
    : 0;
  const evidencePending = isPaymentEvidencePending(ticket);
  const fullyPaid =
    !!ticket.payment_paid_at ||
    (total > 0 && amountPaid >= total - 0.01 && !evidencePending);

  const submittedAmount = evidencePending
    ? Math.round(Number(ticket.payment_evidence_amount ?? (strategy === "partial" ? depositDue : total)) * 100) / 100
    : null;

  return {
    strategy,
    depositDue,
    depositPaidAmount,
    amountPaid,
    balanceDue,
    depositPaid,
    fullyPaid,
    evidencePending,
    submittedAmount,
    showSchedule: strategy === "partial" && !fullyPaid && !evidencePending,
  };
}

/** Next amount due on the public payment link (deposit first, then balance; net = full balance). */
export function computePublicPaymentDueAmount(ticket: TicketPaymentFields): number {
  const summary = computeInvoicePaymentSummary(ticket);
  if (summary.fullyPaid || summary.evidencePending) return 0;

  const { depositDue, amountPaid, depositPaid, balanceDue, strategy } = summary;

  // Net terms: no upfront deposit; customer may pay the full invoice early or when due
  if (strategy === "net") {
    return balanceDue;
  }

  if (!depositPaid && strategy === "partial") {
    return Math.max(0, Math.round((depositDue - amountPaid) * 100) / 100);
  }
  return balanceDue;
}
