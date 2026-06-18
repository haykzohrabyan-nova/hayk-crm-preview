/** Warn before cancel when money was refunded but the order is not fully refunded. */
export function shouldWarnPartialRefundBeforeCancel(ticket: {
  refund_status?: string | null;
  ticket_status?: string | null;
}): boolean {
  if (ticket.ticket_status === "cancelled") return false;
  return ticket.refund_status === "partial";
}

export function canStaffCancelTicket(
  roleName: string | null | undefined,
  ticket: { ticket_status: string },
): boolean {
  if (ticket.ticket_status === "cancelled") return false;
  return roleName === "admin" || roleName === "accountant" || roleName === "sales";
}
