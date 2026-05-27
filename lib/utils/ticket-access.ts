/** Whether the session user may read a ticket (GET, PDF, print). Matches GET /api/tickets/[id]. */
export function canAccessTicket(
  ticket: {
    created_by_id: string | null;
    ticket_status: string;
    routed_by_id?: string | null;
  },
  userId: string,
  roleName: string,
): boolean {
  if (roleName === "admin" || roleName === "accountant") return true;

  const isRoutedForSales =
    ticket.ticket_status === "routed" &&
    (roleName === "sales" || roleName === "admin");

  if (ticket.created_by_id === userId) return true;
  if (
    roleName === "sdr" &&
    ticket.routed_by_id === userId &&
    ticket.ticket_status !== "completed"
  ) {
    return true;
  }
  if (isRoutedForSales) return true;

  return false;
}

/** Whether the session user may mutate a ticket (PATCH). */
export function canMutateTicket(
  ticket: { created_by_id: string | null },
  userId: string,
  roleName: string,
): boolean {
  if (roleName === "admin" || roleName === "accountant") return true;
  return ticket.created_by_id === userId;
}
