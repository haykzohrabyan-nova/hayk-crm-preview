import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { REPS, REP_NAME, repName } from "@/lib/azat/reps";

export { REPS, REP_NAME, repName };

// Schema-agnostic client type — the azat-scoped client differs from the public
// one only in its Schema generic, so widen it to satisfy helper signatures.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AzatClient = SupabaseClient<any, any, any, any, any>;

/**
 * Service-role client scoped to the `azat` schema (rep CRM data: tasks, deals,
 * contacts, comm_events). Server-only — never import in a client component.
 * Mirrors the pattern in app/api/dev/promote-actions/route.ts.
 */
export function createAzatClient(): AzatClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { db: { schema: "azat" }, auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * A call row is "missed" when it is inbound AND either the provider recorded a
 * non-empty `missed_reason`, or the AI `call_summary` reads like a no-answer /
 * voicemail. Answered calls have neither. Kept in one place so the Missed Calls
 * page and the My Day tile agree.
 */
const NO_ANSWER_SUMMARY = /(no answer|no response|not picked|didn'?t answer|didn'?t pick|voicemail|left a message|unable to reach|no one answered)/i;

export function isMissedCall(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta ?? {};
  const missedReason = typeof m["missed_reason"] === "string" ? (m["missed_reason"] as string).trim() : "";
  if (missedReason.length > 0) return true;
  const summary = typeof m["call_summary"] === "string" ? (m["call_summary"] as string) : "";
  if (summary && NO_ANSWER_SUMMARY.test(summary)) return true;
  return false;
}

/** Current open-task load per rep (owner_id, done_at IS NULL) within the pool. */
export async function fetchRepLoad(db: AzatClient): Promise<Map<string, number>> {
  const load = new Map<string, number>(REPS.map((r) => [r.id, 0]));
  const { data } = await db.from("tasks").select("owner_id").is("done_at", null).limit(100000);
  for (const row of (data ?? []) as { owner_id: string | null }[]) {
    if (row.owner_id && load.has(row.owner_id)) {
      load.set(row.owner_id, (load.get(row.owner_id) ?? 0) + 1);
    }
  }
  return load;
}

// ── Display helpers (shared by My Day + Tasks so rows read consistently) ──────

/** Format a raw phone string as (XXX) XXX-XXXX when it looks like a US number. */
export function prettyPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return raw.trim() || null;
}

/** Channel → short human source hint ("from call" / "from email" / "from text"). */
export function channelSourceHint(channel: string | null | undefined): string | null {
  switch ((channel ?? "").toLowerCase()) {
    case "call":
      return "from call";
    case "email":
      return "from email";
    case "sms":
    case "text":
      return "from text";
    default:
      return null;
  }
}

/** Collapse whitespace and trim to a short single-line snippet. */
export function textSnippet(s: string | null | undefined, max = 90): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Least-loaded rep in the pool (ties break to pool order). */
export function leastLoadedRep(load: Map<string, number>): string {
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

// ── Task / deal insert helpers + engine-provenance idempotency ────────────────
// Shared by the promise engine (app/api/dev/promote-actions) and the lead-intake
// route (app/api/leads/ingest). Every created task/deal is recorded in
// azat.engine_provenance so a re-run/re-POST never duplicates it.

/** Parse a free-text money string ("$1,250.00") to integer cents (0 if none). */
export function parseAmountCents(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  if (!isFinite(v) || v <= 0) return 0;
  return Math.round(v * 100);
}

/** ISO timestamp `hours` from `fromIso` (defaults to now). */
export function plusHours(hours: number, fromIso?: string | null): string {
  const t = fromIso ? new Date(fromIso).getTime() : Date.now();
  return new Date((isNaN(t) ? Date.now() : t) + hours * 3_600_000).toISOString();
}

/** Resolve the azat.comm_events id for a (source, source_id) pair. */
export async function commIdFor(
  db: AzatClient,
  source: string,
  sourceId: string,
): Promise<string | null> {
  const { data } = await db
    .from("comm_events")
    .select("id")
    .eq("source", source)
    .eq("source_id", sourceId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Set of `${entity_type}:${kind}` markers already recorded for this comm — used
 * to skip re-creating a task/deal we produced on an earlier POST of the same
 * (source, source_id). `comm_id` is a tracked (non-unique) column, so we filter.
 */
export async function provenanceMarkers(
  db: AzatClient,
  commId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await db
    .from("engine_provenance")
    .select("entity_type, kind")
    .eq("comm_id", commId);
  for (const p of (data ?? []) as { entity_type: string; kind: string | null }[]) {
    out.add(`${p.entity_type}:${p.kind ?? ""}`);
  }
  return out;
}

/** Record one engine-provenance row (idempotent on its (entity_type, entity_id) PK). */
async function recordProvenance(
  db: AzatClient,
  entityType: "task" | "deal",
  entityId: string,
  commId: string | null,
  kind: string,
): Promise<void> {
  await db
    .from("engine_provenance")
    .upsert(
      { entity_type: entityType, entity_id: entityId, comm_id: commId, kind },
      { onConflict: "entity_type,entity_id", ignoreDuplicates: true },
    );
}

export type TaskInput = {
  kind: string; // azat.task_kind enum value (e.g. 'followup')
  label: string;
  dueAt: string;
  ownerId: string | null;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
};

/**
 * Insert an azat.tasks row and record its provenance under `provKind`.
 * Returns the new task id (null if the insert returned nothing).
 */
export async function insertTaskWithProvenance(
  db: AzatClient,
  task: TaskInput,
  commId: string | null,
  provKind: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("tasks")
    .insert({
      kind: task.kind,
      label: task.label,
      due_at: task.dueAt,
      owner_id: task.ownerId,
      contact_id: task.contactId ?? null,
      lead_id: task.leadId ?? null,
      deal_id: task.dealId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`task insert failed: ${error.message}`);
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) await recordProvenance(db, "task", id, commId, provKind);
  return id;
}

/**
 * Adopt the open follow-up task the warm-lead trigger already created for `leadId`
 * (or, if none exists, create one) and record its provenance. Idempotent: safe to
 * call alongside the durable trigger without producing a duplicate.
 */
export async function ensureLeadFollowupTask(
  db: AzatClient,
  args: { leadId: string; contactId: string | null; ownerId: string; label: string; dueAt: string },
  commId: string | null,
  provKind: string,
): Promise<{ id: string | null; created: boolean }> {
  const { data: existing } = await db
    .from("tasks")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("kind", "followup")
    .is("done_at", null)
    .limit(1);
  const found = (existing ?? []) as { id: string }[];
  if (found.length) {
    await recordProvenance(db, "task", found[0].id, commId, provKind);
    return { id: found[0].id, created: false };
  }
  const id = await insertTaskWithProvenance(
    db,
    { kind: "followup", label: args.label, dueAt: args.dueAt, ownerId: args.ownerId, contactId: args.contactId, leadId: args.leadId },
    commId,
    provKind,
  );
  return { id, created: true };
}

export type DealInput = {
  stage: string; // azat.deal_stage value
  title: string;
  message: string;
  valueCents: number;
  contactId: string;
  orgId: string | null;
  ownerId: string | null;
  sourceChannel: string;
};

/** Insert an azat.deals row and record its provenance under 'ingest_deal'. */
export async function insertDealWithProvenance(
  db: AzatClient,
  deal: DealInput,
  commId: string | null,
): Promise<string | null> {
  const { data, error } = await db
    .from("deals")
    .insert({
      stage: deal.stage,
      title: deal.title.slice(0, 200),
      message: deal.message,
      value_cents: deal.valueCents,
      contact_id: deal.contactId,
      org_id: deal.orgId,
      owner_id: deal.ownerId,
      source: "auto",
      source_channel: deal.sourceChannel,
    })
    .select("id")
    .single();
  if (error) throw new Error(`deal insert failed: ${error.message}`);
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) await recordProvenance(db, "deal", id, commId, "ingest_deal");
  return id;
}

/** Does `contactId` already have an open (non-terminal) deal? */
export async function hasOpenDeal(db: AzatClient, contactId: string): Promise<boolean> {
  const OPEN_STAGES = ["new", "specs", "quote", "approval", "proof", "payment"];
  const { data } = await db
    .from("deals")
    .select("id")
    .eq("contact_id", contactId)
    .in("stage", OPEN_STAGES)
    .limit(1);
  return Boolean((data ?? []).length);
}
