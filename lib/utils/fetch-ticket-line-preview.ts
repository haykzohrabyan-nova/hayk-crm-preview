import type { createAdminClient } from "@/lib/supabase/admin";
import { canAccessTicket } from "@/lib/utils/ticket-access";
import { ticketLookupColumn, ticketLookupValue, ticketPathSegment } from "@/lib/utils/reference-codes";
import {
  fetchTicketLinesBundleForPreview,
  lineItemsToDisplayRows,
  type TicketLineDisplayRow,
} from "@/lib/utils/ticket-line-items";

type AdminClient = ReturnType<typeof createAdminClient>;

export type TicketLinePreviewPayload = {
  line_items: TicketLineDisplayRow[];
  /** URL segment for `/api/tickets/{ticket_ref}/files/...` (reference code or UUID). */
  ticket_ref: string;
};

export type TicketLinePreviewResult =
  | { ok: true; data: TicketLinePreviewPayload }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" };

const ACCESS_SELECT =
  "id, reference_code, created_by_id, routed_by_id, ticket_status";

export async function fetchTicketLinePreview(
  admin: AdminClient,
  rawId: string,
  userId: string,
  roleName: string | null,
): Promise<TicketLinePreviewResult> {
  const column = ticketLookupColumn(rawId);
  const value = ticketLookupValue(rawId);

  const { data: ticket, error } = await admin
    .from("job_tickets")
    .select(ACCESS_SELECT)
    .eq(column, value)
    .single();

  if (error || !ticket) return { ok: false, code: "NOT_FOUND" };

  if (!canAccessTicket(ticket, userId, roleName ?? "")) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const ticketId = ticket.id as string;
  const lines = await fetchTicketLinesBundleForPreview(admin, ticketId);
  const line_items = lineItemsToDisplayRows(lines);

  const ticket_ref = ticketPathSegment({
    id: ticketId,
    reference_code: ticket.reference_code as string | null,
  });

  return { ok: true, data: { line_items, ticket_ref } };
}
