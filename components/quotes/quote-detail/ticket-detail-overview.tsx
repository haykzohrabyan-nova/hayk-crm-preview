"use client";

import { PaymentDetailOverview } from "@/components/orders/payment-detail-overview";
import { ProductionDetailOverview } from "@/components/orders/production-detail-overview";
import { QuoteStageOverview } from "@/components/quotes/quote-detail/quote-stage-overview";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import type { SummaryTicket, PricingTicketFields } from "@/components/quotes/quote-detail/order-payment-summary";

type OverviewTicket = SummaryTicket &
  PricingTicketFields & {
    id: string;
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
  const canConfirmPayment = userRole === "accountant" || userRole === "admin";
  const showPaymentReview = context === "payment" || evidencePending;

  if (showPaymentReview) {
    return (
      <PaymentDetailOverview
        ticket={ticket}
        readOnly={!canConfirmPayment}
        defaultOpen={context === "payment"}
      />
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
