/** Admin may cancel any quote/order that is not already cancelled. */
export function canAdminCancelTicket(ticket: { ticket_status: string }): boolean {
  return ticket.ticket_status !== "cancelled";
}
