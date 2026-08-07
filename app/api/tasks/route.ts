// Tasks board API (azat.tasks). Rep-facing follow-up tasks.
//  GET  /api/tasks?owner=<id|all>      → open + recently-done tasks (with contact/deal context)
//  POST /api/tasks                     → create a followup task (assigned to least-loaded rep)
//
// Auth: same session + page-access gate as the sales pipeline. Reads/writes go
// through the service-role azat-schema client (see lib/azat/server.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  createAzatClient,
  fetchRepLoad,
  leastLoadedRep,
  repName,
  prettyPhone,
  channelSourceHint,
  textSnippet,
} from "@/lib/azat/server";
import { isAdminRole } from "@/lib/auth/role-checks";
import { REP_NAME } from "@/lib/azat/reps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasks whose done_at is within this window still show under the "Done" column.
const RECENT_DONE_DAYS = 7;

// Action-type ("functional") column a task belongs to. Derived from the task's
// human label + kind so the board groups by what the rep must DO, not by date.
export type TaskCategory = "callback" | "quote" | "deal" | "followup" | "done";

/**
 * Derive the board column for a task from its label (lowercased) + kind:
 *   done_at set                                            → done
 *   contains "quote"                                       → quote     (Send quote)
 *   contains call/callback/call back/reach/phone/voicemail → callback  (Call back)
 *   contains deal/order/product/spec/sample                → deal      (Create deal)
 *   otherwise                                              → followup  (Follow-up)
 * Checked in this order; the first match wins.
 */
function deriveCategory(
  label: string | null,
  kind: string | null,
  doneAt: string | null,
): TaskCategory {
  if (doneAt) return "done";
  const s = `${label ?? ""} ${kind ?? ""}`.toLowerCase();
  if (s.includes("quote")) return "quote";
  if (
    s.includes("call") || // covers "call", "callback", "call back"
    s.includes("reach") ||
    s.includes("phone") ||
    s.includes("voicemail")
  ) {
    return "callback";
  }
  if (
    s.includes("deal") ||
    s.includes("order") ||
    s.includes("product") ||
    s.includes("spec") ||
    s.includes("sample")
  ) {
    return "deal";
  }
  return "followup";
}

type TaskRow = {
  id: string;
  kind: string | null;
  label: string | null;
  due_at: string | null;
  done_at: string | null;
  owner_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  created_at: string | null;
};

async function gate() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return { errorResponse } as const;
  const deny = await requirePageAccess(userId!, roleName, "/tasks");
  if (deny) return { errorResponse: deny } as const;
  return { userId: userId!, roleName } as const;
}

type ContactRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_id: string | null;
  phone: string | null;
  email: string | null;
};
type DealRow = {
  id: string;
  title: string | null;
  message: string | null;
  contact_id: string | null;
  org_id: string | null;
  source_channel: string | null;
};
type LeadRow = {
  id: string;
  contact_id: string | null;
  organization_id: string | null;
  products: unknown;
  message: string | null;
  channel: string | null;
};

/** Best "who" label for a contact: real name → org name → phone → email. */
function contactWho(c: ContactRow | undefined, orgName: string | null): string | null {
  if (!c) return orgName;
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return (c.name?.trim() || full || null) ?? orgName ?? prettyPhone(c.phone) ?? c.email ?? null;
}

/** Turn a lead.products value (string | string[] | jsonish) into a short label. */
function productsLabel(products: unknown): string | null {
  if (!products) return null;
  if (Array.isArray(products)) return textSnippet(products.filter(Boolean).join(", "));
  if (typeof products === "string") return textSnippet(products);
  return null;
}

/**
 * Attach owner + who/what/source display fields to a set of task rows.
 *
 * Tasks often carry only a deal_id or lead_id (contact_id null), so we resolve
 * the contact THROUGH the linked deal/lead, then resolve organization names,
 * so every card can answer who it's about even when the task row itself is bare.
 */
async function decorate(db: ReturnType<typeof createAzatClient>, rows: TaskRow[]) {
  const dealIds = Array.from(new Set(rows.map((r) => r.deal_id).filter(Boolean))) as string[];
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean))) as string[];

  const deals = new Map<string, DealRow>();
  const leads = new Map<string, LeadRow>();
  if (dealIds.length) {
    const { data } = await db
      .from("deals")
      .select("id, title, message, contact_id, org_id, source_channel")
      .in("id", dealIds);
    for (const d of (data ?? []) as DealRow[]) deals.set(d.id, d);
  }
  if (leadIds.length) {
    const { data } = await db
      .from("leads")
      .select("id, contact_id, organization_id, products, message, channel")
      .in("id", leadIds);
    for (const l of (data ?? []) as LeadRow[]) leads.set(l.id, l);
  }

  // Resolve the effective contact for each task (direct → via deal → via lead).
  const effContactId = (r: TaskRow): string | null =>
    r.contact_id ??
    (r.deal_id ? deals.get(r.deal_id)?.contact_id ?? null : null) ??
    (r.lead_id ? leads.get(r.lead_id)?.contact_id ?? null : null);

  const contactIds = Array.from(
    new Set(rows.map(effContactId).filter(Boolean)),
  ) as string[];

  const contacts = new Map<string, ContactRow>();
  if (contactIds.length) {
    const { data } = await db
      .from("contacts")
      .select("id, name, first_name, last_name, organization_id, phone, email")
      .in("id", contactIds);
    for (const c of (data ?? []) as ContactRow[]) contacts.set(c.id, c);
  }

  // Organization names — from the contact, the deal, or the lead.
  const orgIds = new Set<string>();
  for (const c of contacts.values()) if (c.organization_id) orgIds.add(c.organization_id);
  for (const d of deals.values()) if (d.org_id) orgIds.add(d.org_id);
  for (const l of leads.values()) if (l.organization_id) orgIds.add(l.organization_id);
  const orgName = new Map<string, string>();
  if (orgIds.size) {
    const { data } = await db.from("organizations").select("id, name").in("id", Array.from(orgIds));
    for (const o of (data ?? []) as { id: string; name: string | null }[]) {
      if (o.name) orgName.set(o.id, o.name);
    }
  }

  return rows.map((r) => {
    const deal = r.deal_id ? deals.get(r.deal_id) : undefined;
    const lead = r.lead_id ? leads.get(r.lead_id) : undefined;
    const cid = effContactId(r);
    const contact = cid ? contacts.get(cid) : undefined;

    const orgId = contact?.organization_id ?? deal?.org_id ?? lead?.organization_id ?? null;
    const company = orgId ? orgName.get(orgId) ?? null : null;

    const who = contactWho(contact, company);
    // What the task is about: deal title → lead products → deal/lead message snippet.
    const what =
      textSnippet(deal?.title) ??
      productsLabel(lead?.products) ??
      textSnippet(deal?.message) ??
      textSnippet(lead?.message) ??
      null;
    const sourceHint = channelSourceHint(deal?.source_channel ?? lead?.channel ?? null);

    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      due_at: r.due_at,
      done_at: r.done_at,
      owner_id: r.owner_id,
      owner_name: repName(r.owner_id),
      contact_id: cid,
      // "who" — never blank when any identifier exists; used for display + /crm link.
      contact_name: who,
      company_name: company && company !== who ? company : null,
      deal_id: r.deal_id,
      deal_title: deal?.title ?? null,
      // "what" — short subject the card can show under the action.
      what,
      source_hint: sourceHint,
      lead_id: r.lead_id,
      created_at: r.created_at,
      // Action-type column for the functional Tasks board.
      category: deriveCategory(r.label, r.kind, r.done_at),
    };
  });
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const g = await gate();
  if ("errorResponse" in g) return g.errorResponse;

  const owner = req.nextUrl.searchParams.get("owner") ?? "all";
  const db = createAzatClient();

  const sinceIso = new Date(Date.now() - RECENT_DONE_DAYS * 86400_000).toISOString();

  let q = db
    .from("tasks")
    .select("id, kind, label, due_at, done_at, owner_id, contact_id, lead_id, deal_id, created_at")
    // open tasks (done_at null) OR tasks completed within the recent window
    .or(`done_at.is.null,done_at.gte.${sinceIso}`)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500);

  if (owner && owner !== "all") q = q.eq("owner_id", owner);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tasks = await decorate(db, (data ?? []) as TaskRow[]);
  return NextResponse.json({ tasks });
}

// ── POST (create followup) ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const g = await gate();
  if ("errorResponse" in g) return g.errorResponse;

  let body: {
    label?: string;
    kind?: string;
    contact_id?: string | null;
    lead_id?: string | null;
    deal_id?: string | null;
    owner_id?: string | null;
    due_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const db = createAzatClient();

  // Owner assignment + role gating:
  //  - managers/admins may assign to any rep in the pool (explicit owner_id).
  //  - non-managers may only create tasks for themselves — any owner_id they send
  //    is ignored and forced to their own id.
  //  - when no owner is resolved, fall back to the least-loaded rep.
  const isManager = isAdminRole(g.roleName);
  let owner: string | null = null;
  if (isManager) {
    owner = body.owner_id && REP_NAME.has(body.owner_id) ? body.owner_id : null;
  } else {
    owner = g.userId;
  }
  if (!owner) {
    const load = await fetchRepLoad(db);
    owner = leastLoadedRep(load);
  }

  // Valid azat.task_kind enum values (see promote-actions header note).
  const VALID_KINDS = new Set(["first_touch", "ask1", "ask2", "decide", "followup", "parked_return"]);
  const kind = body.kind && VALID_KINDS.has(body.kind) ? body.kind : "followup";

  const dueAt = body.due_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const insertRow = {
    kind,
    label: body.label?.trim() || "Follow up",
    due_at: dueAt,
    owner_id: owner,
    contact_id: body.contact_id ?? null,
    lead_id: body.lead_id ?? null,
    deal_id: body.deal_id ?? null,
  };

  const { data, error } = await db.from("tasks").insert(insertRow).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [task] = await decorate(db, [data as TaskRow]);
  return NextResponse.json({ task });
}
