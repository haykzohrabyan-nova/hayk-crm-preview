"use client";

import { PaymentDetailOverview } from "@/components/orders/payment-detail-overview";
import { ProductionDetailOverview } from "@/components/orders/production-detail-overview";
import { QuoteStageOverview } from "@/components/quotes/quote-detail/quote-stage-overview";
import { isPaymentEvidencePending, isTaxExemptApprovalPending } from "@/lib/utils/invoice-payment-summary";
import { TaxExemptReviewSection, type TaxExemptReviewTicket } from "@/components/orders/tax-exempt-review-section";
import { DetailSection } from "@/components/quotes/quote-detail/detail-layout-primitives";
import type { SummaryTicket, PricingTicketFields } from "@/components/quotes/quote-detail/order-payment-summary";

type OverviewTicket = SummaryTicket &
  PricingTicketFields & {
    id: string;
    reference_code?: string | null;
    tax_exempt?: boolean;
    sales_permit_number?: string | null;
    sales_permit_file_name?: string | null;
    sales_permit_storage_path?: string | null;
    sales_permit_reviewed_at?: string | null;
    sales_permit_reviewed_by?: { id: string; full_name: string | null } | null;
    quote_subtotal?: number | null;
    quote_shipping?: number | null;
    discount_type?: string | null;
    discount_value?: string | null;
    quote_tax_rate_percent?: number | null;
    quote_pre_tax_total?: number | null;
    quote_tax_amount?: number | null;
    priority: string | null;
    due_date: string | null;
    rush: boolean;
    public_token: string | null;
    ticket_quote_channel: "sms" | "email" | "both" | null;
    quote_channel: string | null;
  };

type DetailContext = "quote" | "order" | "production" | "payment" | "completed";

/** Top snapshot card — picks the right overview for the ticket stage. */
export function TicketDetailOverview({
  ticket,
  context,
  userRole,
  saving,
  onMarkComplete,
  completeNotice,
  completeNoticeIsWarning,
}: {
  ticket: OverviewTicket;
  context: DetailContext;
  userRole: string | null;
  saving: boolean;
  onMarkComplete: () => void;
  completeNotice?: string | null;
  completeNoticeIsWarning?: boolean;
}) {
  const evidencePending = isPaymentEvidencePending(ticket);
  const taxExemptPending = isTaxExemptApprovalPending(ticket);
  const canConfirmPayment = userRole === "accountant" || userRole === "admin";
  const showPaymentReview = context === "payment" || evidencePending;
  const showTaxExemptOnly = taxExemptPending && !showPaymentReview;

  if (showPaymentReview) {
    return (
      <PaymentDetailOverview
        ticket={ticket}
        readOnly={!canConfirmPayment}
        defaultOpen={context === "payment" || taxExemptPending}
        afterApprovePath={context === "payment" ? "/payments" : null}
      />
    );
  }

  if (showTaxExemptOnly) {
    return (
      <>
        <DetailSection>
          <TaxExemptReviewSection
            ticket={ticket as TaxExemptReviewTicket}
            readOnly={!canConfirmPayment}
            defaultOpen
            onApproved={() => window.location.reload()}
          />
        </DetailSection>
        {ticket.ticket_status === "in_production" || ticket.ticket_status === "completed" ? (
          <ProductionDetailOverview
            ticket={ticket}
            userRole={userRole}
            saving={saving}
            onMarkComplete={onMarkComplete}
            completeNotice={completeNotice}
            completeNoticeIsWarning={completeNoticeIsWarning}
          />
        ) : (
          <QuoteStageOverview ticket={ticket} />
        )}
      </>
    );
  }

  if (ticket.ticket_status === "in_production" || ticket.ticket_status === "completed") {
    return (
      <ProductionDetailOverview
        ticket={ticket}
        userRole={userRole}
        saving={saving}
        onMarkComplete={onMarkComplete}
        completeNotice={completeNotice}
        completeNoticeIsWarning={completeNoticeIsWarning}
      />
    );
  }

  return <QuoteStageOverview ticket={ticket} />;
}
