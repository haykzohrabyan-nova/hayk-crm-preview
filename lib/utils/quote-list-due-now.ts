/** Due-now amount for Quoted Requests list — partial deposit only. */

import { formatCurrency } from "@/lib/utils/ticket-math";
import { computeDepositDueFromTicket, type TicketPaymentFields } from "@/lib/utils/invoice-payment-summary";

export interface QuoteListDueNowFields extends TicketPaymentFields {
  prepayment_type?: string | null;
  prepayment_value?: string | null;
}

/** Deposit due now when partial payment is configured; otherwise null. */
export function getQuoteListDueNowAmount(ticket: QuoteListDueNowFields): number | null {
  const total = ticket.quote_final_total;
  if (total == null || total <= 0) return null;

  if (ticket.ticket_payment_strategy === "partial") {
    const depValue = ticket.ticket_deposit_value ?? 0;
    if (depValue <= 0) return null;
    const due = computeDepositDueFromTicket(ticket);
    return due > 0 ? due : null;
  }

  if (!ticket.ticket_payment_strategy) {
    const prepType = ticket.prepayment_type;
    if (prepType === "percent" || prepType === "fixed") {
      const val = parseFloat(ticket.prepayment_value ?? "0") || 0;
      if (val <= 0) return null;
      const due =
        prepType === "percent"
          ? Math.round(total * (val / 100) * 100) / 100
          : Math.round(Math.min(val, total) * 100) / 100;
      return due > 0 ? due : null;
    }
  }

  return null;
}

export function formatQuoteListDueNow(ticket: QuoteListDueNowFields): string {
  const amount = getQuoteListDueNowAmount(ticket);
  return amount != null ? formatCurrency(amount) : "—";
}
