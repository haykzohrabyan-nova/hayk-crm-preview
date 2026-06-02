/** Public customer document (portal + PDF) — order vs quote label and payment banners. */

import { hasPublicRefundNotice } from "@/lib/utils/public-quote-refund-state";
import {
  isPaymentEvidencePending,
  type PaymentEvidencePendingFields,
} from "@/lib/utils/payment-evidence-pending";
import type { InvoicePaymentSummary } from "@/lib/utils/invoice-payment-summary";

export { ticketIsOrderStage } from "@/lib/utils/reference-codes";

export function showPaymentEvidencePendingOnCustomerDocument(
  ticket: PaymentEvidencePendingFields & {
    ticket_status?: string | null;
    refund_status?: string | null;
  },
): boolean {
  if (ticket.ticket_status === "cancelled") return false;
  if (hasPublicRefundNotice(ticket.refund_status)) return false;
  return isPaymentEvidencePending(ticket);
}

/** Adjust summary so cancelled/refunded orders do not show "payment under review" on PDF/portal. */
export function customerDocumentPaymentSummary(
  summary: InvoicePaymentSummary,
  ticket: PaymentEvidencePendingFields & {
    ticket_status?: string | null;
    refund_status?: string | null;
  },
): InvoicePaymentSummary {
  if (showPaymentEvidencePendingOnCustomerDocument(ticket)) return summary;
  return {
    ...summary,
    evidencePending: false,
    submittedAmount: null,
  };
}

export type CustomerDocumentBanner =
  | "cancelled"
  | "cancelled_refunded_full"
  | "cancelled_refunded_partial"
  | "refunded_full"
  | "refunded_partial"
  | null;

/** Refund dollars to show on customer portal/PDF (cancelled+refunded → refund only; refunded-only → refund only). */
export function customerDocumentRefundAmount(ticket: {
  refund_status?: string | null;
  total_refunded_amount?: number | null;
}): number | null {
  if (!hasPublicRefundNotice(ticket.refund_status)) return null;
  const amount = Number(ticket.total_refunded_amount ?? 0);
  return amount > 0 ? amount : null;
}

/** Hide full quote totals / deposit / balance (use refund-only block or nothing instead). */
export function shouldHidePricingOnCustomerDocument(ticket: {
  ticket_status?: string | null;
  refund_status?: string | null;
  total_refunded_amount?: number | null;
}): boolean {
  if (customerDocumentRefundAmount(ticket) != null) return true;
  if (ticket.ticket_status === "cancelled") return true;
  return false;
}

export function customerDocumentBanner(ticket: {
  ticket_status?: string | null;
  refund_status?: string | null;
}): CustomerDocumentBanner {
  const refunded = hasPublicRefundNotice(ticket.refund_status);
  if (ticket.ticket_status === "cancelled" && refunded) {
    return ticket.refund_status === "full" ? "cancelled_refunded_full" : "cancelled_refunded_partial";
  }
  if (ticket.ticket_status === "cancelled") return "cancelled";
  if (ticket.refund_status === "full") return "refunded_full";
  if (ticket.refund_status === "partial") return "refunded_partial";
  return null;
}
