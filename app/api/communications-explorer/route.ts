// Communications Explorer — READ-ONLY verification/QC feed for the CEO.
//
// Surfaces EVERY communication in azat.comm_events, separated by channel
// (call | sms | email | ig_dm | ad_lead | webform | walk_in | ...) and direction
// (inbound | outbound | internal). Each comm is joined to its azat.comm_ai row (the
// promise-engine summary written by app/api/dev/process-comms) so every row answers:
//   • what it is        — channel + direction + who
//   • what it's about   — intent (falls back to headline), never the raw signature/forward dump
//   • what to do        — next_step + whether it became a task / deal (azat.engine_provenance)
// Internal rep-signature / auto-reply "noise" (comm_ai.is_noise) is split out from real
// conversations so the CEO sees signal vs junk.
//
// SAFETY: this route only ever SELECTs. It performs no inserts/updates/deletes.
//
// Query params:
//   ?channel=<channel|all>       filter the row list to one channel (matrix ignores it)
//   &direction=<inbound|outbound|internal|all>  filter the row list to one direction
//   &rep=<rep user id|all>       filter the row list to one rep (matrix ignores it)
//   &range=today|7d|all          date window (applies to BOTH matrix and rows)
//
// Rep attribution (mirrors the Team dashboard, app/api/team/page-data): a comm
// belongs to a rep when its contact_id → azat.contacts.owner_id equals the rep,
// OR (for calls) when meta.line_owner_user_id / meta.handled_by_user_id equals the
// rep. The rep filter is applied to the ROW LIST only; the matrix/counts strip
// stays GLOBAL (it is the overview of everything flowing in vs out).
//
// Response:
//   { matrix:   [{ channel, inbound, outbound, internal, total, real, noise }],
//     totals:   { inbound, outbound, internal, total, real, noise },
//     channels, directions, reps,
//     rows:     [{ id, channel, direction, when, who, snippet, intent, next_step,
//                  is_noise, sentiment, processing }],
//     range, total_rows_in_window, returned }

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { REPS } from "@/lib/azat/reps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any, any, any>;

const ROW_LIMIT = 200; // newest-first cap for the scannable list
const MATRIX_CAP = 20000; // safety ceiling on rows scanned for the counts strip

// Reps we can filter the row list by (owner_id → name). Shared with the UI + Team dashboard.
const REP_SET = new Set(REPS.map((r) => r.id));

type CommRow = {
  id: string;
  channel: string | null;
  direction: string | null;
  contact_id: string | null;
  thread_id: string | null;
  meta: Record<string, unknown> | null;
  received_at: string;
  body: string | null;
};

type Processing = "task" | "deal" | "task_deal" | "needs_action" | "done";

type CommAi = {
  headline: string | null;
  intent: string | null;
  next_step: string | null;
  is_noise: boolean | null;
  sentiment: string | null;
};

function azatClient(): DB {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { db: { schema: "azat" }, auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// All azat.comm_ai rows keyed by comm_id. The table is small (one row per PROCESSED
// comm), so loading it whole is cheaper than thousands-wide .in() filters and lets us
// classify noise for both the matrix and the row list from one read.
async function fetchAllCommAi(db: DB): Promise<Map<string, CommAi>> {
  const map = new Map<string, CommAi>();
  const page = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("comm_ai")
      .select("comm_id, headline, intent, next_step, is_noise, sentiment")
      .range(offset, offset + page - 1);
    if (error) throw new Error(`comm_ai read failed: ${error.message}`);
    const rows = (data ?? []) as (CommAi & { comm_id: string })[];
    for (const r of rows) {
      map.set(r.comm_id, {
        headline: r.headline,
        intent: r.intent,
        next_step: r.next_step,
        is_noise: r.is_noise,
        sentiment: r.sentiment,
      });
    }
    if (rows.length < page) break;
    offset += page;
  }
  return map;
}

// Window start (ISO) for the date filter, or null for "all".
function rangeStart(range: string): string | null {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (range === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null; // all
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// One-line snippet: call_summary → transcript → body (mirrors promote-actions pickText priority).
function pickSnippet(row: CommRow): string {
  const meta = row.meta ?? {};
  const cs = asString(meta["call_summary"]);
  const tr = asString(meta["transcript"]);
  const body = asString(row.body);
  const text = cs || tr || body || "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > 180 ? collapsed.slice(0, 180) + "…" : collapsed;
}

// WHO: linked contact name → from-address / phone / handle pulled out of meta → thread hint.
function pickWho(row: CommRow, contactName: Map<string, string>): string {
  if (row.contact_id && contactName.has(row.contact_id)) return contactName.get(row.contact_id)!;
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const from = meta["from"];
  if (from && typeof from === "object") {
    const f = from as Record<string, unknown>;
    const name = asString(f["name"]);
    const email = asString(f["email"]);
    const number = asString(f["number"]) || asString(f["phone"]);
    const handle = asString(f["handle"]) || asString(f["username"]);
    if (name) return name;
    if (email) return email;
    if (number) return number;
    if (handle) return handle;
  }
  const flat =
    asString(from) ||
    asString(meta["from_number"]) ||
    asString(meta["from_email"]) ||
    asString(meta["from_handle"]) ||
    asString(meta["handle"]) ||
    asString(meta["username"]) ||
    asString(meta["phone"]) ||
    asString(meta["email"]) ||
    asString(meta["mailbox"]);
  if (flat) return flat;
  return "Unknown";
}

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/communications");
  if (pageDeny) return pageDeny;

  const sp = request.nextUrl.searchParams;
  const channel = (sp.get("channel") ?? "all").toLowerCase();
  const direction = (sp.get("direction") ?? "all").toLowerCase();
  const range = (sp.get("range") ?? "7d").toLowerCase();
  // Rep filter: only honor a value that is one of our known reps; anything else = "all".
  const repParam = sp.get("rep") ?? "all";
  const rep = REP_SET.has(repParam) ? repParam : "all";
  const since = rangeStart(range);

  const db = azatClient();

  try {
    // The promise-engine summaries — used to classify noise and to fill each row's
    // what-it's-about / what-to-do line.
    const aiMap = await fetchAllCommAi(db);

    // ── 1) Matrix: channel × direction counts over the date window (ignores channel/direction filters).
    //    Also splits each channel into real vs noise (comm_ai.is_noise) so signal ≠ junk.
    let mq = db.from("comm_events").select("id, channel, direction").limit(MATRIX_CAP);
    if (since) mq = mq.gte("received_at", since);
    const { data: mData, error: mErr } = await mq;
    if (mErr) throw new Error(`matrix read failed: ${mErr.message}`);

    type Mx = { inbound: number; outbound: number; internal: number; total: number; real: number; noise: number };
    const matrixMap = new Map<string, Mx>();
    const directionsSeen = new Set<string>();
    let totalInWindow = 0;
    const totals: Mx = { inbound: 0, outbound: 0, internal: 0, total: 0, real: 0, noise: 0 };
    for (const r of (mData ?? []) as { id: string; channel: string | null; direction: string | null }[]) {
      const ch = (r.channel ?? "unknown").toLowerCase();
      const dir = (r.direction ?? "unknown").toLowerCase();
      const isNoise = aiMap.get(r.id)?.is_noise === true;
      directionsSeen.add(dir);
      totalInWindow += 1;
      const cur = matrixMap.get(ch) ?? { inbound: 0, outbound: 0, internal: 0, total: 0, real: 0, noise: 0 };
      if (dir === "inbound") { cur.inbound += 1; totals.inbound += 1; }
      else if (dir === "outbound") { cur.outbound += 1; totals.outbound += 1; }
      else { cur.internal += 1; totals.internal += 1; } // internal + any other direction bucket
      cur.total += 1;
      totals.total += 1;
      if (isNoise) { cur.noise += 1; totals.noise += 1; }
      else { cur.real += 1; totals.real += 1; }
      matrixMap.set(ch, cur);
    }
    const matrix = Array.from(matrixMap.entries())
      .map(([ch, v]) => ({ channel: ch, ...v }))
      .sort((a, b) => b.total - a.total);
    const channels = matrix.map((m) => m.channel);

    // ── 2) Rows: filtered list, newest-first.
    let rq = db
      .from("comm_events")
      .select("id, channel, direction, contact_id, thread_id, meta, received_at, body")
      .order("received_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (since) rq = rq.gte("received_at", since);
    if (channel !== "all") rq = rq.eq("channel", channel);
    if (direction !== "all") rq = rq.eq("direction", direction);
    // Rep filter (row list only — matrix stays global). Attribution mirrors the Team
    // dashboard: comm belongs to a rep if its owning contact is owned by the rep, OR
    // (for calls) if meta.line_owner_user_id / meta.handled_by_user_id is the rep. We
    // resolve the rep's contacts first, then push an OR of those conditions into the
    // rows query so ROW_LIMIT applies to the rep's rows (not a pre-limited slice).
    if (rep !== "all") {
      const { data: ownRows, error: ownErr } = await db
        .from("contacts")
        .select("id")
        .eq("owner_id", rep);
      if (ownErr) throw new Error(`rep contacts read failed: ${ownErr.message}`);
      const ownedIds = (ownRows ?? []).map((r) => (r as { id: string }).id);
      const orParts: string[] = [];
      if (ownedIds.length) orParts.push(`contact_id.in.(${ownedIds.join(",")})`);
      orParts.push(`meta->>line_owner_user_id.eq.${rep}`);
      orParts.push(`meta->>handled_by_user_id.eq.${rep}`);
      rq = rq.or(orParts.join(","));
    }
    const { data: rData, error: rErr } = await rq;
    if (rErr) throw new Error(`rows read failed: ${rErr.message}`);
    const comms = (rData ?? []) as CommRow[];

    // Contact names (two-step, mirrors the azat client pattern — no cross-schema SQL join).
    const contactIds = Array.from(new Set(comms.map((c) => c.contact_id).filter(Boolean))) as string[];
    const contactName = new Map<string, string>();
    if (contactIds.length) {
      const { data: cData, error: cErr } = await db.from("contacts").select("id, name").in("id", contactIds);
      if (cErr) throw new Error(`contacts read failed: ${cErr.message}`);
      for (const c of (cData ?? []) as { id: string; name: string | null }[]) {
        if (c.name) contactName.set(c.id, c.name);
      }
    }

    // Processing status: which comm_ids produced a task and/or a deal.
    const commIds = comms.map((c) => c.id);
    const hasTask = new Set<string>();
    const hasDeal = new Set<string>();
    if (commIds.length) {
      const { data: pData, error: pErr } = await db
        .from("engine_provenance")
        .select("comm_id, entity_type")
        .in("comm_id", commIds);
      if (pErr) throw new Error(`provenance read failed: ${pErr.message}`);
      for (const p of (pData ?? []) as { comm_id: string; entity_type: string }[]) {
        if (p.entity_type === "task") hasTask.add(p.comm_id);
        if (p.entity_type === "deal") hasDeal.add(p.comm_id);
      }
    }
    // Processing status:
    //   task / deal / task_deal → engine created that entity for this comm
    //   needs_action → a real inbound conversation that produced nothing yet (rep must act)
    //   done         → outbound, noise, or an inbound comm that genuinely needs no action
    function processingFor(id: string, dir: string, isNoise: boolean): Processing {
      const t = hasTask.has(id);
      const d = hasDeal.has(id);
      if (t && d) return "task_deal";
      if (t) return "task";
      if (d) return "deal";
      if (dir === "inbound" && !isNoise) return "needs_action";
      return "done";
    }

    const rows = comms.map((c) => {
      const dir = (c.direction ?? "unknown").toLowerCase();
      const ai = aiMap.get(c.id);
      const isNoise = ai?.is_noise === true;
      const intent = asString(ai?.intent ?? null) || asString(ai?.headline ?? null) || "";
      return {
        id: c.id,
        channel: (c.channel ?? "unknown").toLowerCase(),
        direction: dir,
        when: c.received_at,
        who: pickWho(c, contactName),
        contact_id: c.contact_id, // enables the "View" link to the contact 360
        snippet: pickSnippet(c), // raw fallback for the "no summary yet" case
        intent, // what it's about — clean one-liner (never the raw signature/forward dump)
        next_step: asString(ai?.next_step ?? null) || "",
        sentiment: asString(ai?.sentiment ?? null) || "",
        is_noise: isNoise,
        processing: processingFor(c.id, dir, isNoise),
      };
    });

    return NextResponse.json({
      range,
      matrix,
      totals,
      channels,
      directions: Array.from(directionsSeen),
      reps: REPS, // supported rep filter options (matrix stays global; rows honor ?rep=)
      total_rows_in_window: totalInWindow,
      returned: rows.length,
      row_limit: ROW_LIMIT,
      rows,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, code: "DB_ERROR" }, { status: 500 });
  }
}
