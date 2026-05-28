import { isPaymentEvidencePending, type TicketPaymentFields } from "@/lib/utils/invoice-payment-summary";

export interface AdminCancelTicketFields extends TicketPaymentFields {
  ticket_status: string;
  payment_status?: "unpaid" | "partial" | "paid" | null;
}

/** True when any payment has been recorded or confirmed on the ticket. */
export function hasTicketPaymentReceived(ticket: AdminCancelTicketFields): boolean {
  if (ticket.payment_status === "partial" || ticket.payment_status === "paid") return true;
  if (ticket.deposit_paid_at || ticket.payment_paid_at) return true;
  const amountPaid = Number(ticket.payment_amount_received ?? ticket.deposit_amount ?? 0);
  return amountPaid > 0.009;
}

/** Admin may cancel open orders with no payment received (order or in_production). */
export function canAdminCancelTicket(ticket: AdminCancelTicketFields): boolean {
  if (!["order", "in_production"].includes(ticket.ticket_status)) return false;
  if (isPaymentEvidencePending(ticket)) return false;
  if (hasTicketPaymentReceived(ticket)) return false;
  return true;
}
