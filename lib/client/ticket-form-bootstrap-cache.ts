import type { TicketFormBootstrapPayload } from "@/lib/utils/ticket-form-bootstrap-server-cache";

const STORAGE_KEY = "bazaar-ticket-form-bootstrap-v3";
const CLIENT_TTL_MS = 30 * 60 * 1000;

let memory: TicketFormBootstrapPayload | null = null;
let memoryExpires = 0;

function isUsableBootstrap(data: TicketFormBootstrapPayload): boolean {
  return data._cacheSource !== "quotes-partial";
}

function readStorage(): TicketFormBootstrapPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expires: number; data: TicketFormBootstrapPayload };
    if (parsed.expires > Date.now()) return parsed.data;
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

function writeStorage(data: TicketFormBootstrapPayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ expires: Date.now() + CLIENT_TTL_MS, data }),
    );
  } catch {
    /* quota — memory cache still works this session */
  }
}

/** Company + lookups + products — cached in tab after first detail or new-quote load. */
export async function getTicketFormBootstrap(): Promise<TicketFormBootstrapPayload> {
  if (memory && Date.now() < memoryExpires && isUsableBootstrap(memory)) return memory;

  const stored = readStorage();
  if (stored && isUsableBootstrap(stored)) {
    memory = stored;
    memoryExpires = Date.now() + CLIENT_TTL_MS;
    return stored;
  }

  const res = await fetch("/api/ticket-form-bootstrap", { credentials: "include" });
  const data = (await res.json()) as TicketFormBootstrapPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load form bootstrap");
  }

  const payload: TicketFormBootstrapPayload = { ...data, _cacheSource: "full" };
  memory = payload;
  memoryExpires = Date.now() + CLIENT_TTL_MS;
  writeStorage(payload);
  return payload;
}

export function seedTicketFormBootstrapCache(payload: TicketFormBootstrapPayload) {
  memory = payload;
  memoryExpires = Date.now() + CLIENT_TTL_MS;
  writeStorage(payload);
}

const EDIT_LOOKUP_CATEGORIES = [
  "lamination",
  "color_mode",
  "sides",
  "roll_direction",
  "finishing",
  "designer",
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

/** After `/api/quotes/form-bootstrap` — warms edit lookups; never replaces cancel/refund actions. */
export function seedTicketFormBootstrapFromQuotesBootstrap(d: {
  company: TicketFormBootstrapPayload["company"];
  lookups: Record<string, unknown[]>;
  products: unknown[];
}) {
  const existing = memory ?? readStorage();
  const lookups_edit: Record<string, unknown[]> = {};
  const lookups_actions: Record<string, unknown[]> = {
    ...(existing?.lookups_actions ?? {}),
  };
  for (const c of EDIT_LOOKUP_CATEGORIES) {
    if (d.lookups[c]) lookups_edit[c] = d.lookups[c];
  }
  for (const c of ACTION_LOOKUP_CATEGORIES) {
    if (d.lookups[c]) lookups_actions[c] = d.lookups[c];
  }
  const hasActionLookups = ACTION_LOOKUP_CATEGORIES.some((c) =>
    Array.isArray(lookups_actions[c]),
  );
  seedTicketFormBootstrapCache({
    company: d.company,
    lookups_edit,
    lookups_actions,
    products: d.products,
    _cacheSource: hasActionLookups ? "full" : "quotes-partial",
  });
}

export function clearTicketFormBootstrapClientCache() {
  memory = null;
  memoryExpires = 0;
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
