// GET /api/team/page-data — manager Team Dashboard scoreboard.
//
// Returns one row per sales rep with a compact set of activity metrics (last 7
// days unless noted), plus a team-wide totals row. Read-only; writes nothing.
//
// AUTH: same pattern as app/api/leads/sales/page-data/route.ts —
//   requireSession() (public schema) + requirePageAccess(userId, role, "/team").
//   Admin bypasses page RBAC; managers reach it once "/team" is in their granted
//   page routes. As an explicit guard for the stated manager/admin restriction,
//   any role other than admin/manager is hard-denied even if the route is granted.
//
// DATA: lives in the `azat` schema, so we use a schema-scoped service client
//   (copied from app/api/dev/promote-actions/route.ts) that is independent of the
//   public-schema client used for auth.

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any, any, any>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Rep pool (owner_id → display name) ──────────────────────────────────────
const REPS: { id: string; name: string }[] = [
  { id: "b502082c-f831-452e-8170-af7c355d8f4c", name: "Gary" },
  { id: "98827086-1e28-456c-a727-f2488a71e4b4", name: "Maria" },
  { id: "51792983-3ee1-4d4c-955d-bc323c99d84c", name: "Ernesto" },
  { id: "44906a46-25e5-430d-8b07-efd33b3a3b61", name: "Manny Carlo" },
  { id: "6a818c50-59f4-465e-89fd-9a7c2246d8a5", name: "Azat" },
  { id: "96d18012-3303-4615-8ac9-cfbc846be348", name: "Hayk" },
];
const REP_IDS = REPS.map((r) => r.id);
const REP_SET = new Set(REP_IDS);

const CLOSED_STAGES = new Set(["won", "lost"]);

export interface TeamRepMetrics {
  owner_id: string;
  name: string;
  open_tasks: number;
  tasks_done_7d: number;
  open_deals: number;
  won_7d: number;
  calls_answered_7d: number;
  calls_missed_7d: number;
  unanswered_messages_7d: number;
}

function azatClient(): DB {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { db: { schema: "azat" }, auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function emptyMetrics(id: string, name: string): TeamRepMetrics {
  return {
    owner_id: id,
    name,
    open_tasks: 0,
    tasks_done_7d: 0,
    open_deals: 0,
    won_7d: 0,
    calls_answered_7d: 0,
    calls_missed_7d: 0,
    unanswered_messages_7d: 0,
  };
}

type CallRow = {
  direction: string | null;
  contact_id: string | null;
  meta: Record<string, unknown> | null;
};
type MsgRow = {
  id: string;
  direction: string | null;
  channel: string | null;
  contact_id: string | null;
  thread_id: string | null;
  received_at: string;
};

// Resolve which rep a call belongs to. Spec: attribute via contacts.owner_id
// (contact_id → rep). Many call rows carry contact_id = null, so we fall back to
// the JustCall line/handler owner stored in meta (line_owner_user_id /
// handled_by_user_id) when it is one of our reps — this keeps calls per-rep
// instead of forcing a team-wide-only simplification.
function callRepId(c: CallRow, contactOwner: Map<string, string>): string | null {
  if (c.contact_id && contactOwner.has(c.contact_id)) return contactOwner.get(c.contact_id)!;
  const meta = c.meta ?? {};
  const lo = meta["line_owner_user_id"];
  const hb = meta["handled_by_user_id"];
  if (typeof lo === "string" && REP_SET.has(lo)) return lo;
  if (typeof hb === "string" && REP_SET.has(hb)) return hb;
  return null;
}

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/team");
  if (pageDeny) return pageDeny;

  // Explicit manager/admin restriction on top of page RBAC.
  if (roleName !== "admin" && roleName !== "manager") {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const db = azatClient();
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [contactsRes, tasksRes, dealsRes, callsRes, msgsRes] = await Promise.all([
      // Contacts owned by reps → owner attribution for comms.
      db.from("contacts").select("id, owner_id").in("owner_id", REP_IDS),
      // Every task owned by a rep (open + recently completed). Volume is small.
      db.from("tasks").select("owner_id, done_at").in("owner_id", REP_IDS),
      // Every deal owned by a rep (open + recently closed).
      db.from("deals").select("owner_id, stage, closed_at").in("owner_id", REP_IDS),
      // Calls in the window (attributed by contact/meta below).
      db
        .from("comm_events")
        .select("direction, contact_id, meta")
        .eq("channel", "call")
        .gte("received_at", weekAgoIso),
      // Email/SMS in the window, both directions — needed for thread-reply logic.
      db
        .from("comm_events")
        .select("id, direction, channel, contact_id, thread_id, received_at")
        .in("channel", ["email", "sms"])
        .gte("received_at", weekAgoIso),
    ]);

    for (const r of [contactsRes, tasksRes, dealsRes, callsRes, msgsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const metrics = new Map<string, TeamRepMetrics>(
      REPS.map((r) => [r.id, emptyMetrics(r.id, r.name)]),
    );

    // contact_id → owning rep
    const contactOwner = new Map<string, string>();
    for (const c of (contactsRes.data ?? []) as { id: string; owner_id: string | null }[]) {
      if (c.owner_id && REP_SET.has(c.owner_id)) contactOwner.set(c.id, c.owner_id);
    }

    // ── Tasks: open (done_at null) + done in last 7d ──
    for (const t of (tasksRes.data ?? []) as { owner_id: string | null; done_at: string | null }[]) {
      const m = t.owner_id ? metrics.get(t.owner_id) : null;
      if (!m) continue;
      if (t.done_at == null) m.open_tasks += 1;
      else if (t.done_at >= weekAgoIso) m.tasks_done_7d += 1;
    }

    // ── Deals: open (stage not won/lost) + won in last 7d (by closed_at) ──
    for (const d of (dealsRes.data ?? []) as {
      owner_id: string | null;
      stage: string | null;
      closed_at: string | null;
    }[]) {
      const m = d.owner_id ? metrics.get(d.owner_id) : null;
      if (!m) continue;
      const stage = d.stage ?? "";
      if (!CLOSED_STAGES.has(stage)) m.open_deals += 1;
      if (stage === "won" && d.closed_at != null && d.closed_at >= weekAgoIso) m.won_7d += 1;
    }

    // ── Calls: answered vs missed ──
    // missed  = inbound with a meta.missed_reason
    // answered = outbound, or inbound without a missed_reason
    for (const c of (callsRes.data ?? []) as CallRow[]) {
      const repId = callRepId(c, contactOwner);
      const m = repId ? metrics.get(repId) : null;
      if (!m) continue;
      const missedReason = (c.meta ?? {})["missed_reason"];
      const isMissed = c.direction === "inbound" && missedReason != null && missedReason !== "";
      if (isMissed) m.calls_missed_7d += 1;
      else m.calls_answered_7d += 1;
    }

    // ── Unanswered messages ──
    // Inbound email/sms on a rep's contact with no later outbound reply in the
    // same thread_id. Reply detection uses events inside the same 7-day window
    // (volume is tiny); a reply older than the window on the same thread would
    // not be seen, but in practice replies land within the window. Messages with
    // no contact_id cannot be attributed to a rep and are skipped.
    const msgs = (msgsRes.data ?? []) as MsgRow[];
    const laterOutboundByThread = new Map<string, string>(); // thread_id → latest outbound received_at
    for (const m of msgs) {
      if (m.direction === "outbound" && m.thread_id) {
        const prev = laterOutboundByThread.get(m.thread_id);
        if (!prev || m.received_at > prev) laterOutboundByThread.set(m.thread_id, m.received_at);
      }
    }
    for (const msg of msgs) {
      if (msg.direction !== "inbound") continue;
      if (!msg.contact_id) continue;
      const repId = contactOwner.get(msg.contact_id);
      const m = repId ? metrics.get(repId) : null;
      if (!m) continue;
      const latestOutbound = msg.thread_id ? laterOutboundByThread.get(msg.thread_id) : undefined;
      const replied = latestOutbound != null && latestOutbound > msg.received_at;
      if (!replied) m.unanswered_messages_7d += 1;
    }

    const reps = REPS.map((r) => metrics.get(r.id)!);
    const totals = reps.reduce(
      (acc, r) => {
        acc.open_tasks += r.open_tasks;
        acc.tasks_done_7d += r.tasks_done_7d;
        acc.open_deals += r.open_deals;
        acc.won_7d += r.won_7d;
        acc.calls_answered_7d += r.calls_answered_7d;
        acc.calls_missed_7d += r.calls_missed_7d;
        acc.unanswered_messages_7d += r.unanswered_messages_7d;
        return acc;
      },
      {
        owner_id: "__total__",
        name: "Team total",
        open_tasks: 0,
        tasks_done_7d: 0,
        open_deals: 0,
        won_7d: 0,
        calls_answered_7d: 0,
        calls_missed_7d: 0,
        unanswered_messages_7d: 0,
      } as TeamRepMetrics,
    );

    return NextResponse.json({ window_days: 7, generated_at: new Date().toISOString(), reps, totals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load team data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
