import { isPaymentEvidencePending, type TicketPaymentFields } from "@/lib/utils/invoice-payment-summary";

/** Display label + tone for rows on GET /api/orders/orders */

export type OrderListStatusTone =
  | "confirmed"
  | "converted"
  | "awaiting_confirmation"
  | "admin_override"
  | "in_production"
  | "cancelled";

export function orderListStatus(input: {
  ticket_status: string;
  client_confirmed?: boolean | null;
  confirmed_by_customer?: boolean;
  converted_by_name?: string | null;
  converted_by_admin?: boolean;
  require_client_confirm?: boolean | null;
  payment_evidence_url?: string | null;
  payment_evidence_submitted_at?: string | null;
  payment_paid_at?: string | null;
  deposit_paid_at?: string | null;
  payment_amount_received?: number | null;
  deposit_amount?: number | null;
}): { label: string; tone: OrderListStatusTone } {
  const { ticket_status } = input;

  if (ticket_status === "cancelled") {
    return { label: "Cancelled", tone: "cancelled" };
  }

  if (isPaymentEvidencePending(input as TicketPaymentFields)) {
    return {
      label: "Awaiting payment confirmation",
      tone: "awaiting_confirmation",
    };
  }

  if (ticket_status === "in_production") {
    return { label: "In Production", tone: "in_production" };
  }

  if (ticket_status === "order") {
    const confirmed =
      !!input.client_confirmed || !!input.confirmed_by_customer;

    const confirmRequired = input.require_client_confirm !== false;
    const adminName = input.converted_by_name?.trim() || "Admin";
    const confirmMissing = confirmRequired && !confirmed;
    const received = Number(input.payment_amount_received ?? input.deposit_amount ?? 0);
    const paymentMissing = !input.deposit_paid_at && !input.payment_paid_at && received <= 0.01;

    if (input.converted_by_admin && (confirmMissing || paymentMissing)) {
      if (confirmMissing && paymentMissing) {
        return {
          label: `${adminName} converted — confirm & payment missing`,
          tone: "admin_override",
        };
      }
      if (confirmMissing) {
        return {
          label: `${adminName} converted — confirm missing`,
          tone: "admin_override",
        };
      }
      return {
        label: `${adminName} converted — payment missing`,
        tone: "admin_override",
      };
    }

    if (confirmed) {
      return { label: "Confirmed by Customer", tone: "confirmed" };
    }

    const name = input.converted_by_name?.trim();
    if (name) {
      return { label: `Converted by ${name}`, tone: "converted" };
    }

    return { label: "Converted", tone: "converted" };
  }

  return { label: ticket_status, tone: "converted" };
}
