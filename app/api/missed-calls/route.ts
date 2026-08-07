// Missed Calls API (azat.comm_events where channel='call').
//  GET /api/missed-calls?state=missed|answered|all&range=today|yesterday|7d|all
//
// A call is "missed" when it is inbound AND (meta.missed_reason is non-empty OR
// the call_summary reads like a no-answer / voicemail) — see isMissedCall().
// Answered = every other call (outbound calls + inbound calls that were picked
// up). "All" = both directions. Counts are computed within the selected range.
//
// RETURNED vs NOT-RETURNED (the key ask): a missed inbound call is "returned"
// when there is a LATER outbound touch (call, sms, or email) to the same
// contact_id — or the same phone number — after the missed call's received_at.
// Not-returned calls are split into two urgency tiers by how long ago the call
// came in: under 30 min → "warning" (amber), 30 min or older → "danger" (red).
//
// VOICEMAIL → TASK: missed inbound calls that left a voicemail (meta
// voicemail_transcript, or a call_summary that reads like a voicemail) are run
// through the promise engine (lib/ai/extract-actions.ts) and auto-promoted to a
// task (and a deal when deal.detected) using the SAME insert + idempotency
// approach as app/api/dev/promote-actions/route.ts (azat.tasks / azat.deals,
// tracked in azat.engine_provenance, assigned to the least-loaded rep). This is
// bounded per request and idempotent, so repeated page loads never duplicate.
//
// Returns each call's caller (linked contact name → provider contact_name →
// phone number), direction, received_at, a call_summary snippet, missed flag,
// returned status + tier, voicemail flags, phone, and the line owner's rep name.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  createAzatClient,
  fetchRepLoad,
  leastLoadedRep,
  isMissedCall,
  repName,
  type AzatClient,
} from "@/lib/azat/server";
import { extractActions } from "@/lib/ai/extract-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Most-recent calls scanned. Board shows a rolling recent window.
const SCAN_LIMIT = 400;
// Outbound touches scanned to decide "returned" (call/sms/email, newest-first).
const OUTBOUND_SCAN_LIMIT = 4000;
// Not-returned urgency threshold: under this many minutes = amber, else red.
const FRESH_MINUTES = 30;
// Max brand-new voicemails turned into tasks per request (bounds OpenAI cost).
const MAX_VOICEMAIL_PROMOTE = 6;
// Deal stages that count as "open" (don't add a second deal for the contact).
const OPEN_STAGES = ["new", "specs", "quote", "approval", "proof", "payment"];

type Range = "today" | "yesterday" | "7d" | "all";

type CallRow = {
  id: string;
  direction: string | null;
  contact_id: string | null;
  received_at: string;
  meta: Record<string, unknown> | null;
};

function str(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

/** Canonical phone key: last 10 digits (strips +1 / formatting). */
function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}

/** A voicemail was left when there's a transcript, or the summary says so. */
const VOICEMAIL_SUMMARY = /(voicemail|left a message|leave a message|left a voicemail)/i;
function voicemailText(meta: Record<string, unknown> | null | undefined): string | null {
  const vt = str(meta, "voicemail_transcript");
  if (vt) return vt;
  const cs = str(meta, "call_summary");
  if (cs && VOICEMAIL_SUMMARY.test(cs)) return cs;
  return null;
}

/** Local-time [from, to) bounds for a daily range. `to` is null when open-ended. */
function rangeBounds(range: Range): { from: Date | null; to: Date | null } {
  if (range === "all") return { from: null, to: null };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (range === "today") return { from: startOfToday, to: null };
  if (range === "yesterday") {
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    return { from: startOfYesterday, to: startOfToday };
  }
  // 7d — trailing 7 calendar days.
  const from = new Date(startOfToday);
  from.setDate(from.getDate() - 6);
  return { from, to: null };
}

function parseAmountCents(s: string): number {
  const m = (s || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  const v = m ? parseFloat(m[1]) : 0;
  return isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
}

export async function GET(req: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/missed-calls");
  if (deny) return deny;

  const state = (req.nextUrl.searchParams.get("state") ?? "missed").toLowerCase();
  const rangeParam = (req.nextUrl.searchParams.get("range") ?? "today").toLowerCase();
  const range: Range = (["today", "yesterday", "7d", "all"] as const).includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "today";

  const db = createAzatClient();
  const { from, to } = rangeBounds(range);

  // ── Calls within range (both directions) ─────────────────────────────────
  let q = db
    .from("comm_events")
    .select("id, direction, contact_id, received_at, meta")
    .eq("channel", "call")
    .order("received_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (from) q = q.gte("received_at", from.toISOString());
  if (to) q = q.lt("received_at", to.toISOString());

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as CallRow[];

  // ── Contact names + owners (one batch) ────────────────────────────────────
  const contactIds = Array.from(new Set(rows.map((r) => r.contact_id).filter(Boolean))) as string[];
  const contactName = new Map<string, string>();
  const contactOwner = new Map<string, string>();
  if (contactIds.length) {
    const { data: cs } = await db.from("contacts").select("id, name, owner_id").in("id", contactIds);
    for (const c of (cs ?? []) as { id: string; name: string | null; owner_id: string | null }[]) {
      if (c.name) contactName.set(c.id, c.name);
      if (c.owner_id) contactOwner.set(c.id, c.owner_id);
    }
  }

  // ── Returned detection: latest outbound touch per contact / per phone ─────
  // We only need the MAX outbound timestamp per key: a missed call is returned
  // iff some outbound touch to that contact/phone happened after received_at.
  const lastOutboundByContact = new Map<string, number>();
  const lastOutboundByPhone = new Map<string, number>();
  if (rows.length) {
    const windowStart = rows.reduce(
      (min, r) => Math.min(min, new Date(r.received_at).getTime()),
      Number.POSITIVE_INFINITY,
    );
    const { data: outs } = await db
      .from("comm_events")
      .select("contact_id, received_at, meta")
      .in("channel", ["call", "sms", "email"])
      .eq("direction", "outbound")
      .gte("received_at", new Date(windowStart).toISOString())
      .order("received_at", { ascending: false })
      .limit(OUTBOUND_SCAN_LIMIT);
    for (const o of (outs ?? []) as CallRow[]) {
      const ts = new Date(o.received_at).getTime();
      if (o.contact_id) {
        const prev = lastOutboundByContact.get(o.contact_id) ?? 0;
        if (ts > prev) lastOutboundByContact.set(o.contact_id, ts);
      }
      const pk = phoneKey(str(o.meta, "contact_phone") ?? str(o.meta, "to_number"));
      if (pk) {
        const prev = lastOutboundByPhone.get(pk) ?? 0;
        if (ts > prev) lastOutboundByPhone.set(pk, ts);
      }
    }
  }

  const now = Date.now();

  // ── Voicemail → task promotion (bounded + idempotent) ─────────────────────
  // Which missed-inbound voicemail comms already produced a task?
  const voicemailCommIds = rows
    .filter((r) => r.direction === "inbound" && isMissedCall(r.meta) && voicemailText(r.meta))
    .map((r) => r.id);
  const voicemailTaskDone = new Set<string>();
  if (voicemailCommIds.length) {
    const { data: prov } = await db
      .from("engine_provenance")
      .select("comm_id, entity_type")
      .in("comm_id", voicemailCommIds)
      .eq("entity_type", "task");
    for (const p of (prov ?? []) as { comm_id: string }[]) voicemailTaskDone.add(p.comm_id);
    // Promote any not-yet-processed voicemails (best-effort; never blocks list).
    const todo = voicemailCommIds.filter((id) => !voicemailTaskDone.has(id)).slice(0, MAX_VOICEMAIL_PROMOTE);
    if (todo.length) {
      try {
        const created = await promoteVoicemails(db, todo, contactOwner);
        for (const id of created) voicemailTaskDone.add(id);
      } catch {
        /* extraction/insert failure must not break the board */
      }
    }
  }

  // ── Shape rows ────────────────────────────────────────────────────────────
  const all = rows.map((r) => {
    const missed = r.direction === "inbound" && isMissedCall(r.meta);
    const phone = str(r.meta, "from_number") ?? str(r.meta, "contact_phone");
    const caller =
      (r.contact_id ? contactName.get(r.contact_id) ?? null : null) ??
      str(r.meta, "contact_name") ??
      phone ??
      "Unknown caller";
    const summary = str(r.meta, "call_summary") ?? str(r.meta, "missed_reason") ?? null;

    // Returned status + urgency tier (only meaningful for missed calls).
    let returned = false;
    let tier: "warning" | "danger" | null = null;
    if (missed) {
      const t = new Date(r.received_at).getTime();
      const pk = phoneKey(phone);
      returned =
        (!!r.contact_id && (lastOutboundByContact.get(r.contact_id) ?? 0) > t) ||
        (!!pk && (lastOutboundByPhone.get(pk) ?? 0) > t);
      if (!returned) {
        const minutesAgo = (now - t) / 60000;
        tier = minutesAgo < FRESH_MINUTES ? "warning" : "danger";
      }
    }

    const hasVoicemail = Boolean(voicemailText(r.meta)) && missed;

    return {
      id: r.id,
      direction: r.direction,
      missed,
      caller,
      phone,
      received_at: r.received_at,
      summary,
      contact_id: r.contact_id,
      owner_name: repName(str(r.meta, "line_owner_user_id")),
      returned,
      tier,
      has_voicemail: hasVoicemail,
      voicemail_task: hasVoicemail && voicemailTaskDone.has(r.id),
    };
  });

  const counts = {
    missed: all.filter((c) => c.missed).length,
    answered: all.filter((c) => !c.missed).length,
    all: all.length,
  };

  const list =
    state === "answered" ? all.filter((c) => !c.missed) : state === "all" ? all : all.filter((c) => c.missed);

  return NextResponse.json({ calls: list, counts, range });
}

// ── Voicemail promotion helper ────────────────────────────────────────────────
// Mirrors app/api/dev/promote-actions/route.ts: extractActions → insert task(s)
// (+ deal when detected), idempotent via azat.engine_provenance, owner = the
// contact's owner if known else the least-loaded rep. Returns comm_ids that
// produced at least one task (so the board can flag "voicemail → task created").
async function promoteVoicemails(
  db: AzatClient,
  commIds: string[],
  contactOwner: Map<string, string>,
): Promise<string[]> {
  const { data } = await db
    .from("comm_events")
    .select("id, channel, direction, contact_id, lead_id, deal_id, org_id, received_at, meta")
    .in("id", commIds);
  const comms = (data ?? []) as (CallRow & {
    channel: string;
    lead_id: string | null;
    deal_id: string | null;
    org_id: string | null;
  })[];
  if (!comms.length) return [];

  const load = await fetchRepLoad(db);
  const producedTask: string[] = [];

  for (const c of comms) {
    const text = voicemailText(c.meta);
    if (!text) continue;

    const owner =
      (c.contact_id && contactOwner.get(c.contact_id)) || leastLoadedRep(load);

    const r = await extractActions({
      text,
      channel: "call",
      direction: c.direction,
    });

    // ---- tasks ----
    if (r.tasks.length) {
      const dueAt = new Date(new Date(c.received_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const rowsToInsert = r.tasks.map((t) => ({
        kind: "followup", // azat.task_kind enum — extractor kind kept in the label
        label: t.title,
        due_at: dueAt,
        owner_id: owner,
        contact_id: c.contact_id,
        lead_id: c.lead_id,
        deal_id: c.deal_id,
      }));
      const { data: ins } = await db.from("tasks").insert(rowsToInsert).select("id");
      const ids = (ins ?? []) as { id: string }[];
      if (ids.length) {
        await db.from("engine_provenance").insert(
          ids.map((x) => ({ entity_type: "task", entity_id: x.id, comm_id: c.id, kind: "voicemail" })),
        );
        load.set(owner, (load.get(owner) ?? 0) + ids.length);
        producedTask.push(c.id);
      }
    }

    // ---- deal (only when detected + no open deal already) ----
    if (r.deal?.detected && c.contact_id) {
      const { data: open } = await db
        .from("deals")
        .select("id")
        .eq("contact_id", c.contact_id)
        .in("stage", OPEN_STAGES)
        .limit(1);
      const { data: dealDone } = await db
        .from("engine_provenance")
        .select("comm_id")
        .eq("comm_id", c.id)
        .eq("entity_type", "deal")
        .limit(1);
      if (!(open && open.length) && !(dealDone && dealDone.length)) {
        const { data: dIns } = await db
          .from("deals")
          .insert({
            stage: r.deal.quote_promised ? "quote" : "specs",
            title: (r.deal.product || r.headline).slice(0, 200),
            message: r.headline,
            value_cents: parseAmountCents(r.deal.amount),
            contact_id: c.contact_id,
            org_id: c.org_id,
            owner_id: owner,
            source: "auto",
            source_channel: "call",
          })
          .select("id")
          .single();
        const dealId = (dIns as { id: string } | null)?.id;
        if (dealId) {
          await db
            .from("engine_provenance")
            .insert({ entity_type: "deal", entity_id: dealId, comm_id: c.id, kind: "voicemail" });
        }
      }
    }
  }

  return producedTask;
}
