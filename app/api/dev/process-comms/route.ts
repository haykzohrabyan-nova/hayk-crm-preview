// Dev-only comm processor: runs the promise engine (lib/ai/extract-actions.ts) over
// EVERY azat.comm_events row (calls, email, sms, ig_dm, ad_lead, webform, voicemail…)
// and writes a per-comm AI summary into azat.comm_ai so the Communications page always
// has a clean "what it is / what it's about / what to do" line — not raw signature/forward text.
//
// It ALSO promotes real inbound conversations into tasks/deals via the SAME idempotent
// path as app/api/dev/promote-actions (azat.engine_provenance), but ONLY for inbound,
// non-noise comms that carry a real task/deal signal.
//
// SAFETY MODEL
//  - mode=dry (default): reads + runs extraction, computes what WOULD be written, writes
//    NOTHING. Returns counts + 10 samples.
//  - mode=write: writes a comm_ai row for every processed comm, and creates tasks/deals.
//    IDEMPOTENT: comm_ai PK (comm_id) means an already-summarised comm is never re-processed;
//    engine_provenance means a task/deal is never duplicated.
//
// Query params: ?mode=dry|write & limit=N (default 100) & channel=email|sms|call|ig_dm|...

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { extractActions } from "@/lib/ai/extract-actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any, any, any>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Rep pool (owner_id candidates) — same pool as promote-actions ───────────────
const REPS: { id: string; name: string }[] = [
  { id: "b502082c-f831-452e-8170-af7c355d8f4c", name: "Gary" },
  { id: "98827086-1e28-456c-a727-f2488a71e4b4", name: "Maria" },
  { id: "51792983-3ee1-4d4c-955d-bc323c99d84c", name: "Ernesto" },
  { id: "44906a46-25e5-430d-8b07-efd33b3a3b61", name: "Manny Carlo" },
  { id: "6a818c50-59f4-465e-89fd-9a7c2246d8a5", name: "Azat" },
  { id: "96d18012-3303-4615-8ac9-cfbc846be348", name: "Hayk" },
];
const REP_NAME = new Map(REPS.map((r) => [r.id, r.name]));

// Extracted work-type kind → valid azat.task_kind enum value (see promote-actions header).
const KIND_MAP: Record<string, string> = {
  callback: "followup",
  quote: "followup",
  artwork: "followup",
  followup: "followup",
  other: "followup",
};
function mapKind(k: string): string {
  return KIND_MAP[k] ?? "followup";
}

const OPEN_STAGES = ["new", "specs", "quote", "approval", "proof", "payment"];

// ── Types ───────────────────────────────────────────────────────────────────
type CommRow = {
  id: string;
  channel: string;
  direction: string | null;
  contact_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  org_id: string | null;
  body: string | null;
  meta: Record<string, unknown> | null;
  received_at: string;
};

function azatClient(): DB {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { db: { schema: "azat" }, auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// The useful text for extraction. Calls store their real content in meta.call_summary /
// meta.transcript / meta.voicemail_transcript; messages use body. Falls through in priority.
function pickText(row: CommRow): string | null {
  const meta = row.meta ?? {};
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  const cs = str("call_summary");
  const tr = str("transcript");
  const vm = str("voicemail_transcript");
  const candidates = row.channel === "call" ? [cs, tr, vm, row.body] : [row.body, tr, cs, vm];
  for (const c of candidates) {
    if (c && c.trim().length >= 12) return c.trim();
  }
  return null;
}

function parseAmountCents(s: string): number {
  if (!s) return 0;
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  if (!isFinite(v) || v <= 0) return 0;
  return Math.round(v * 100);
}

function plus24h(iso: string): string {
  const t = new Date(iso).getTime();
  return new Date((isNaN(t) ? Date.now() : t) + 24 * 60 * 60 * 1000).toISOString();
}

// All comm_ids that already have an azat.comm_ai row (idempotency gate). Table is small.
async function fetchAlreadySummarised(db: DB): Promise<Set<string>> {
  const done = new Set<string>();
  const page = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("comm_ai")
      .select("comm_id")
      .range(offset, offset + page - 1);
    if (error) throw new Error(`comm_ai read failed: ${error.message}`);
    const rows = (data ?? []) as { comm_id: string }[];
    for (const r of rows) done.add(r.comm_id);
    if (rows.length < page) break;
    offset += page;
  }
  return done;
}

// Fetch comm_events newest-first, paging until we have `limit` rows that (a) have usable
// text and (b) do not yet have a comm_ai row.
async function fetchUnprocessedComms(
  db: DB,
  limit: number,
  channel: string | null,
  alreadyDone: Set<string>,
): Promise<CommRow[]> {
  const out: CommRow[] = [];
  const page = 500;
  let offset = 0;
  const hardCap = 8000;
  while (out.length < limit && offset < hardCap) {
    let q = db
      .from("comm_events")
      .select("id, channel, direction, contact_id, lead_id, deal_id, org_id, body, meta, received_at")
      .order("received_at", { ascending: false })
      .range(offset, offset + page - 1);
    if (channel) q = q.eq("channel", channel);
    const { data, error } = await q;
    if (error) throw new Error(`comm_events read failed: ${error.message}`);
    const rows = (data ?? []) as CommRow[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (alreadyDone.has(r.id)) continue;
      if (pickText(r)) {
        out.push(r);
        if (out.length >= limit) break;
      }
    }
    offset += page;
  }
  return out;
}

// Current open-task load per rep (owner_id with done_at IS NULL), restricted to the pool.
async function repLoad(db: DB): Promise<Map<string, number>> {
  const load = new Map<string, number>(REPS.map((r) => [r.id, 0]));
  const { data, error } = await db.from("tasks").select("owner_id").is("done_at", null).limit(100000);
  if (error) throw new Error(`task-load read failed: ${error.message}`);
  for (const row of (data ?? []) as { owner_id: string | null }[]) {
    if (row.owner_id && load.has(row.owner_id)) load.set(row.owner_id, (load.get(row.owner_id) ?? 0) + 1);
  }
  return load;
}

function leastLoaded(load: Map<string, number>): string {
  let best = REPS[0].id;
  let bestN = Infinity;
  for (const r of REPS) {
    const n = load.get(r.id) ?? 0;
    if (n < bestN) {
      bestN = n;
      best = r.id;
    }
  }
  return best;
}

// ── Route ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") ?? "dry").toLowerCase();
  const channel = searchParams.get("channel");
  const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get("limit") ?? "100", 10) || 100));

  if (mode !== "dry" && mode !== "write") {
    return NextResponse.json({ error: `unknown mode '${mode}' (use dry|write)` }, { status: 400 });
  }

  const db = azatClient();
  try {
    return await handleProcess(db, mode as "dry" | "write", limit, channel);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function handleProcess(db: DB, mode: "dry" | "write", limit: number, channel: string | null) {
  const alreadyDone = await fetchAlreadySummarised(db);
  const comms = await fetchUnprocessedComms(db, limit, channel, alreadyDone);

  // Which of these comm_ids already produced tasks/deals (provenance idempotency)?
  const commIds = comms.map((c) => c.id);
  const doneTasks = new Set<string>();
  const doneDeals = new Set<string>();
  if (commIds.length) {
    const { data: prov, error } = await db
      .from("engine_provenance")
      .select("comm_id, entity_type")
      .in("comm_id", commIds);
    if (error) throw new Error(`provenance read failed: ${error.message}`);
    for (const p of (prov ?? []) as { comm_id: string; entity_type: string }[]) {
      if (p.entity_type === "task") doneTasks.add(p.comm_id);
      if (p.entity_type === "deal") doneDeals.add(p.comm_id);
    }
  }

  // Contact names (samples) + owners (owner resolution).
  const contactIds = Array.from(new Set(comms.map((c) => c.contact_id).filter(Boolean))) as string[];
  const contactName = new Map<string, string>();
  const contactOwner = new Map<string, string>();
  if (contactIds.length) {
    const { data } = await db.from("contacts").select("id, name, owner_id").in("id", contactIds);
    for (const c of (data ?? []) as { id: string; name: string | null; owner_id: string | null }[]) {
      if (c.name) contactName.set(c.id, c.name);
      if (c.owner_id) contactOwner.set(c.id, c.owner_id);
    }
  }

  const load = await repLoad(db);

  async function resolveOwner(c: CommRow): Promise<string> {
    if (c.deal_id) {
      const { data } = await db.from("deals").select("owner_id").eq("id", c.deal_id).maybeSingle();
      const o = (data as { owner_id: string | null } | null)?.owner_id;
      if (o) return o;
    }
    if (c.lead_id) {
      const { data } = await db.from("leads").select("owner_id").eq("id", c.lead_id).maybeSingle();
      const o = (data as { owner_id: string | null } | null)?.owner_id;
      if (o) return o;
    }
    if (c.contact_id && contactOwner.has(c.contact_id)) return contactOwner.get(c.contact_id)!;
    return leastLoaded(load);
  }

  let processed = 0;
  let noiseFlagged = 0;
  let tasksCreated = 0;
  let dealsCreated = 0;
  let skippedIdempotentTasks = 0;
  let skippedIdempotentDeals = 0;
  let dealsSkippedNoContact = 0;
  let dealsSkippedOpenExists = 0;
  const samples: unknown[] = [];

  const BATCH = 5;
  for (let i = 0; i < comms.length; i += BATCH) {
    const slice = comms.slice(i, i + BATCH);
    const extracted = await Promise.all(
      slice.map((c) =>
        extractActions({
          text: pickText(c) ?? "",
          channel: c.channel,
          direction: c.direction,
          contactName: c.contact_id ? contactName.get(c.contact_id) ?? null : null,
        }).then((r) => ({ c, r })),
      ),
    );

    for (const { c, r } of extracted) {
      processed += 1;
      if (r.is_noise) noiseFlagged += 1;

      const owner = await resolveOwner(c);
      const inbound = (c.direction ?? "").toLowerCase() === "inbound";
      const promotable = inbound && !r.is_noise; // only real inbound conversations become work

      // ---- tasks ----
      const alreadyHasTasks = doneTasks.has(c.id);
      if (alreadyHasTasks && r.tasks.length) skippedIdempotentTasks += r.tasks.length;
      const willTasks = promotable && !alreadyHasTasks ? r.tasks : [];
      if (willTasks.length) load.set(owner, (load.get(owner) ?? 0) + willTasks.length);

      // ---- deal ----
      let willDeal = false;
      let dealSkipReason: string | null = null;
      if (promotable && r.deal?.detected) {
        if (doneDeals.has(c.id)) {
          skippedIdempotentDeals += 1;
          dealSkipReason = "idempotent";
        } else if (!c.contact_id) {
          dealsSkippedNoContact += 1;
          dealSkipReason = "no-contact";
        } else {
          const { data: open } = await db
            .from("deals")
            .select("id")
            .eq("contact_id", c.contact_id)
            .in("stage", OPEN_STAGES)
            .limit(1);
          if (open && open.length) {
            dealsSkippedOpenExists += 1;
            dealSkipReason = "open-deal-exists";
          } else {
            willDeal = true;
          }
        }
      }

      // ---- writes ----
      if (mode === "write") {
        // Always record the per-comm AI summary (idempotent via comm_id PK).
        const { error: aiErr } = await db.from("comm_ai").upsert(
          {
            comm_id: c.id,
            headline: r.headline,
            intent: r.intent,
            next_step: r.next_step,
            is_noise: r.is_noise,
            sentiment: r.sentiment,
          },
          { onConflict: "comm_id" },
        );
        if (aiErr) throw new Error(`comm_ai upsert failed (comm ${c.id}): ${aiErr.message}`);

        if (willTasks.length) {
          const rows = willTasks.map((t) => ({
            kind: mapKind(t.kind),
            label: t.title,
            due_at: plus24h(c.received_at),
            owner_id: owner,
            contact_id: c.contact_id,
            lead_id: c.lead_id,
            deal_id: c.deal_id,
          }));
          const { data: ins, error } = await db.from("tasks").insert(rows).select("id");
          if (error) throw new Error(`task insert failed (comm ${c.id}): ${error.message}`);
          const ids = (ins ?? []) as { id: string }[];
          if (ids.length) {
            await db.from("engine_provenance").insert(
              ids.map((x) => ({ entity_type: "task", entity_id: x.id, comm_id: c.id, kind: "task" })),
            );
          }
          tasksCreated += ids.length;
        }

        if (willDeal && r.deal) {
          const { data: ins, error } = await db
            .from("deals")
            .insert({
              stage: r.deal.quote_promised ? "quote" : "specs",
              title: (r.deal.product || r.headline).slice(0, 200),
              message: r.intent || r.headline,
              value_cents: parseAmountCents(r.deal.amount),
              contact_id: c.contact_id,
              org_id: c.org_id,
              owner_id: owner,
              source: "auto",
              source_channel: c.channel,
            })
            .select("id")
            .single();
          if (error) throw new Error(`deal insert failed (comm ${c.id}): ${error.message}`);
          const dealId = (ins as { id: string }).id;
          await db
            .from("engine_provenance")
            .insert({ entity_type: "deal", entity_id: dealId, comm_id: c.id, kind: "deal" });
          dealsCreated += 1;
        }
      } else {
        // dry tallies
        if (willTasks.length) tasksCreated += willTasks.length;
        if (willDeal) dealsCreated += 1;
      }

      if (samples.length < 10) {
        samples.push({
          contact: c.contact_id ? contactName.get(c.contact_id) ?? c.contact_id : null,
          channel: c.channel,
          direction: c.direction,
          headline: r.headline,
          intent: r.intent,
          next_step: r.next_step,
          is_noise: r.is_noise,
          would_create_tasks: (mode === "write" ? willTasks : promotable && !alreadyHasTasks ? r.tasks : []).length,
          would_create_deal: willDeal,
          deal_skip_reason: dealSkipReason,
          owner: REP_NAME.get(owner) ?? owner,
        });
      }
    }
  }

  return NextResponse.json({
    mode,
    wrote: mode === "write",
    params: { limit, channel: channel ?? "(all)" },
    openai_key_present: Boolean(process.env.OPENAI_API_KEY),
    processed,
    noise_flagged: noiseFlagged,
    real_conversations: processed - noiseFlagged,
    tasks_created: tasksCreated,
    deals_created: dealsCreated,
    skipped: {
      idempotent_tasks: skippedIdempotentTasks,
      idempotent_deals: skippedIdempotentDeals,
      deals_no_contact: dealsSkippedNoContact,
      deals_open_exists: dealsSkippedOpenExists,
    },
    samples,
  });
}
