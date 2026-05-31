/** Shared rules for payment evidence (file upload or Stripe) awaiting accountant review. */

export interface PaymentEvidencePendingFields {
  payment_evidence_submitted_at?: string | null;
  payment_evidence_reviewed_at?: string | null;
  payment_evidence_url?: string | null;
  stripe_payment_intent_id?: string | null;
}

export function hasPaymentEvidenceSource(
  ticket: PaymentEvidencePendingFields,
): boolean {
  return !!ticket.payment_evidence_url || !!ticket.stripe_payment_intent_id;
}

export function isPaymentEvidencePending(
  ticket: PaymentEvidencePendingFields,
): boolean {
  return (
    !!ticket.payment_evidence_submitted_at &&
    !ticket.payment_evidence_reviewed_at &&
    hasPaymentEvidenceSource(ticket)
  );
}

/** PostgREST `.or()` — row has unreviewed evidence (file or Stripe). */
export const PAYMENT_EVIDENCE_PENDING_OR_FILTER =
  "and(payment_evidence_submitted_at.not.is.null,payment_evidence_reviewed_at.is.null,or(payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null))";

/** PostgREST `.or()` — row is not in pending-evidence state. */
export const PAYMENT_EVIDENCE_NOT_PENDING_OR_FILTER =
  "payment_evidence_submitted_at.is.null,payment_evidence_reviewed_at.not.is.null,and(payment_evidence_url.is.null,stripe_payment_intent_id.is.null)";
