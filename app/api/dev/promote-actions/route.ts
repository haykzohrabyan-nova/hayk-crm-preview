// Dev-only "promise engine" wiring: turns analyzed communications (azat.comm_events)
// into concrete azat.tasks and azat.deals via lib/ai/extract-actions.ts.
//
// SAFETY MODEL
//  - mode=dry (default): reads + runs extraction, computes what WOULD be created,
//    writes NOTHING. Returns JSON preview.
//  - mode=write: actually inserts tasks/deals. IDEMPOTENT via azat.engine_provenance
//    (re-running never duplicates). Every created row is recorded there.
//  - mode=reset: deletes ONLY rows tracked in azat.engine_provenance (tasks, deals,
//    and the public.leads mirror rows the deal-sync trigger created for those deals),
//    then clears the provenance table. Never touches pre-existing data.
//
// Query params: ?mode=dry|write|reset & limit=N (default 50) & channel=call|email|sms|...
//
// NOTE ON tasks.kind: the DB column azat.tasks.kind is an ENUM (task_kind) whose values
// are cadence-based (first_touch|ask1|ask2|decide|followup|parked_return) and do NOT
// match the extractor's work-type kinds (callback|quote|artwork|followup|other).
// Every extracted kind is therefore mapped to the enum value 'followup' — the only
// generically-valid "a next action the team must do" value. The original work-type is
// preserved in the human-readable task label. Change KIND_MAP below to remap.

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { extractActions } from "@/lib/ai/extract-actions";

// Schema-agnostic client type: the azat-scoped and public-scoped clients differ only
// in their Schema generic, so widen it so both satisfy the helper signatures.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any, any, any>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Rep pool (owner_id candidates) ─────────────────────────────────────────────
const REPS: { id: string; name: string }[] = [
  { id: "b502082c-f831-452e-8170-af7c355d8f4c", name: "Gary" },
  { id: "98827086-1e28-456c-a727-f2488a71e4b4", name: "Maria" },
  { id: "51792983-3ee1-4d4c-955d-bc323c99d84c", name: "Ernesto" },
  { id: "44906a46-25e5-430d-8b07-efd33b3a3b61", name: "Manny Carlo" },
  { id: "6a818c50-59f4-465e-89fd-9a7c2246d8a5", name: "Azat" },
  { id: "96d18012-3303-4615-8ac9-cfbc846be348", name: "Hayk" },
];
const REP_NAME = new Map(REPS.map((r) => [r.id, r.name]));

// Extracted work-type kind → valid azat.task_kind enum value. All collapse to
// 'followup' (see header note). Kept explicit so it is auditable / easy to remap.
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

// Deal stages that count as "open" (contact already has an active deal → don't add another).
const OPEN_STAGES = ["new", "specs", "quote", "approval", "proof", "payment"];

// The tenant used by the deal→pipeline sync trigger (for mirror-lead cleanup on reset).
const PIPELINE_TENANT = "e7f948cb-b4e2-4de6-808d-a0e87090d6f6";

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

// ── Supabase clients ──────────────────────────────────────────────────────────
function azatClient(): DB {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { db: { schema: "azat" }, auth: { autoRefreshToken: false, persistSession: false } }
  );
}
function publicClient(): DB {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// The useful text for extraction. Calls store their real content in meta.call_summary
// (the `body` of a call is only a metadata line like "Inbound answered call · 1m 27s"),
// everything else uses the message body.
function pickText(row: CommRow): string | null {
  const meta = row.meta ?? {};
  const cs = typeof meta["call_summary"] === "string" ? (meta["call_summary"] as string) : null;
  const tr = typeof meta["transcript"] === "string" ? (meta["transcript"] as string) : null;
  const candidates =
    row.channel === "call" ? [cs, tr] : [row.body, tr, cs];
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

// Fetch comm_events newest-first, paging until we have `limit` rows with usable text.
async function fetchUsableComms(
  db: DB,
  limit: number,
  channel: string | null
): Promise<CommRow[]> {
  const out: CommRow[] = [];
  const page = 500;
  let offset = 0;
  const hardCap = 6000; // safety ceiling on rows scanned
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
  const { data, error } = await db
    .from("tasks")
    .select("owner_id")
    .is("done_at", null)
    .limit(100000);
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
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

  const db = azatClient();

  try {
    if (mode === "reset") return await handleReset(db);
    if (mode !== "dry" && mode !== "write") {
      return NextResponse.json({ error: `unknown mode '${mode}' (use dry|write|reset)` }, { status: 400 });
    }
    return await handlePromote(db, mode as "dry" | "write", limit, channel);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// ── dry / write ───────────────────────────────────────────────────────────────
async function handlePromote(
  db: DB,
  mode: "dry" | "write",
  limit: number,
  channel: string | null
) {
  const comms = await fetchUsableComms(db, limit, channel);

  // Idempotency: which comm_ids already produced tasks/deals?
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

  // Contact names (for sample rows) + contact owners (for owner resolution).
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

  // Live rep load — mutated locally as we assign so distribution stays balanced.
  const load = await repLoad(db);

  // Resolve owner: linked deal owner → linked lead owner → contact owner → least-loaded rep.
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

  let tasksCreated = 0;
  let dealsCreated = 0;
  let skippedIdempotentTasks = 0;
  let skippedIdempotentDeals = 0;
  let dealsSkippedNoContact = 0;
  let dealsSkippedOpenExists = 0;
  const distribution = new Map<string, number>(); // owner_id → #tasks assigned this run
  const samples: unknown[] = [];

  // Small concurrency for the OpenAI extraction.
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
        }).then((r) => ({ c, r }))
      )
    );

    for (const { c, r } of extracted) {
      const owner = await resolveOwner(c);

      // ---- tasks ----
      const alreadyHasTasks = doneTasks.has(c.id);
      if (alreadyHasTasks && r.tasks.length) skippedIdempotentTasks += r.tasks.length;
      const willTasks = alreadyHasTasks ? [] : r.tasks;

      if (willTasks.length) {
        distribution.set(owner, (distribution.get(owner) ?? 0) + willTasks.length);
        load.set(owner, (load.get(owner) ?? 0) + willTasks.length); // keep least-loaded fair within the run
      }

      // ---- deal ----
      let willDeal = false;
      let dealSkipReason: string | null = null;
      if (r.deal?.detected) {
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

      // ---- perform writes ----
      if (mode === "write") {
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
              ids.map((x) => ({ entity_type: "task", entity_id: x.id, comm_id: c.id, kind: "task" }))
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
              message: r.headline,
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
        // dry-run tallies
        if (willTasks.length) tasksCreated += willTasks.length;
        if (willDeal) dealsCreated += 1;
      }

      if (samples.length < 10) {
        samples.push({
          contact: c.contact_id ? contactName.get(c.contact_id) ?? c.contact_id : null,
          channel: c.channel,
          headline: r.headline,
          tasks: (alreadyHasTasks ? r.tasks : willTasks).map((t) => ({ kind: t.kind, mapped_kind: mapKind(t.kind), title: t.title })),
          deal: r.deal?.detected
            ? {
                product: r.deal.product,
                quantity: r.deal.quantity,
                amount: r.deal.amount,
                value_cents: parseAmountCents(r.deal.amount),
                quote_promised: r.deal.quote_promised,
                stage: r.deal.quote_promised ? "quote" : "specs",
                would_create: willDeal,
                skip_reason: dealSkipReason,
              }
            : null,
          owner: REP_NAME.get(owner) ?? owner,
        });
      }
    }
  }

  const byRep = Array.from(distribution.entries())
    .map(([id, n]) => ({ rep: REP_NAME.get(id) ?? id, tasks: n }))
    .sort((a, b) => b.tasks - a.tasks);

  return NextResponse.json({
    mode,
    wrote: mode === "write",
    params: { limit, channel: channel ?? "(all)" },
    scanned_comms: comms.length,
    openai_key_present: Boolean(process.env.OPENAI_API_KEY),
    tasks_created: tasksCreated,
    deals_created: dealsCreated,
    distribution_by_rep: byRep,
    skipped: {
      idempotent_tasks: skippedIdempotentTasks,
      idempotent_deals: skippedIdempotentDeals,
      deals_no_contact: dealsSkippedNoContact,
      deals_open_exists: dealsSkippedOpenExists,
    },
    samples,
  });
}

// ── reset ───────────────────────────────────────────────────────────────────
async function handleReset(db: DB) {
  const { data: prov, error } = await db.from("engine_provenance").select("entity_type, entity_id");
  if (error) throw new Error(`provenance read failed: ${error.message}`);
  const rows = (prov ?? []) as { entity_type: string; entity_id: string }[];
  const taskIds = rows.filter((r) => r.entity_type === "task").map((r) => r.entity_id);
  const dealIds = rows.filter((r) => r.entity_type === "deal").map((r) => r.entity_id);

  let tasksDeleted = 0;
  let dealsDeleted = 0;
  let mirrorLeadsDeleted = 0;

  // Delete tasks first (they may FK-reference deals), then deals.
  if (taskIds.length) {
    const { data, error: e } = await db.from("tasks").delete().in("id", taskIds).select("id");
    if (e) throw new Error(`task delete failed: ${e.message}`);
    tasksDeleted = (data ?? []).length;
  }

  // Clean the public.leads mirror rows the deal-sync trigger created for engine deals
  // (best-effort — a permission issue here must not block the azat reset).
  if (dealIds.length) {
    try {
      const pub = publicClient();
      const { data, error: e } = await pub
        .from("leads")
        .delete()
        .eq("tenant_id", PIPELINE_TENANT)
        .in("interests->>_azat_deal_id", dealIds)
        .select("id");
      if (!e) mirrorLeadsDeleted = (data ?? []).length;
    } catch {
      /* ignore mirror-cleanup failure */
    }

    const { data, error: e } = await db.from("deals").delete().in("id", dealIds).select("id");
    if (e) throw new Error(`deal delete failed: ${e.message}`);
    dealsDeleted = (data ?? []).length;
  }

  // Clear provenance table entirely.
  const { error: e2 } = await db.from("engine_provenance").delete().neq("entity_type", "__none__");
  if (e2) throw new Error(`provenance clear failed: ${e2.message}`);

  return NextResponse.json({
    mode: "reset",
    tasks_deleted: tasksDeleted,
    deals_deleted: dealsDeleted,
    mirror_leads_deleted: mirrorLeadsDeleted,
    provenance_rows_cleared: rows.length,
  });
}
