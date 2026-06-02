import { createAdminClient } from "@/lib/supabase/admin";

const QUOTE_REF_RE = /^QUO-\d{4}-\d{4}$/i;
const ORDER_REF_RE = /^ORD-\d{4}-\d{3}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isQuoteReferenceCode(value: string): boolean {
  return QUOTE_REF_RE.test(value);
}

export function isOrderReferenceCode(value: string): boolean {
  return ORDER_REF_RE.test(value);
}

export function isTicketReferenceCode(value: string): boolean {
  return isQuoteReferenceCode(value) || isOrderReferenceCode(value);
}

/** Align ticket_kind with QUO-* / ORD-* when reference is set; otherwise keep fallback. */
export function ticketKindForReference(
  referenceCode: string | null | undefined,
  fallbackKind: string | null | undefined,
): "quote" | "order" | null {
  const ref = referenceCode?.trim().toUpperCase() ?? "";
  if (ref.startsWith("QUO-")) return "quote";
  if (ref.startsWith("ORD-")) return "order";
  if (fallbackKind === "quote" || fallbackKind === "order") return fallbackKind;
  return null;
}

/** True for ORD-* (or ticket_kind order) — used for INVOICE label on public PDF/page even when status is cancelled. */
export function ticketIsOrderStage(ticket: {
  reference_code?: string | null;
  ticket_kind?: string | null;
}): boolean {
  return !ticketIsQuoteStage(ticket);
}

/** True while the ticket is still a quote (QUO-*), not a converted order (ORD-*). Reference wins over ticket_kind. */
export function ticketIsQuoteStage(ticket: {
  reference_code?: string | null;
  ticket_kind?: string | null;
}): boolean {
  const ref = ticket.reference_code?.trim();
  if (ref) {
    if (isQuoteReferenceCode(ref)) return true;
    if (isOrderReferenceCode(ref)) return false;
  }
  if (ticket.ticket_kind === "quote") return true;
  if (ticket.ticket_kind === "order") return false;
  return true;
}

export function normalizeTicketReference(value: string): string {
  return value.toUpperCase();
}

export function formatQuoteReference(year: number, seq: number): string {
  return `QUO-${year}-${String(seq).padStart(4, "0")}`;
}

export function formatOrderReference(year: number, seq: number): string {
  return `ORD-${year}-${String(seq).padStart(3, "0")}`;
}

/** Atomically increment the quote sequence counter for a year. */
export async function nextQuoteNumber(
  admin: ReturnType<typeof createAdminClient>,
  year: number,
): Promise<number> {
  const { data, error } = await admin.rpc("increment_quote_sequence", { p_year: year });
  if (error) throw new Error(error.message);
  return data as number;
}

/** Atomically increment the order sequence counter for a year. */
export async function nextOrderNumber(
  admin: ReturnType<typeof createAdminClient>,
  year: number,
): Promise<number> {
  const { data, error } = await admin.rpc("increment_order_sequence", { p_year: year });
  if (error) throw new Error(error.message);
  return data as number;
}

/** Assign ORD-YYYY-NNN when converting a quote to an order (replaces QUO-*). */
export async function assignOrderReferenceCode(
  admin: ReturnType<typeof createAdminClient>,
  currentReference: string | null,
): Promise<string | null> {
  if (currentReference && !currentReference.startsWith("QUO-")) {
    return currentReference;
  }
  const year = new Date().getFullYear();
  const seq = await nextOrderNumber(admin, year);
  return formatOrderReference(year, seq);
}

export function ticketLookupColumn(identifier: string): "id" | "reference_code" {
  if (isTicketReferenceCode(identifier)) return "reference_code";
  return "id";
}

export function ticketLookupValue(identifier: string): string {
  if (isTicketReferenceCode(identifier)) return normalizeTicketReference(identifier);
  return identifier;
}

/** Resolve a URL segment (UUID or QUO-/ORD- reference) to the ticket UUID. */
export async function resolveTicketId(
  admin: ReturnType<typeof createAdminClient>,
  identifier: string,
): Promise<string | null> {
  const column = ticketLookupColumn(identifier);
  const value = ticketLookupValue(identifier);

  const { data } = await admin
    .from("job_tickets")
    .select("id")
    .eq(column, value)
    .maybeSingle();

  return data?.id ?? null;
}

/** Preferred path segment for ticket detail URLs — reference code when available. */
export function ticketPathSegment(ticket: {
  reference_code?: string | null;
  id: string;
}): string {
  return ticket.reference_code ?? ticket.id;
}

export function quoteDetailPath(ticket: {
  reference_code?: string | null;
  id: string;
}): string {
  return `/quotes/${ticketPathSegment(ticket)}`;
}

/** Display fallback when reference_code is missing (legacy rows). */
export function ticketDisplayReference(
  ticket: { reference_code?: string | null; id: string },
): string {
  return ticket.reference_code ?? ticket.id.slice(0, 8).toUpperCase();
}

/** True when identifier looks like a reference code rather than a UUID. */
export function isUuidIdentifier(value: string): boolean {
  return UUID_RE.test(value);
}
