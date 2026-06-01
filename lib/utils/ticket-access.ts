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
  if (roleName === "admin") return true;

  if (roleName === "accountant") {
    const allowed = ["sent", "order", "in_production", "completed", "cancelled"];
    return allowed.includes(ticket.ticket_status);
  }

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

/** Whether the session user may mutate a ticket (PATCH) — owners and admins only. */
export function canMutateTicket(
  ticket: { created_by_id: string | null },
  userId: string,
  roleName: string,
): boolean {
  if (roleName === "admin") return true;
  return ticket.created_by_id === userId;
}

const PRE_MUTATE_ACTION_KEYS = new Set([
  "send_payment_reminder",
  "reminder_channel",
  "reminder_destination",
  "resend_invoice",
  "invoice_channel",
  "invoice_destination",
  "notify_revision",
  "claim_ownership",
]);

const ACCOUNTANT_PAYMENT_PATCH_KEYS = new Set([
  "record_payment",
  "payment_mode",
  "payment_method",
  "payment_amount",
  "receipt_id",
  "payment_status",
  "payment_amount_received",
  "payment_paid_at",
  "payment_method_used",
  "deposit_amount",
  "deposit_paid_at",
  "deposit_receipt_id",
  "deposit_method",
  "balance_paid_at",
  "production_released_at",
  "payment_evidence_url",
  "payment_evidence_submitted_at",
  "payment_evidence_reviewed_at",
  "payment_evidence_amount",
  "ticket_status",
  "cancel_reason",
  "cancel_notes",
  "acknowledge_outstanding_balance",
  "activity_by_role",
]);

/** Accountants may confirm payments, cancel, mark complete, or patch payment fields — not quote content. */
export function canAccountantMutateTicket(
  body: Record<string, unknown>,
  existing: { ticket_status: string },
): boolean {
  if (body.record_payment === true) return true;
  if (body.ticket_status === "cancelled" && existing.ticket_status !== "cancelled") return true;
  if (body.ticket_status === "completed" && existing.ticket_status === "in_production") return true;

  const keys = Object.keys(body).filter((k) => !PRE_MUTATE_ACTION_KEYS.has(k));
  if (keys.length === 0) return false;
  return keys.every((k) => ACCOUNTANT_PAYMENT_PATCH_KEYS.has(k));
}

/** PATCH gate: owner/admin, or accountant on allowed payment lifecycle actions. */
export function canPatchTicket(
  body: Record<string, unknown>,
  ticket: { created_by_id: string | null; ticket_status: string },
  userId: string,
  roleName: string,
): boolean {
  if (roleName === "accountant") return canAccountantMutateTicket(body, ticket);
  return canMutateTicket(ticket, userId, roleName);
}

/** Resend actions: admin on any ticket; others only on tickets they created. */
export function canResendTicketNotifications(
  ticket: { created_by_id: string | null },
  userId: string,
  roleName: string,
): boolean {
  if (roleName === "admin") return true;
  return ticket.created_by_id === userId;
}

/** Quote list / create APIs are not available to accountants. */
export function isAccountantQuoteWorkflowDenied(roleName: string): boolean {
  return roleName === "accountant";
}
