/** Shared US address helpers for company settings and ticket ship-to fields. */

export interface ShipToFields {
  ship_to_line1?: string | null;
  ship_to_line2?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_zip?: string | null;
}

export interface ShipToAddress extends ShipToFields {
  last_used_at?: string | null;
}

/** ZIP: 5 digits or ZIP+4 (90001 or 90001-1234) */
export function isValidZip(v: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(v.trim());
}

/** Strip anything that is not a digit or dash */
export function sanitizeZip(v: string): string {
  return v.replace(/[^\d-]/g, "").slice(0, 10);
}

export function trimOrNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t || null;
}

export function normalizeShipToKey(fields: ShipToFields): string | null {
  const line1 = trimOrNull(fields.ship_to_line1);
  const city = trimOrNull(fields.ship_to_city);
  const state = trimOrNull(fields.ship_to_state);
  const zip = trimOrNull(fields.ship_to_zip);
  if (!line1 || !city || !state || !zip) return null;
  return [line1, city, state, zip].join("|").toLowerCase();
}

export function hasShipToAddress(fields: ShipToFields): boolean {
  return Boolean(trimOrNull(fields.ship_to_line1));
}

export function formatShipToAddress(fields: ShipToFields): string | null {
  const line1 = trimOrNull(fields.ship_to_line1);
  if (!line1) return null;
  const line2 = trimOrNull(fields.ship_to_line2);
  const cityLine = [trimOrNull(fields.ship_to_city), trimOrNull(fields.ship_to_state), trimOrNull(fields.ship_to_zip)]
    .filter(Boolean)
    .join(", ");
  return [line1, line2, cityLine].filter(Boolean).join("\n");
}

export function formatShipToAddressInline(fields: ShipToFields): string | null {
  const multi = formatShipToAddress(fields);
  return multi ? multi.replace(/\n/g, ", ") : null;
}

export function validateShipToZip(zip: string | null | undefined): string | null {
  const trimmed = (zip ?? "").trim();
  if (!trimmed) return null;
  if (!isValidZip(trimmed)) return "Enter a valid ZIP (e.g. 90001 or 90001-1234)";
  return null;
}

export function validateShippingCharge(
  requiresShipping: boolean,
  quoteShipping: number | null | undefined,
): string | null {
  if (!requiresShipping) return null;
  const amount = quoteShipping ?? 0;
  if (amount <= 0) return "Shipping ($) is required when shipping is selected.";
  return null;
}

/** Infer shipping mode from flag or legacy quote_shipping charge. */
export function resolveRequiresShipping(ticket: {
  requires_shipping?: boolean | null;
  quote_shipping?: number | null;
}): boolean {
  return ticket.requires_shipping ?? (ticket.quote_shipping ?? 0) > 0;
}

/** Dedupe and sort address history from past tickets (newest first). */
export function dedupeShipToAddresses(
  rows: Array<ShipToFields & { updated_at?: string | null }>,
): ShipToAddress[] {
  const seen = new Set<string>();
  const out: ShipToAddress[] = [];

  for (const row of rows) {
    const key = normalizeShipToKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      ship_to_line1: trimOrNull(row.ship_to_line1),
      ship_to_line2: trimOrNull(row.ship_to_line2),
      ship_to_city: trimOrNull(row.ship_to_city),
      ship_to_state: trimOrNull(row.ship_to_state),
      ship_to_zip: trimOrNull(row.ship_to_zip),
      last_used_at: row.updated_at ?? null,
    });
  }

  return out;
}

/** Normalize ship-to payload for API persistence. Clears address when pickup. */
export function normalizeShipToPayload(
  requiresShipping: boolean,
  fields: ShipToFields,
): {
  requires_shipping: boolean;
  ship_to_line1: string | null;
  ship_to_line2: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
} {
  if (!requiresShipping) {
    return {
      requires_shipping: false,
      ship_to_line1: null,
      ship_to_line2: null,
      ship_to_city: null,
      ship_to_state: null,
      ship_to_zip: null,
    };
  }

  return {
    requires_shipping: true,
    ship_to_line1: trimOrNull(fields.ship_to_line1),
    ship_to_line2: trimOrNull(fields.ship_to_line2),
    ship_to_city: trimOrNull(fields.ship_to_city),
    ship_to_state: trimOrNull(fields.ship_to_state),
    ship_to_zip: trimOrNull(fields.ship_to_zip),
  };
}
