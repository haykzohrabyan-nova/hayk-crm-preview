import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchLookupCategories } from "@/lib/utils/fetch-lookup-categories";
import { fetchProductsCatalog } from "@/lib/utils/fetch-products-catalog";

type AdminClient = ReturnType<typeof createAdminClient>;

const PUBLIC_SETTINGS_SELECT =
  "default_tax_rate, high_value_threshold, rush_surcharge_percent, session_idle_timeout_minutes";

const EDIT_LOOKUP_CATEGORIES = [
  "lamination",
  "color_mode",
  "sides",
  "roll_direction",
  "finishing",
  "ticket_priority",
  "quote_channel",
  "ticket_payment",
  "follow_up_freq",
] as const;

const ACTION_LOOKUP_CATEGORIES = [
  "quote_cancel_reason",
  "order_cancel_reason",
  "payment_refund_reason",
] as const;

export type TicketFormBootstrapPayload = {
  company: { settings: Record<string, unknown> };
  lookups_edit: Record<string, unknown[]>;
  lookups_actions: Record<string, unknown[]>;
  products: unknown[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { payload: TicketFormBootstrapPayload; expiresAt: number } | null = null;

function splitLookups(all: Record<string, unknown[]>) {
  const lookups_edit: Record<string, unknown[]> = {};
  const lookups_actions: Record<string, unknown[]> = {};
  for (const cat of EDIT_LOOKUP_CATEGORIES) {
    if (all[cat]) lookups_edit[cat] = all[cat];
  }
  for (const cat of ACTION_LOOKUP_CATEGORIES) {
    if (all[cat]) lookups_actions[cat] = all[cat];
  }
  return { lookups_edit, lookups_actions };
}

/** Shared company + lookups + products — same for every ticket detail (server cache). */
export async function getTicketFormBootstrapPayload(
  admin: AdminClient,
): Promise<TicketFormBootstrapPayload> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.payload;
  }

  const allCategories = [
    ...EDIT_LOOKUP_CATEGORIES,
    ...ACTION_LOOKUP_CATEGORIES,
  ];

  const [companyRes, lookupsAll, products] = await Promise.all([
    admin.from("company_settings").select(PUBLIC_SETTINGS_SELECT).eq("id", 1).single(),
    fetchLookupCategories(admin, [...allCategories]),
    fetchProductsCatalog(admin),
  ]);

  if (companyRes.error) throw companyRes.error;

  const { lookups_edit, lookups_actions } = splitLookups(
    lookupsAll as Record<string, unknown[]>,
  );

  const payload: TicketFormBootstrapPayload = {
    company: { settings: (companyRes.data ?? {}) as Record<string, unknown> },
    lookups_edit,
    lookups_actions,
    products,
  };

  cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
  return payload;
}

export function clearTicketFormBootstrapServerCache() {
  cache = null;
}
