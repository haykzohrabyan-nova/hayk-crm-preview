import { hasPublicRefundNotice } from "@/lib/utils/public-quote-refund-state";

const OPEN_PAYMENT_STATUSES = new Set(["sent", "order", "in_production", "completed"]);

export function publicQuotePaymentBlockedResponse(ticket: {
  ticket_status: string;
  refund_status?: string | null;
}): { status: number; body: { error: string; code: string } } | null {
  if (!OPEN_PAYMENT_STATUSES.has(ticket.ticket_status)) {
    return {
      status: 400,
      body: { error: "This quote is not open for payment.", code: "INVALID_STATUS" },
    };
  }
  if (hasPublicRefundNotice(ticket.refund_status)) {
    return {
      status: 409,
      body: {
        error:
          "This order has a refund on file. Please contact your sales representative for assistance.",
        code: "REFUNDED",
      },
    };
  }
  return null;
}
