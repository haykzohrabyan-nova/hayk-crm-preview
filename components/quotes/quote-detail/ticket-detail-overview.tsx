"use client";

import { PaymentDetailOverview } from "@/components/orders/payment-detail-overview";
import { ProductionDetailOverview } from "@/components/orders/production-detail-overview";
import { QuoteStageOverview } from "@/components/quotes/quote-detail/quote-stage-overview";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";

interface OverviewTicket {
  id: string;
  reference_code: string | null;
  quote_final_total: number | null;
  payment_status: "unpaid" | "partial" | "paid" | null;
  payment_method_used: string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_amount: number | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  production_released_at: string | null;
  ticket_status: string;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  client_confirmed: boolean;
  public_token: string | null;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  ticket_dep_handling: "cash" | "gateway" | null;
  ticket_partial_channels: string[] | null;
  ticket_full_channels: string[] | null;
  ticket_require_client_confirm: boolean | null;
  ticket_net_terms_label: string | null;
}

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
  const isAccountant = userRole === "accountant" || userRole === "admin";
  const showPaymentReview = context === "payment" || (evidencePending && isAccountant);

  if (showPaymentReview) {
    return <PaymentDetailOverview ticket={ticket} />;
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
