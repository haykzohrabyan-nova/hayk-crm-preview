import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatShipToAddress,
  hasShipToAddress,
  trimOrNull,
  validateShippingDestinationZips,
  type ShipToFields,
} from "@/lib/utils/address";

export interface TicketShippingDestinationRow {
  id: string;
  ticket_id: string;
  sort_order: number;
  shipping_amount: number;
  ship_to_line1: string | null;
  ship_to_line2: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
}

export interface ShippingDestinationInput {
  id?: string;
  shipping_amount?: number;
  ship_to_line1?: string | null;
  ship_to_line2?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_zip?: string | null;
}

/** Client form row — includes a stable key for React lists. */
export interface ShippingDestinationDraft extends ShipToFields {
  id: string;
  shipping_amount: number;
}

export function emptyShippingDestination(): ShippingDestinationDraft {
  return {
    id: crypto.randomUUID(),
    shipping_amount: 0,
    ship_to_line1: "",
    ship_to_line2: "",
    ship_to_city: "",
    ship_to_state: "",
    ship_to_zip: "",
  };
}

export function sumShippingAmounts(destinations: { shipping_amount?: number }[]): number {
  return destinations.reduce((sum, d) => sum + (Number(d.shipping_amount) || 0), 0);
}

export function destinationToShipToFields(d: ShippingDestinationDraft | ShippingDestinationInput): ShipToFields {
  return {
    ship_to_line1: d.ship_to_line1,
    ship_to_line2: d.ship_to_line2,
    ship_to_city: d.ship_to_city,
    ship_to_state: d.ship_to_state,
    ship_to_zip: d.ship_to_zip,
  };
}

/** Legacy columns on job_tickets — first destination with an address, else first row. */
export function primaryDestinationForLegacy(
  destinations: ShippingDestinationInput[],
): ShippingDestinationInput | null {
  if (!destinations.length) return null;
  return destinations.find((d) => hasShipToAddress(d)) ?? destinations[0];
}

export function buildLegacyShipToFromDestinations(
  requiresShipping: boolean,
  destinations: ShippingDestinationInput[],
): {
  requires_shipping: boolean;
  quote_shipping: number;
  ship_to_line1: string | null;
  ship_to_line2: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
} {
  if (!requiresShipping) {
    return {
      requires_shipping: false,
      quote_shipping: 0,
      ship_to_line1: null,
      ship_to_line2: null,
      ship_to_city: null,
      ship_to_state: null,
      ship_to_zip: null,
    };
  }

  const primary = primaryDestinationForLegacy(destinations);
  return {
    requires_shipping: true,
    quote_shipping: sumShippingAmounts(destinations),
    ship_to_line1: trimOrNull(primary?.ship_to_line1),
    ship_to_line2: trimOrNull(primary?.ship_to_line2),
    ship_to_city: trimOrNull(primary?.ship_to_city),
    ship_to_state: trimOrNull(primary?.ship_to_state),
    ship_to_zip: trimOrNull(primary?.ship_to_zip),
  };
}

export function rowToDraft(row: TicketShippingDestinationRow): ShippingDestinationDraft {
  return {
    id: row.id,
    shipping_amount: Number(row.shipping_amount) || 0,
    ship_to_line1: row.ship_to_line1 ?? "",
    ship_to_line2: row.ship_to_line2 ?? "",
    ship_to_city: row.ship_to_city ?? "",
    ship_to_state: row.ship_to_state ?? "",
    ship_to_zip: row.ship_to_zip ?? "",
  };
}

export function draftsFromLegacyTicket(ticket: {
  quote_shipping?: number | null;
  requires_shipping?: boolean | null;
  ship_to_line1?: string | null;
  ship_to_line2?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_zip?: string | null;
}): ShippingDestinationDraft[] {
  const requires =
    ticket.requires_shipping ??
    ((Number(ticket.quote_shipping) || 0) > 0 || hasShipToAddress(ticket));
  if (!requires) return [emptyShippingDestination()];

  return [
    {
      id: crypto.randomUUID(),
      shipping_amount: Number(ticket.quote_shipping) || 0,
      ship_to_line1: ticket.ship_to_line1 ?? "",
      ship_to_line2: ticket.ship_to_line2 ?? "",
      ship_to_city: ticket.ship_to_city ?? "",
      ship_to_state: ticket.ship_to_state ?? "",
      ship_to_zip: ticket.ship_to_zip ?? "",
    },
  ];
}

export async function fetchTicketShippingDestinations(
  admin: SupabaseClient,
  ticketId: string,
): Promise<TicketShippingDestinationRow[]> {
  const { data, error } = await admin
    .from("ticket_shipping_destinations")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TicketShippingDestinationRow[];
}

export async function syncTicketShippingDestinations(
  admin: SupabaseClient,
  ticketId: string,
  requiresShipping: boolean,
  destinations: ShippingDestinationInput[],
): Promise<void> {
  await admin.from("ticket_shipping_destinations").delete().eq("ticket_id", ticketId);

  if (!requiresShipping || !destinations.length) return;

  const rows = destinations.map((d, i) => ({
    ticket_id: ticketId,
    sort_order: i,
    shipping_amount: Number(d.shipping_amount) || 0,
    ship_to_line1: trimOrNull(d.ship_to_line1),
    ship_to_line2: trimOrNull(d.ship_to_line2),
    ship_to_city: trimOrNull(d.ship_to_city),
    ship_to_state: trimOrNull(d.ship_to_state),
    ship_to_zip: trimOrNull(d.ship_to_zip),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("ticket_shipping_destinations").insert(rows);
  if (error) throw error;
}

export type ShippingDestinationDisplayRow = {
  shipping_amount: number;
  ship_to_line1: string | null;
  ship_to_line2: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
};

/** Rows for overview / read-only UI — DB rows, else legacy ticket columns, else edit-state drafts. */
export function resolveTicketShippingDestinationsForDisplay(
  ticket: {
    shipping_destinations?: TicketShippingDestinationRow[];
    requires_shipping?: boolean | null;
    quote_shipping?: number | null;
    ship_to_line1?: string | null;
    ship_to_line2?: string | null;
    ship_to_city?: string | null;
    ship_to_state?: string | null;
    ship_to_zip?: string | null;
  },
  draftFallback?: ShippingDestinationDraft[],
): ShippingDestinationDisplayRow[] {
  if (ticket.shipping_destinations?.length) {
    return ticket.shipping_destinations.map((d) => ({
      shipping_amount: Number(d.shipping_amount) || 0,
      ship_to_line1: d.ship_to_line1,
      ship_to_line2: d.ship_to_line2,
      ship_to_city: d.ship_to_city,
      ship_to_state: d.ship_to_state,
      ship_to_zip: d.ship_to_zip,
    }));
  }

  const requires =
    ticket.requires_shipping ??
    ((Number(ticket.quote_shipping) || 0) > 0 || hasShipToAddress(ticket));

  if (draftFallback?.length && requires) {
    return draftFallback.map((d) => ({
      shipping_amount: Number(d.shipping_amount) || 0,
      ship_to_line1: trimOrNull(d.ship_to_line1),
      ship_to_line2: trimOrNull(d.ship_to_line2),
      ship_to_city: trimOrNull(d.ship_to_city),
      ship_to_state: trimOrNull(d.ship_to_state),
      ship_to_zip: trimOrNull(d.ship_to_zip),
    }));
  }

  if (!requires) return [];

  if (hasShipToAddress(ticket) || (Number(ticket.quote_shipping) || 0) > 0) {
    return [
      {
        shipping_amount: Number(ticket.quote_shipping) || 0,
        ship_to_line1: ticket.ship_to_line1 ?? null,
        ship_to_line2: ticket.ship_to_line2 ?? null,
        ship_to_city: ticket.ship_to_city ?? null,
        ship_to_state: ticket.ship_to_state ?? null,
        ship_to_zip: ticket.ship_to_zip ?? null,
      },
    ];
  }

  return [];
}

/** Multi-line Ship To for PDF / public page when several destinations exist. */
export function formatShippingDestinationsBlock(
  destinations: Array<ShipToFields & { shipping_amount?: number }>,
): string | null {
  const parts = destinations
    .map((d, i) => {
      const addr = formatShipToAddress(d);
      const amount = Number(d.shipping_amount) || 0;
      if (!addr && amount <= 0) return null;
      const header = destinations.length > 1 ? `Destination ${i + 1}` : null;
      const charge = amount > 0 ? `Shipping: $${amount.toFixed(2)}` : null;
      return [header, charge, addr].filter(Boolean).join("\n");
    })
    .filter(Boolean) as string[];

  return parts.length ? parts.join("\n\n") : null;
}

/** Fields for POST/PATCH ticket body (legacy columns + destinations array). */
export function shippingDestinationsToApiFields(
  requiresShipping: boolean,
  destinations: ShippingDestinationInput[],
): {
  requires_shipping: boolean;
  quote_shipping: number;
  ship_to_line1: string | null;
  ship_to_line2: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  shipping_destinations: ShippingDestinationInput[];
} {
  const legacy = buildLegacyShipToFromDestinations(requiresShipping, destinations);
  return {
    ...legacy,
    shipping_destinations: requiresShipping ? destinations : [],
  };
}

/** Resolve shipping from API body (destinations array or legacy single-address fields). */
export function resolveShippingFromRequest(body: Record<string, unknown>): {
  requiresShipping: boolean;
  legacy: ReturnType<typeof buildLegacyShipToFromDestinations>;
  destinations: ShippingDestinationInput[];
  zipError: string | null;
} {
  const requiresShipping = Boolean(body.requires_shipping);
  const parsed = parseShippingDestinationsFromBody(body.shipping_destinations);

  let destinations: ShippingDestinationInput[];
  if (parsed != null && parsed.length > 0) {
    destinations = parsed;
  } else if (parsed != null && parsed.length === 0) {
    destinations = [];
  } else if (requiresShipping) {
    destinations = [
      {
        shipping_amount: Number(body.quote_shipping) || 0,
        ship_to_line1: body.ship_to_line1 as string | undefined,
        ship_to_line2: body.ship_to_line2 as string | undefined,
        ship_to_city: body.ship_to_city as string | undefined,
        ship_to_state: body.ship_to_state as string | undefined,
        ship_to_zip: body.ship_to_zip as string | undefined,
      },
    ];
  } else {
    destinations = [];
  }

  const legacy = buildLegacyShipToFromDestinations(requiresShipping, destinations);
  const zipError = validateShippingDestinationZips(requiresShipping ? destinations : []);
  return { requiresShipping, legacy, destinations, zipError };
}

export function parseShippingDestinationsFromBody(raw: unknown): ShippingDestinationInput[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: typeof row.id === "string" ? row.id : undefined,
      shipping_amount: Number(row.shipping_amount) || 0,
      ship_to_line1: row.ship_to_line1 as string | undefined,
      ship_to_line2: row.ship_to_line2 as string | undefined,
      ship_to_city: row.ship_to_city as string | undefined,
      ship_to_state: row.ship_to_state as string | undefined,
      ship_to_zip: row.ship_to_zip as string | undefined,
    };
  });
}
