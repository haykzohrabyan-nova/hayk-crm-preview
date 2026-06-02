import type { createAdminClient } from "@/lib/supabase/admin";
import { ticketPathSegment } from "@/lib/utils/reference-codes";
import type { TicketLinePreviewPayload } from "@/lib/utils/fetch-ticket-line-preview";
import {
  fetchTicketLinePreviewBundlesBatch,
  lineItemsToDisplayRows,
} from "@/lib/utils/ticket-line-items";

type AdminClient = ReturnType<typeof createAdminClient>;

export type TicketRefRow = { id: string; reference_code?: string | null };

export function toTicketRefRows(
  rows: Array<{ id?: string; reference_code?: string | null }>,
): TicketRefRow[] {
  return rows
    .filter((r): r is { id: string; reference_code?: string | null } => typeof r.id === "string")
    .map((r) => ({ id: r.id, reference_code: r.reference_code ?? null }));
}

/** Three DB queries for all tickets on the page — used by list page-data (expand without extra API). */
export async function fetchTicketLinePreviewsBatch(
  admin: AdminClient,
  tickets: TicketRefRow[] | Array<{ id?: string; reference_code?: string | null }>,
): Promise<Record<string, TicketLinePreviewPayload>> {
  const refs = tickets.length > 0 && "id" in tickets[0] && typeof (tickets[0] as TicketRefRow).id === "string" && tickets.every((t) => typeof (t as TicketRefRow).id === "string")
    ? (tickets as TicketRefRow[])
    : toTicketRefRows(tickets as Array<{ id?: string; reference_code?: string | null }>);
  if (refs.length === 0) return {};

  const bundles = await fetchTicketLinePreviewBundlesBatch(
    admin,
    refs.map((t) => t.id),
  );

  const out: Record<string, TicketLinePreviewPayload> = {};
  for (const t of refs) {
    const lines = bundles.get(t.id) ?? [];
    out[t.id] = {
      line_items: lineItemsToDisplayRows(lines),
      ticket_ref: ticketPathSegment({
        id: t.id,
        reference_code: t.reference_code ?? null,
      }),
    };
  }
  return out;
}

export function attachLinePreviews<T extends Record<string, unknown>>(
  rows: T[],
  previews: Record<string, TicketLinePreviewPayload>,
): Array<T & { line_preview: TicketLinePreviewPayload }> {
  return rows.map((row) => {
    const id = typeof row.id === "string" ? row.id : "";
    const reference_code =
      typeof row.reference_code === "string" ? row.reference_code : null;
    return {
      ...row,
      line_preview:
        previews[id] ??
        ({
          line_items: [],
          ticket_ref: id
            ? ticketPathSegment({ id, reference_code })
            : "",
        } satisfies TicketLinePreviewPayload),
    };
  });
}
