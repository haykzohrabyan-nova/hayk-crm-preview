import { isPaymentEvidencePending, type TicketPaymentFields } from "@/lib/utils/invoice-payment-summary";

/** Display label + tone for rows on GET /api/orders/orders */

export type OrderListStatusTone =
  | "confirmed"
  | "converted"
  | "awaiting_confirmation"
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
}): { label: string; tone: OrderListStatusTone } {
  const { ticket_status } = input;

  if (ticket_status === "in_production") {
    return { label: "In Production", tone: "in_production" };
  }

  if (ticket_status === "cancelled") {
    return { label: "Cancelled", tone: "cancelled" };
  }

  if (
    ticket_status === "order" &&
    isPaymentEvidencePending(input as TicketPaymentFields)
  ) {
    return {
      label: "Awaiting payment confirmation",
      tone: "awaiting_confirmation",
    };
  }

  if (ticket_status === "order") {
    const confirmed =
      !!input.client_confirmed || !!input.confirmed_by_customer;

    if (confirmed) {
      return { label: "Confirmed by Customer", tone: "confirmed" };
    }

    const confirmRequired = input.require_client_confirm !== false;
    if (confirmRequired && input.converted_by_admin) {
      const name = input.converted_by_name?.trim();
      return {
        label: name
          ? `Admin converted — customer confirm missing`
          : "Admin converted — confirm missing",
        tone: "awaiting_confirmation",
      };
    }

    const name = input.converted_by_name?.trim();
    if (name) {
      return { label: `Converted by ${name}`, tone: "converted" };
    }

    return { label: "Converted", tone: "converted" };
  }

  return { label: ticket_status, tone: "converted" };
}
