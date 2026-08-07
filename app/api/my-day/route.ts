// My Day API — a rep's glanceable morning view.
//  GET /api/my-day?owner=<id>
//
// Returns five counts + a top-5 preview list for each:
//   tasks        — open tasks owned by the rep (done_at IS NULL)
//   deals        — open deals owned by the rep (stage not won/lost)
//   emails       — recent inbound emails on the rep's contacts
//   missed_calls — recent inbound missed calls on the rep's phone line
//   messages     — recent inbound SMS on the rep's contacts
//
// SIMPLIFICATION (intentional — keep counting simple): azat.comm_events has no
// direct rep-owner column, so emails and SMS are attributed via the OWNING
// CONTACT (contacts.owner_id = rep) using an inner-join filter. Missed calls DO
// carry a clean owner link in meta.line_owner_user_id, so those are scoped by
// that. "Recent" = last 30 days.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  createAzatClient,
  REPS,
  isMissedCall,
  prettyPhone,
  channelSourceHint,
  textSnippet,
} from "@/lib/azat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPEN_STAGES_EXCLUDED = ["won", "lost"];
const RECENT_DAYS = 30;
// Preview lists are scrollable inside each card, so surface a deep list (not just
// a top-5). The count badge always shows the true total from the count query.
const PREVIEW = 30;

export async function GET(req: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/my-day");
  if (deny) return deny;

  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "owner is required." }, { status: 400 });

  const db = createAzatClient();
  const sinceIso = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString();

  // ── Tasks ──
  const tasksCountP = db
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", owner)
    .is("done_at", null);
  const tasksListP = db
    .from("tasks")
    .select("id, label, kind, due_at, contact_id, deal_id, lead_id")
    .eq("owner_id", owner)
    .is("done_at", null)
    // Most urgent first: earliest due date (overdue) first, undated last.
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(PREVIEW);

  // ── Deals ──
  const dealsCountP = db
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", owner)
    .not("stage", "in", `(${OPEN_STAGES_EXCLUDED.join(",")})`);
  const dealsListP = db
    .from("deals")
    .select("id, title, stage, value_cents, last_activity_at, contact_id, org_id")
    .eq("owner_id", owner)
    .not("stage", "in", `(${OPEN_STAGES_EXCLUDED.join(",")})`)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(PREVIEW);

  // ── Emails (inbound, on rep's contacts) ──
  const emailsCountP = db
    .from("comm_events")
    .select("id, contacts!inner(owner_id)", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("direction", "inbound")
    .gte("received_at", sinceIso)
    .eq("contacts.owner_id", owner);
  const emailsListP = db
    .from("comm_events")
    .select("id, subject, received_at, contact_id, meta, contacts!inner(name, owner_id)")
    .eq("channel", "email")
    .eq("direction", "inbound")
    .gte("received_at", sinceIso)
    .eq("contacts.owner_id", owner)
    .order("received_at", { ascending: false })
    .limit(PREVIEW);

  // ── Messages / SMS (inbound, on rep's contacts) ──
  const smsCountP = db
    .from("comm_events")
    .select("id, contacts!inner(owner_id)", { count: "exact", head: true })
    .eq("channel", "sms")
    .eq("direction", "inbound")
    .gte("received_at", sinceIso)
    .eq("contacts.owner_id", owner);
  const smsListP = db
    .from("comm_events")
    .select("id, body, received_at, contact_id, meta, contacts!inner(name, owner_id)")
    .eq("channel", "sms")
    .eq("direction", "inbound")
    .gte("received_at", sinceIso)
    .eq("contacts.owner_id", owner)
    .order("received_at", { ascending: false })
    .limit(PREVIEW);

  // ── Missed calls (inbound, rep's phone line) ──
  // Scan recent inbound calls on this rep's line, then apply the missed rule in
  // JS (missed_reason lives inside JSON meta).
  const callsScanP = db
    .from("comm_events")
    .select("id, received_at, contact_id, meta")
    .eq("channel", "call")
    .eq("direction", "inbound")
    .eq("meta->>line_owner_user_id", owner)
    .gte("received_at", sinceIso)
    .order("received_at", { ascending: false })
    .limit(300);

  const [
    tasksCount,
    tasksList,
    dealsCount,
    dealsList,
    emailsCount,
    emailsList,
    smsCount,
    smsList,
    callsScan,
  ] = await Promise.all([
    tasksCountP,
    tasksListP,
    dealsCountP,
    dealsListP,
    emailsCountP,
    emailsListP,
    smsCountP,
    smsListP,
    callsScanP,
  ]);

  const firstErr = [
    tasksCount.error,
    tasksList.error,
    dealsCount.error,
    dealsList.error,
    emailsCount.error,
    emailsList.error,
    smsCount.error,
    smsList.error,
    callsScan.error,
  ].find(Boolean);
  if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 });

  type CallScanRow = { id: string; received_at: string; contact_id: string | null; meta: Record<string, unknown> | null };
  const missedCalls = ((callsScan.data ?? []) as CallScanRow[]).filter((c) => isMissedCall(c.meta));
  const missedPreview = missedCalls.slice(0, PREVIEW);

  // ── Enrichment: resolve who/what/source across every preview list ─────────────
  type TaskRow = { id: string; label: string | null; kind: string | null; due_at: string | null; contact_id: string | null; deal_id: string | null; lead_id: string | null };
  type DealRow = { id: string; title: string | null; stage: string | null; value_cents: number | null; last_activity_at: string | null; contact_id: string | null; org_id: string | null };
  type ContactRow = { id: string; name: string | null; first_name: string | null; last_name: string | null; organization_id: string | null; phone: string | null; email: string | null };

  const taskRows = (tasksList.data ?? []) as TaskRow[];
  const dealRows = (dealsList.data ?? []) as DealRow[];

  // Deals + leads referenced by tasks (tasks often carry only a deal_id / lead_id).
  const taskDealIds = Array.from(new Set(taskRows.map((t) => t.deal_id).filter(Boolean))) as string[];
  const taskLeadIds = Array.from(new Set(taskRows.map((t) => t.lead_id).filter(Boolean))) as string[];
  const taskDeals = new Map<string, { contact_id: string | null; org_id: string | null; title: string | null; message: string | null; source_channel: string | null }>();
  const taskLeads = new Map<string, { contact_id: string | null; organization_id: string | null; products: unknown; message: string | null; channel: string | null }>();
  const [tdRes, tlRes] = await Promise.all([
    taskDealIds.length
      ? db.from("deals").select("id, contact_id, org_id, title, message, source_channel").in("id", taskDealIds)
      : Promise.resolve({ data: [] as unknown[] }),
    taskLeadIds.length
      ? db.from("leads").select("id, contact_id, organization_id, products, message, channel").in("id", taskLeadIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  for (const d of (tdRes.data ?? []) as { id: string; contact_id: string | null; org_id: string | null; title: string | null; message: string | null; source_channel: string | null }[]) {
    taskDeals.set(d.id, { contact_id: d.contact_id, org_id: d.org_id, title: d.title, message: d.message, source_channel: d.source_channel });
  }
  for (const l of (tlRes.data ?? []) as { id: string; contact_id: string | null; organization_id: string | null; products: unknown; message: string | null; channel: string | null }[]) {
    taskLeads.set(l.id, { contact_id: l.contact_id, organization_id: l.organization_id, products: l.products, message: l.message, channel: l.channel });
  }

  const taskEffContact = (t: TaskRow): string | null =>
    t.contact_id ??
    (t.deal_id ? taskDeals.get(t.deal_id)?.contact_id ?? null : null) ??
    (t.lead_id ? taskLeads.get(t.lead_id)?.contact_id ?? null : null);

  // All contacts we need names for: tasks (effective), deals, missed calls.
  const allContactIds = Array.from(
    new Set([
      ...taskRows.map(taskEffContact),
      ...dealRows.map((d) => d.contact_id),
      ...missedPreview.map((c) => c.contact_id),
    ].filter(Boolean)),
  ) as string[];
  const contacts = new Map<string, ContactRow>();
  if (allContactIds.length) {
    const { data } = await db
      .from("contacts")
      .select("id, name, first_name, last_name, organization_id, phone, email")
      .in("id", allContactIds);
    for (const c of (data ?? []) as ContactRow[]) contacts.set(c.id, c);
  }

  // Organization names — from contacts, deals, task-deals, task-leads.
  const orgIds = new Set<string>();
  for (const c of contacts.values()) if (c.organization_id) orgIds.add(c.organization_id);
  for (const d of dealRows) if (d.org_id) orgIds.add(d.org_id);
  for (const d of taskDeals.values()) if (d.org_id) orgIds.add(d.org_id);
  for (const l of taskLeads.values()) if (l.organization_id) orgIds.add(l.organization_id);
  const orgName = new Map<string, string>();
  if (orgIds.size) {
    const { data } = await db.from("organizations").select("id, name").in("id", Array.from(orgIds));
    for (const o of (data ?? []) as { id: string; name: string | null }[]) {
      if (o.name) orgName.set(o.id, o.name);
    }
  }

  // Best "who" for a contact: name → org → phone → email.
  const whoOf = (contactId: string | null, fallbackOrgId: string | null): { who: string | null; company: string | null } => {
    const c = contactId ? contacts.get(contactId) : undefined;
    const orgId = c?.organization_id ?? fallbackOrgId ?? null;
    const company = orgId ? orgName.get(orgId) ?? null : null;
    if (!c) return { who: company, company: null };
    const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    const who = (c.name?.trim() || full || null) ?? company ?? prettyPhone(c.phone) ?? c.email ?? null;
    return { who, company: company && company !== who ? company : null };
  };

  const productsLabel = (products: unknown): string | null => {
    if (!products) return null;
    if (Array.isArray(products)) return textSnippet(products.filter(Boolean).join(", "));
    if (typeof products === "string") return textSnippet(products);
    return null;
  };

  // Sender fallback for email/sms rows when the contact has no name on file.
  function emailSender(meta: Record<string, unknown> | null | undefined): string | null {
    const from = (meta ?? {})["from"];
    if (from && typeof from === "object") {
      const f = from as { name?: string | null; email?: string | null };
      return f.name?.trim() || f.email?.trim() || null;
    }
    return null;
  }
  function smsSender(meta: Record<string, unknown> | null | undefined): string | null {
    const m = meta ?? {};
    const raw = typeof m["from_number"] === "string" ? (m["from_number"] as string) : typeof m["from"] === "string" ? (m["from"] as string) : null;
    return prettyPhone(raw);
  }
  function contactNameJoined(row: { contacts?: { name?: string | null } | { name?: string | null }[] | null }): string | null {
    const c = row.contacts;
    if (!c) return null;
    const one = Array.isArray(c) ? c[0] : c;
    return one?.name?.trim() || null;
  }

  const repMeta = REPS.find((r) => r.id === owner);

  return NextResponse.json({
    owner,
    owner_name: repMeta?.name ?? null,
    counts: {
      tasks: tasksCount.count ?? 0,
      deals: dealsCount.count ?? 0,
      emails: emailsCount.count ?? 0,
      missed_calls: missedCalls.length,
      messages: smsCount.count ?? 0,
    },
    previews: {
      tasks: taskRows.map((t) => {
        const deal = t.deal_id ? taskDeals.get(t.deal_id) : undefined;
        const lead = t.lead_id ? taskLeads.get(t.lead_id) : undefined;
        const orgFallback = deal?.org_id ?? lead?.organization_id ?? null;
        const { who, company } = whoOf(taskEffContact(t), orgFallback);
        const what =
          textSnippet(deal?.title) ??
          productsLabel(lead?.products) ??
          textSnippet(deal?.message) ??
          textSnippet(lead?.message) ??
          null;
        return {
          id: t.id,
          label: t.label,
          kind: t.kind,
          due_at: t.due_at,
          contact_id: t.contact_id,
          deal_id: t.deal_id,
          who,
          company_name: company,
          what,
          source_hint: channelSourceHint(deal?.source_channel ?? lead?.channel ?? null),
        };
      }),
      deals: dealRows.map((d) => {
        const { who, company } = whoOf(d.contact_id, d.org_id);
        return {
          id: d.id,
          title: d.title,
          stage: d.stage,
          value_cents: d.value_cents,
          last_activity_at: d.last_activity_at,
          who,
          company_name: company,
        };
      }),
      emails: ((emailsList.data ?? []) as { id: string; subject: string | null; received_at: string; contact_id: string | null; meta: Record<string, unknown> | null; contacts?: unknown }[]).map((e) => ({
        id: e.id,
        subject: e.subject,
        received_at: e.received_at,
        contact_id: e.contact_id,
        // "who" — never blank: contact name → sender name/email.
        contact_name: contactNameJoined(e as { contacts?: { name?: string | null } | null }) ?? emailSender(e.meta) ?? "Unknown sender",
      })),
      missed_calls: missedPreview.map((c) => {
        const named = c.contact_id ? contacts.get(c.contact_id)?.name?.trim() || null : null;
        const reason = typeof c.meta?.["missed_reason"] === "string" && (c.meta["missed_reason"] as string).trim()
          ? (c.meta["missed_reason"] as string).trim()
          : null;
        return {
          id: c.id,
          received_at: c.received_at,
          contact_id: c.contact_id,
          caller:
            named ??
            (typeof c.meta?.["contact_name"] === "string" ? (c.meta["contact_name"] as string) : null) ??
            prettyPhone(typeof c.meta?.["from_number"] === "string" ? (c.meta["from_number"] as string) : null) ??
            "Unknown caller",
          reason,
        };
      }),
      messages: ((smsList.data ?? []) as { id: string; body: string | null; received_at: string; contact_id: string | null; meta: Record<string, unknown> | null; contacts?: unknown }[]).map((s) => ({
        id: s.id,
        body: s.body,
        received_at: s.received_at,
        contact_id: s.contact_id,
        contact_name: contactNameJoined(s as { contacts?: { name?: string | null } | null }) ?? smsSender(s.meta) ?? "Unknown sender",
      })),
    },
  });
}
