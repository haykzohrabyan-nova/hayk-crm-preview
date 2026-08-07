// Customer 360 API (azat schema) — everything about ONE contact for the detail page.
//
//   GET   /api/contact/[id]  → identity + owner + org + deals + quotes + orders +
//                              a unified communications timeline + a short AI brief.
//   PATCH /api/contact/[id]  → { owner_id } : assign / re-assign the contact's owner
//                              (owner_id must be a rep in the pool, or null to unclaim).
//   POST  /api/contact/[id]  → create a followup task (kind 'followup', due +24h) linked
//                              to this contact, assigned to a chosen rep (or the contact's
//                              owner / least-loaded rep when none is given).
//
// Auth: session + page access. The 360 opens from Missed Calls, Communications, Inbox,
// and the CRM/Sales boards, so we allow any of those page routes (admin bypasses).
// All reads/writes go through the service-role azat-schema client (lib/azat/server.ts),
// mirroring app/api/dev/promote-actions/route.ts and app/api/tasks/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requireAnyPageAccess } from "@/lib/auth/require-page-access";
import {
  createAzatClient,
  fetchRepLoad,
  leastLoadedRep,
  repName,
  prettyPhone,
  type AzatClient,
} from "@/lib/azat/server";
import { REPS, REP_NAME } from "@/lib/azat/reps";
import { extractActions } from "@/lib/ai/extract-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Page routes whose users may open a contact 360 (data gate; admin always passes).
const ALLOWED_PAGES = [
  "/crm",
  "/sales",
  "/leads",
  "/missed-calls",
  "/communications",
  "/inbox",
  "/tasks",
  "/my-day",
];

// Newest-first comms shown in the timeline.
const COMM_LIMIT = 200;
// How many recent substantive comms feed the AI brief (bounds OpenAI cost).
const BRIEF_SCAN = 3;
const REP_IDS = new Set(REPS.map((r) => r.id));

async function gate() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return { errorResponse } as const;
  const deny = await requireAnyPageAccess(userId!, roleName, ALLOWED_PAGES);
  if (deny) return { errorResponse: deny } as const;
  return { userId: userId!, roleName } as const;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ContactRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  ig_handle: string | null;
  authority: string | null;
  heat_tag: string | null;
  lifecycle: string | null;
  notes: string | null;
  organization_id: string | null;
  owner_id: string | null;
  created_at: string | null;
  last_activity_at: string | null;
};
type DealRow = {
  id: string;
  title: string | null;
  stage: string | null;
  value_cents: number | null;
  in_hands_date: string | null;
  owner_id: string | null;
  created_at: string | null;
  source_channel: string | null;
  returning_tag: boolean | null;
};
type CommRow = {
  id: string;
  channel: string | null;
  direction: string | null;
  subject: string | null;
  body: string | null;
  meta: Record<string, unknown> | null;
  received_at: string;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Best display name for a contact: real name → first+last → phone → email → "Unknown contact". */
function displayName(c: ContactRow): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return c.name?.trim() || full || prettyPhone(c.phone) || c.email || "Unknown contact";
}

/** The useful text of one comm for the timeline snippet + the AI brief. */
function commText(row: CommRow): string | null {
  const meta = row.meta ?? {};
  if ((row.channel ?? "").toLowerCase() === "call") {
    return str(meta["call_summary"]) ?? str(meta["transcript"]) ?? str(row.body);
  }
  return str(row.body) ?? str(meta["transcript"]) ?? str(meta["call_summary"]) ?? str(row.subject);
}

function money(cents: number | null | undefined): number {
  return Math.round((cents ?? 0));
}

// ── GET: the full 360 ───────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("errorResponse" in g) return g.errorResponse;

  const { id } = await params;
  const db = createAzatClient();

  const { data: contactData, error: cErr } = await db
    .from("contacts")
    .select(
      "id, name, first_name, last_name, email, phone, ig_handle, authority, heat_tag, lifecycle, notes, organization_id, owner_id, created_at, last_activity_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!contactData) return NextResponse.json({ error: "Contact not found.", code: "NOT_FOUND" }, { status: 404 });
  const contact = contactData as ContactRow;

  // Org, owner, deals, comms in parallel.
  const [orgRes, ownerRes, dealsRes, commsRes, tasksRes] = await Promise.all([
    contact.organization_id
      ? db.from("organizations").select("id, name").eq("id", contact.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contact.owner_id
      ? db.from("user_profiles").select("id, full_name").eq("id", contact.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("deals")
      .select("id, title, stage, value_cents, in_hands_date, owner_id, created_at, source_channel, returning_tag")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("comm_events")
      .select("id, channel, direction, subject, body, meta, received_at")
      .eq("contact_id", id)
      .order("received_at", { ascending: false })
      .limit(COMM_LIMIT),
    db.from("tasks").select("id, label, kind, due_at, owner_id").eq("contact_id", id).is("done_at", null),
  ]);

  const org = (orgRes.data as { id: string; name: string | null } | null) ?? null;
  const ownerProfile = (ownerRes.data as { id: string; full_name: string | null } | null) ?? null;
  const deals = (dealsRes.data ?? []) as DealRow[];
  const comms = (commsRes.data ?? []) as CommRow[];
  const openTasks = (tasksRes.data ?? []) as { id: string; label: string | null; kind: string | null; due_at: string | null; owner_id: string | null }[];

  // Quotes, orders, and payments all hang off the contact's deals (deal_id), not
  // the contact directly. Payments carry the real money (amount_cents + status),
  // so lifetime spend and the new-vs-returning read are derived from them.
  const dealIds = deals.map((d) => d.id);
  const [quotesRes, ordersRes, paymentsRes] = await Promise.all([
    dealIds.length
      ? db.from("quotes").select("id, deal_id, version, total_cents, status, created_at").in("deal_id", dealIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? db.from("orders").select("id, deal_id, reference_code, status, due_date, created_at").in("deal_id", dealIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? db.from("payments").select("id, deal_id, amount_cents, status, paid_at").in("deal_id", dealIds)
      : Promise.resolve({ data: [] }),
  ]);
  const quotes = (quotesRes.data ?? []) as { id: string; deal_id: string; version: number | null; total_cents: number | null; status: string | null; created_at: string | null }[];
  const ordersRaw = (ordersRes.data ?? []) as { id: string; deal_id: string; reference_code: string | null; status: string | null; due_date: string | null; created_at: string | null }[];
  const payments = (paymentsRes.data ?? []) as { id: string; deal_id: string; amount_cents: number | null; status: string | null; paid_at: string | null }[];

  // ── Customer history: lifetime spend + new-vs-returning ──────────────────────
  // Lifetime spend = every PAID payment across the contact's deals. If no paid
  // payments are recorded, fall back to the summed value of won deals so returning
  // customers still show a number. A deal's title/value labels each order (orders
  // themselves carry no amount column — they inherit their deal's contract value).
  const dealById = new Map(deals.map((d) => [d.id, d] as const));
  const paidCentsTotal = payments
    .filter((p) => (p.status ?? "").toLowerCase() === "paid")
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  const wonDeals = deals.filter((d) => (d.stage ?? "").toLowerCase() === "won");
  const wonValueTotal = wonDeals.reduce((sum, d) => sum + (d.value_cents ?? 0), 0);
  const lifetimeSpendCents = paidCentsTotal > 0 ? paidCentsTotal : wonValueTotal;
  const hasPaid = paidCentsTotal > 0;
  const isReturning = hasPaid || wonDeals.length > 0 || deals.some((d) => d.returning_tag === true);

  // Orders inherit their deal's title + contract value for a readable history row.
  const orders = ordersRaw.map((o) => {
    const parent = dealById.get(o.deal_id);
    return {
      ...o,
      amount_cents: money(parent?.value_cents ?? null),
      deal_title: parent?.title ?? null,
    };
  });

  // Owner label: user_profiles.full_name → rep pool name → null (Unclaimed handled by client).
  const ownerName = ownerProfile?.full_name?.trim() || repName(contact.owner_id) || null;

  const timeline = comms.map((c) => ({
    id: c.id,
    channel: (c.channel ?? "unknown").toLowerCase(),
    direction: (c.direction ?? "unknown").toLowerCase(),
    subject: str(c.subject),
    snippet: commText(c),
    received_at: c.received_at,
  }));

  const brief = await buildBrief(contact, deals, comms, openTasks.length);

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: displayName(contact),
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      pretty_phone: prettyPhone(contact.phone),
      ig_handle: contact.ig_handle,
      authority: contact.authority,
      heat_tag: contact.heat_tag,
      lifecycle: contact.lifecycle,
      notes: contact.notes,
      created_at: contact.created_at,
      last_activity_at: contact.last_activity_at,
    },
    org,
    owner: contact.owner_id ? { id: contact.owner_id, name: ownerName } : null,
    reps: REPS,
    deals: deals.map((d) => ({
      id: d.id,
      title: d.title,
      stage: d.stage,
      value_cents: money(d.value_cents),
      in_hands_date: d.in_hands_date,
      owner_name: repName(d.owner_id),
      created_at: d.created_at,
    })),
    quotes,
    orders,
    history: {
      is_returning: isReturning,
      lifetime_spend_cents: lifetimeSpendCents,
      order_count: orders.length,
      won_count: wonDeals.length,
      quote_count: quotes.length,
    },
    timeline,
    open_task_count: openTasks.length,
    brief,
  });
}

// ── AI brief ────────────────────────────────────────────────────────────────
// A short 3–4 bullet read of the relationship. Structured facts (who / history /
// next move) are always available; "what they want" is enriched by running the
// promise engine (extractActions) over the most recent substantive comm. Honest
// empty-state — returns { bullets: [] } when there is genuinely nothing to say.
async function buildBrief(
  contact: ContactRow,
  deals: DealRow[],
  comms: CommRow[],
  openTaskCount: number,
): Promise<{ stance: string; bullets: string[] }> {
  const bullets: string[] = [];
  const name = displayName(contact);

  // WHO
  const whoBits: string[] = [];
  if (contact.lifecycle) whoBits.push(contact.lifecycle);
  if (contact.heat_tag) whoBits.push(`${contact.heat_tag} lead`);
  if (contact.authority) whoBits.push(contact.authority);
  if (whoBits.length) bullets.push(`${name} — ${whoBits.join(", ")}.`);

  // WHAT THEY WANT — newest open deal, else the promise engine over the latest comm.
  const openDeal = deals.find((d) => d.stage && !["won", "lost"].includes(d.stage));
  let stance = "neutral";
  if (openDeal) {
    const val = openDeal.value_cents ? ` (~$${Math.round(openDeal.value_cents / 100).toLocaleString()})` : "";
    bullets.push(`Wants: ${openDeal.title ?? "an open deal"}${val} — currently at "${openDeal.stage}".`);
    stance = "active deal";
  } else {
    // Run the promise engine over the most recent substantive comm(s).
    const usable = comms.map((c) => ({ c, text: commText(c) })).filter((x) => x.text && x.text.length >= 12).slice(0, BRIEF_SCAN);
    if (usable.length) {
      try {
        const r = await extractActions({
          text: usable[0].text!,
          channel: usable[0].c.channel,
          direction: usable[0].c.direction,
          contactName: name,
        });
        stance = r.sentiment;
        if (r.headline) bullets.push(`Latest: ${r.headline}`);
        if (r.deal?.detected) bullets.push(`Opportunity: ${r.deal.product || "possible order"}${r.deal.amount ? ` (${r.deal.amount})` : ""}.`);
      } catch {
        /* brief is best-effort */
      }
    }
  }

  // HISTORY
  if (comms.length) {
    const last = comms[0];
    const when = last?.received_at ? new Date(last.received_at).toLocaleDateString() : null;
    const chan = str(last?.channel);
    bullets.push(
      `${comms.length} logged communication${comms.length === 1 ? "" : "s"}${when ? `; last was a ${chan ?? "touch"} on ${when}` : ""}.`,
    );
  }

  // NEXT MOVE
  if (openTaskCount > 0) {
    bullets.push(`${openTaskCount} open follow-up task${openTaskCount === 1 ? "" : "s"} already assigned.`);
  } else if (comms.length || deals.length) {
    bullets.push("No follow-up scheduled — assign a rep and create a task.");
  }

  return { stance, bullets };
}

// ── PATCH: assign / re-assign owner ───────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("errorResponse" in g) return g.errorResponse;

  const { id } = await params;
  let body: { owner_id?: string | null };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Null unclaims; otherwise must be a rep in the pool.
  const owner = body.owner_id ?? null;
  if (owner !== null && !REP_IDS.has(owner)) {
    return NextResponse.json({ error: "owner_id must be a rep in the pool (or null to unclaim)." }, { status: 400 });
  }

  const db = createAzatClient();
  const { data, error } = await db.from("contacts").update({ owner_id: owner }).eq("id", id).select("id, owner_id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contact not found.", code: "NOT_FOUND" }, { status: 404 });

  const ownerId = (data as { owner_id: string | null }).owner_id;
  return NextResponse.json({ owner: ownerId ? { id: ownerId, name: REP_NAME.get(ownerId) ?? repName(ownerId) } : null });
}

// ── POST: create a followup task for this contact ─────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("errorResponse" in g) return g.errorResponse;

  const { id } = await params;
  let body: { owner_id?: string | null; label?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const db: AzatClient = createAzatClient();

  // Owner: explicit rep → the contact's current owner → least-loaded rep.
  let owner = body.owner_id && REP_IDS.has(body.owner_id) ? body.owner_id : null;
  if (!owner) {
    const { data: c } = await db.from("contacts").select("owner_id").eq("id", id).maybeSingle();
    const cur = (c as { owner_id: string | null } | null)?.owner_id ?? null;
    owner = cur && REP_IDS.has(cur) ? cur : leastLoadedRep(await fetchRepLoad(db));
  }

  const insertRow = {
    kind: "followup", // azat.task_kind enum
    label: (body.label && body.label.trim()) || "Follow up with contact",
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    owner_id: owner,
    contact_id: id,
  };

  const { data, error } = await db.from("tasks").insert(insertRow).select("id, label, due_at, owner_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const t = data as { id: string; label: string | null; due_at: string | null; owner_id: string | null };
  return NextResponse.json({
    task: { id: t.id, label: t.label, due_at: t.due_at, owner_id: t.owner_id, owner_name: repName(t.owner_id) },
  });
}
