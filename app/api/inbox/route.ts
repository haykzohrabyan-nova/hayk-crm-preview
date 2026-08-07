// Unassigned Intake / Hot Leads inbox API (azat schema).
//  GET /api/inbox?limit=N
//
// Returns inbound that isn't tied to any rep yet, as HOT items to assign or
// convert, sorted OLDEST-WAITING FIRST:
//
//   1. Unassigned inbound comm_events — channel in (email|webform|ad_lead|sms|ig_dm),
//      direction='inbound', with NO owning rep (linked contact has null owner_id,
//      or contact_id is null). Each is run through lib/ai/extract-actions.ts for a
//      one-line summary + whether it's a deal signal.
//   2. Unclaimed leads — azat.leads with owner_id IS NULL and status still live
//      (not dropped/parked). azat.leads uses `owner_id` (the azat-schema analogue of
//      public.leads' sales_owner_id).
//
// Hotness/aging: `waited_ms` = now − (received_at | arrived_at | created_at).
//   > 2h  → heat 'hot'  (strong red)   |   ≤ 2h → heat 'warm' (lighter flag)
//
// PERF: contacts/orgs are fetched separately with .in() (the promote-actions /
// my-day "decorate" pattern) rather than a PostgREST embedded join — the join
// blew past the statement timeout on comm_events; the split runs in ~200ms.
//
// Auth: same requireSession + requirePageAccess("/inbox") gate as sibling routes.
// Reads go through the service-role azat-schema client (lib/azat/server.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { createAzatClient, type AzatClient } from "@/lib/azat/server";
import { extractActions } from "@/lib/ai/extract-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound channels that belong in the unassigned intake queue.
const INBOX_CHANNELS = ["email", "webform", "ad_lead", "sms", "ig_dm"] as const;
// Lead statuses that are dead — never surface these as "unclaimed / waiting".
const DEAD_LEAD_STATUSES = ["dropped", "parked"];
// > 2h waiting = strong-red hot.
const HOT_MS = 2 * 60 * 60 * 1000;
// Safety ceiling: how many candidates we pull / run extraction on per side.
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;
// Only look back this far — an unassigned inbound older than this is stale noise.
const LOOKBACK_DAYS = 30;

type CommRow = {
  id: string;
  channel: string;
  direction: string | null;
  contact_id: string | null;
  org_id: string | null;
  subject: string | null;
  body: string | null;
  meta: Record<string, unknown> | null;
  received_at: string;
};

type LeadRow = {
  id: string;
  contact_id: string | null;
  organization_id: string | null;
  status: string | null;
  channel: string | null;
  source: string | null;
  message: string | null;
  products: unknown;
  owner_id: string | null;
  arrived_at: string | null;
  created_at: string | null;
};

type ContactInfo = { name: string | null; owner_id: string | null; organization_id: string | null };

// Best-effort "from" identity when there is no linked contact: scan meta for the
// usual sender-ish keys, else fall back to the subject / first body line.
function metaFrom(meta: Record<string, unknown> | null): string | null {
  const m = meta ?? {};
  const keys = [
    "from_name", "from_email", "from_address", "from", "sender", "sender_name",
    "email", "contact_name", "name", "from_number", "phone", "handle", "ig_handle", "username",
  ];
  for (const k of keys) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// The text extract-actions should read (mirrors promote-actions' pickText, minus calls).
function pickText(row: CommRow): string {
  const meta = row.meta ?? {};
  const candidates = [
    row.body,
    typeof meta["transcript"] === "string" ? (meta["transcript"] as string) : null,
    typeof meta["call_summary"] === "string" ? (meta["call_summary"] as string) : null,
    row.subject,
  ];
  for (const c of candidates) {
    if (c && c.trim().length >= 12) return c.trim();
  }
  return (row.subject ?? row.body ?? "").trim();
}

function heatOf(waitedMs: number): "hot" | "warm" {
  return waitedMs > HOT_MS ? "hot" : "warm";
}

async function fetchContacts(db: AzatClient, ids: string[]): Promise<Map<string, ContactInfo>> {
  const out = new Map<string, ContactInfo>();
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (!clean.length) return out;
  const { data } = await db.from("contacts").select("id, name, owner_id, organization_id").in("id", clean);
  for (const c of (data ?? []) as ({ id: string } & ContactInfo)[]) {
    out.set(c.id, { name: c.name, owner_id: c.owner_id, organization_id: c.organization_id });
  }
  return out;
}

async function fetchOrgNames(db: AzatClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (!clean.length) return out;
  const { data } = await db.from("organizations").select("id, name").in("id", clean);
  for (const o of (data ?? []) as { id: string; name: string | null }[]) {
    if (o.name) out.set(o.id, o.name);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/inbox");
  if (deny) return deny;

  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, parseInt(req.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  const db = createAzatClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const now = Date.now();

  // ── Unassigned inbound comms (no embedded join — see PERF note).
  const commsP = db
    .from("comm_events")
    .select("id, channel, direction, contact_id, org_id, subject, body, meta, received_at")
    .eq("direction", "inbound")
    .in("channel", INBOX_CHANNELS as unknown as string[])
    .gte("received_at", sinceIso)
    .order("received_at", { ascending: true }) // oldest-waiting first
    .limit(MAX_LIMIT); // over-fetch a bit; owned-contact rows get filtered out below

  // ── Unclaimed leads (owner_id IS NULL, still live).
  const leadsP = db
    .from("leads")
    .select("id, contact_id, organization_id, status, channel, source, message, products, owner_id, arrived_at, created_at")
    .is("owner_id", null)
    .not("status", "in", `(${DEAD_LEAD_STATUSES.join(",")})`)
    .order("arrived_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  const [commsRes, leadsRes] = await Promise.all([commsP, leadsP]);
  if (commsRes.error) return NextResponse.json({ error: commsRes.error.message }, { status: 500 });
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });

  const commRows = (commsRes.data ?? []) as CommRow[];
  const leadRows = (leadsRes.data ?? []) as LeadRow[];

  // Resolve every referenced contact in one round-trip.
  const contactIds = [
    ...commRows.map((c) => c.contact_id),
    ...leadRows.map((l) => l.contact_id),
  ].filter(Boolean) as string[];
  const contacts = await fetchContacts(db, contactIds);

  // Keep only comms with NO owning rep: contact_id null OR contact.owner_id null.
  const unassignedComms = commRows
    .filter((c) => {
      if (!c.contact_id) return true;
      const ct = contacts.get(c.contact_id);
      return !ct?.owner_id;
    })
    .slice(0, limit);

  // Resolve org names for both sides in one pass.
  const orgIds: string[] = [];
  for (const c of unassignedComms) {
    const ct = c.contact_id ? contacts.get(c.contact_id) : undefined;
    if (ct?.organization_id) orgIds.push(ct.organization_id);
    if (c.org_id) orgIds.push(c.org_id);
  }
  for (const l of leadRows) {
    const ct = l.contact_id ? contacts.get(l.contact_id) : undefined;
    if (ct?.organization_id) orgIds.push(ct.organization_id);
    if (l.organization_id) orgIds.push(l.organization_id);
  }
  const orgName = await fetchOrgNames(db, orgIds);

  // ── Run extract-actions over comms (small concurrency, exactly like promote-actions).
  type CommOut = {
    id: string;
    type: "comm";
    channel: string;
    who: string;
    contact_id: string | null;
    lead_id: null;
    subject: string | null;
    summary: string;
    deal_signal: boolean;
    deal_reason: string | null;
    sentiment: string;
    waited_since: string;
    waited_ms: number;
    heat: "hot" | "warm";
  };
  const commOut: CommOut[] = [];
  const BATCH = 5;
  for (let i = 0; i < unassignedComms.length; i += BATCH) {
    const slice = unassignedComms.slice(i, i + BATCH);
    const extracted = await Promise.all(
      slice.map((c) => {
        const ct = c.contact_id ? contacts.get(c.contact_id) : undefined;
        return extractActions({
          text: pickText(c),
          channel: c.channel,
          direction: c.direction,
          contactName: ct?.name ?? null,
        }).then((r) => ({ c, r }));
      }),
    );
    for (const { c, r } of extracted) {
      const ct = c.contact_id ? contacts.get(c.contact_id) : undefined;
      const orgId = ct?.organization_id ?? c.org_id ?? null;
      const who =
        ct?.name ??
        (orgId ? orgName.get(orgId) ?? null : null) ??
        metaFrom(c.meta) ??
        (c.subject ? c.subject.slice(0, 60) : null) ??
        "Unknown sender";
      const waitedMs = now - new Date(c.received_at).getTime();
      commOut.push({
        id: c.id,
        type: "comm",
        channel: c.channel,
        who,
        contact_id: c.contact_id,
        lead_id: null,
        subject: c.subject,
        summary: r.headline,
        deal_signal: Boolean(r.deal?.detected),
        deal_reason: r.deal?.detected ? r.deal.reason || r.deal.product || null : null,
        sentiment: r.sentiment,
        waited_since: c.received_at,
        waited_ms: waitedMs,
        heat: heatOf(waitedMs),
      });
    }
  }

  // ── Leads → items.
  const leadOut = leadRows.map((l) => {
    const ct = l.contact_id ? contacts.get(l.contact_id) : undefined;
    const orgId = ct?.organization_id ?? l.organization_id ?? null;
    const who =
      ct?.name ??
      (orgId ? orgName.get(orgId) ?? null : null) ??
      "Unknown lead";
    const waitedSince = l.arrived_at ?? l.created_at ?? new Date(now).toISOString();
    const waitedMs = now - new Date(waitedSince).getTime();
    const products = Array.isArray(l.products) ? (l.products as unknown[]).filter(Boolean).join(", ") : null;
    const summary = l.message?.trim() || products || `New ${l.channel ?? l.source ?? "lead"} lead`;
    return {
      id: l.id,
      type: "lead" as const,
      channel: l.channel ?? l.source ?? "lead",
      who,
      contact_id: l.contact_id,
      lead_id: l.id,
      subject: null,
      summary: summary.slice(0, 160),
      // A lead with a product/message is itself a deal signal.
      deal_signal: Boolean(products || (l.message && l.message.trim().length > 0)),
      deal_reason: products || null,
      sentiment: "neutral",
      waited_since: waitedSince,
      waited_ms: waitedMs,
      heat: heatOf(waitedMs),
    };
  });

  // Merge + sort OLDEST-WAITING FIRST (largest waited_ms first).
  const items = [...commOut, ...leadOut].sort((a, b) => b.waited_ms - a.waited_ms);

  const hot = items.filter((i) => i.heat === "hot").length;
  return NextResponse.json({
    items,
    counts: {
      total: items.length,
      hot,
      warm: items.length - hot,
      comms: commOut.length,
      leads: leadOut.length,
    },
  });
}
