"use client";

import { StripeEvidencePanel, type StripeEvidenceFields } from "@/components/ui/stripe-evidence-panel";
import {
  DetailSection,
  DetailCollapsibleSection,
  DetailDataGrid,
  DetailDataCell,
} from "@/components/quotes/quote-detail/detail-layout-primitives";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { formatDateTime } from "@/lib/utils/format";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { paymentEvidenceTypeLabelForTicket } from "@/lib/utils/payment-evidence-type";
import type { PaymentEvidenceModeFields } from "@/lib/utils/payment-evidence-type";

export type StripePaymentDetailTicket = StripeEvidenceFields &
  PaymentEvidenceModeFields & {
    payment_evidence_reviewed_at?: string | null;
    payment_evidence_submitted_at?: string | null;
    payment_evidence_amount?: number | null;
    payment_amount_received?: number | null;
    payment_paid_at?: string | null;
  };

export function StripePaymentDetailSection({ ticket }: { ticket: StripePaymentDetailTicket }) {
  if (!ticket.stripe_payment_intent_id) return null;

  const evidencePending = isPaymentEvidencePending(ticket);
  const reviewedAt = ticket.payment_evidence_reviewed_at;
  const recordedAmount =
    ticket.payment_evidence_amount != null
      ? Number(ticket.payment_evidence_amount)
      : ticket.stripe_amount_cents != null
        ? ticket.stripe_amount_cents / 100
        : null;

  const reviewLabel = evidencePending
    ? "Awaiting accountant review"
    : reviewedAt
      ? `Confirmed · ${formatDateTime(reviewedAt)}`
      : "Recorded on ticket";

  const reviewColor = evidencePending
    ? "var(--color-warning-text-deep)"
    : "var(--color-success)";

  return (
    <DetailSection>
      <DetailCollapsibleSection title="Stripe card payment" defaultOpen>
        <p
          className="text-xs leading-relaxed mb-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          Customer paid by card on the public quote link. Verify the charge in Stripe before marking this order complete.
        </p>
        <DetailDataGrid>
          <DetailDataCell label="CRM review" value={reviewLabel} valueColor={reviewColor} />
          <DetailDataCell
            label="Payment type"
            value={paymentEvidenceTypeLabelForTicket(ticket)}
          />
          {recordedAmount != null && (
            <DetailDataCell
              label="Amount on ticket"
              value={formatCurrency(recordedAmount)}
              valueColor="var(--color-success)"
            />
          )}
          {ticket.payment_evidence_submitted_at && (
            <DetailDataCell
              label="Submitted"
              value={formatDateTime(ticket.payment_evidence_submitted_at)}
            />
          )}
        </DetailDataGrid>
        <div className="mt-4">
          <StripeEvidencePanel ticket={ticket} />
        </div>
      </DetailCollapsibleSection>
    </DetailSection>
  );
}
