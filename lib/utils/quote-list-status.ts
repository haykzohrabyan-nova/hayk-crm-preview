import { isPaymentEvidencePending, isTaxExemptApprovalPending, type TicketPaymentFields } from "@/lib/utils/invoice-payment-summary";

export type QuoteListStatusTone =
  | "draft"
  | "sent"
  | "confirmed"
  | "awaiting_payment"
  | "approved"
  | "cancelled"
  | "routed";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)", label: "Draft" },
  sent:      { bg: "var(--color-info-bg)",    text: "var(--color-info-text)",    label: "Sent" },
  approved:  { bg: "var(--color-success-bg)", text: "var(--color-success)",      label: "Approved" },
  cancelled: { bg: "var(--color-danger-bg)",  text: "var(--color-danger)",       label: "Cancelled" },
  routed:    { bg: "var(--color-warning-bg)", text: "var(--color-warning)",      label: "Routed" },
};

export function quoteListStatus(ticket: TicketPaymentFields & {
  ticket_status: string;
  client_confirmed?: boolean | null;
  ticket_require_client_confirm?: boolean | null;
  tax_exempt?: boolean;
  sales_permit_storage_path?: string | null;
  sales_permit_reviewed_at?: string | null;
}): { label: string; tone: QuoteListStatusTone; bg: string; text: string } {
  const base = STATUS_STYLE[ticket.ticket_status] ?? STATUS_STYLE.draft;

  if (isTaxExemptApprovalPending(ticket)) {
    return {
      label: "Awaiting tax-exempt approval",
      tone: "awaiting_payment",
      bg: "var(--color-warning-bg)",
      text: "var(--color-warning-text-deep)",
    };
  }

  if (isPaymentEvidencePending(ticket)) {
    return {
      label: "Awaiting payment confirmation",
      tone:  "awaiting_payment",
      bg:    "var(--color-warning-bg)",
      text:  "var(--color-warning-text-deep)",
    };
  }

  const requireConfirm = ticket.ticket_require_client_confirm !== false;
  if (
    ticket.ticket_status === "sent" &&
    requireConfirm &&
    ticket.client_confirmed
  ) {
    return {
      label: "Confirmed — awaiting deposit",
      tone:  "confirmed",
      bg:    "var(--color-success-bg)",
      text:  "var(--color-success)",
    };
  }

  return { label: base.label, tone: ticket.ticket_status as QuoteListStatusTone, bg: base.bg, text: base.text };
}
