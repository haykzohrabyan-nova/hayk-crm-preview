// Unified lifecycle Pipeline API (azat schema).
//   GET /api/pipeline
//
// Returns one strip of a customer's whole lifecycle, bucketed into the columns the
// board draws left→right: New Lead · Claimed · Deal (Specs) · Quoted · Approved ·
// Paid · Won · Lost. A record is a LEAD in the first two columns (+ lost-dropped)
// and a DEAL in the deal columns — different rows underneath, drawn on one board.
//
// COLUMN BUCKETING (server-side, so quote/payment signals stay here)
//   Leads (azat.leads, joined to contacts for the name + organizations for company):
//     new_lead = owner_id IS NULL AND status NOT IN (dropped, parked, qualified)
//     claimed  = owner_id set AND status = 'working'
//     lost     = status = 'dropped'
//     (qualified / parked / owned-unresponsive leads are represented by their deal,
//      so they are not drawn as a lead card.)
//   Deals (azat.deals by stage, promoted by quote/payment signals):
//     specs    = stage in (new, specs)
//     quoted   = stage = 'quote'    OR a quote row status = 'sent'
//     approved = stage in (approval, proof) OR latest quote status = 'accepted'
//     paid     = stage = 'payment'  OR a payment row status = 'paid'
//     won      = stage = 'won'
//     lost     = stage = 'lost'
//   Precedence runs furthest-right first (won → lost → paid → approved → quoted →
//   specs) so a paid deal never falls back into an earlier column on a stale quote.
//
// DEDUPE: if a lead has been converted to a deal we show the deal, not the lead
// twice. A lead is dropped from the board when a deal references it (deals.lead_ref)
// OR shares its contact_id. "If ambiguous, prefer the deal."
//
// Auth: same requireSession + requirePageAccess("/pipeline") gate as sibling azat
// routes (see app/api/inbox/route.ts). Reads go through the service-role
// azat-schema client (lib/azat/server.ts). Contacts/orgs are resolved with .in()
// splits rather than PostgREST embedded joins (the inbox/promote-actions pattern).

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { createAzatClient, type AzatClient, repName } from "@/lib/azat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Column keys shared with components/pipeline/lifecycle-board.tsx.
export type LeadCol = "new_lead" | "claimed" | "lost";
export type DealCol = "specs" | "quoted" | "approved" | "paid" | "won" | "lost";

type LeadRow = {
  id: string;
  contact_id: string | null;
  organization_id: string | null;
  status: string | null;
  source: string | null;
  channel: string | null;
  products: string | null;
  message: string | null;
  owner_id: string | null;
  arrived_at: string | null;
  created_at: string | null;
  last_activity_at: string | null;
};

type DealRow = {
  id: string;
  lead_ref: string | null;
  contact_id: string | null;
  org_id: string | null;
  owner_id: string | null;
  stage: string;
  title: string | null;
  value_cents: number | null;
  source: string | null;
  source_channel: string | null;
  in_hands_date: string | null;
  blocked: boolean | null;
  last_activity_at: string | null;
  created_at: string | null;
};

type ContactInfo = { name: string | null; organization_id: string | null };

// Shapes returned to the client (components/pipeline/lifecycle-board.tsx mirrors these).
export type PipelineLead = {
  id: string;
  type: "lead";
  col: LeadCol;
  contact_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  who: string;
  company: string | null;
  source: string | null;
  product: string | null;
  status: string | null;
  when: string | null;
  last_activity_at: string | null;
};

export type PipelineDeal = {
  id: string;
  type: "deal";
  col: DealCol;
  contact_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  who: string;
  company: string | null;
  title: string;
  value_cents: number;
  stage: string;
  source: string | null;
  in_hands_date: string | null;
  blocked: boolean;
  when: string | null;
  last_activity_at: string | null;
};

// ── Bucketing ─────────────────────────────────────────────────────────────────

/** Lead → column, or null when the lead is represented by its deal instead. */
function leadCol(status: string | null, ownerId: string | null): LeadCol | null {
  const s = status ?? "";
  if (s === "dropped") return "lost";
  if (ownerId == null) {
    if (s === "parked" || s === "qualified") return null;
    return "new_lead";
  }
  if (s === "working") return "claimed";
  return null;
}

type DealSignals = { quoteSent: boolean; latestAccepted: boolean; paid: boolean };

/** Deal → column. Furthest-right signal wins (see header note). */
function dealCol(stage: string, sig: DealSignals): DealCol {
  if (stage === "won") return "won";
  if (stage === "lost") return "lost";
  if (stage === "payment" || sig.paid) return "paid";
  if (stage === "approval" || stage === "proof" || sig.latestAccepted) return "approved";
  if (stage === "quote" || sig.quoteSent) return "quoted";
  return "specs"; // new, specs, and any unknown early stage
}

// ── Contact / org resolution (one round-trip each, .in() splits) ────────────────
async function fetchContacts(db: AzatClient, ids: string[]): Promise<Map<string, ContactInfo>> {
  const out = new Map<string, ContactInfo>();
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (!clean.length) return out;
  const { data } = await db.from("contacts").select("id, name, organization_id").in("id", clean);
  for (const c of (data ?? []) as ({ id: string } & ContactInfo)[]) {
    out.set(c.id, { name: c.name, organization_id: c.organization_id });
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

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/pipeline");
  if (deny) return deny;

  const db = createAzatClient();

  // ── Pull leads + deals in parallel.
  const leadsP = db
    .from("leads")
    .select(
      "id, contact_id, organization_id, status, source, channel, products, message, owner_id, arrived_at, created_at, last_activity_at",
    )
    .limit(5000);
  const dealsP = db
    .from("deals")
    .select(
      "id, lead_ref, contact_id, org_id, owner_id, stage, title, value_cents, source, source_channel, in_hands_date, blocked, last_activity_at, created_at",
    )
    .limit(5000);

  const [leadsRes, dealsRes] = await Promise.all([leadsP, dealsP]);
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });
  if (dealsRes.error) return NextResponse.json({ error: dealsRes.error.message }, { status: 500 });

  const leadRows = (leadsRes.data ?? []) as LeadRow[];
  const dealRows = (dealsRes.data ?? []) as DealRow[];

  // ── Quote + payment signals per deal (for column promotion).
  const dealIds = dealRows.map((d) => d.id);
  const quoteSent = new Set<string>();
  const latestAccepted = new Set<string>();
  const paid = new Set<string>();
  if (dealIds.length) {
    const [{ data: qData }, { data: pData }] = await Promise.all([
      db.from("quotes").select("deal_id, version, status").in("deal_id", dealIds).limit(10000),
      db.from("payments").select("deal_id, status").in("deal_id", dealIds).limit(20000),
    ]);
    // latest quote (highest version) per deal → track its status; any 'sent' → quoteSent.
    const topVersion = new Map<string, number>();
    const topStatus = new Map<string, string>();
    for (const q of (qData ?? []) as { deal_id: string; version: number | null; status: string | null }[]) {
      if (!q.deal_id) continue;
      if (q.status === "sent") quoteSent.add(q.deal_id);
      const v = q.version ?? 0;
      if (!topVersion.has(q.deal_id) || v >= (topVersion.get(q.deal_id) ?? 0)) {
        topVersion.set(q.deal_id, v);
        topStatus.set(q.deal_id, q.status ?? "");
      }
    }
    for (const [dealId, st] of topStatus) if (st === "accepted") latestAccepted.add(dealId);
    for (const p of (pData ?? []) as { deal_id: string; status: string | null }[]) {
      if (p.deal_id && p.status === "paid") paid.add(p.deal_id);
    }
  }

  // ── Resolve every referenced contact + org in one pass each.
  const contactIds = [
    ...leadRows.map((l) => l.contact_id),
    ...dealRows.map((d) => d.contact_id),
  ].filter(Boolean) as string[];
  const contacts = await fetchContacts(db, contactIds);

  const orgIds: string[] = [];
  for (const l of leadRows) {
    const ct = l.contact_id ? contacts.get(l.contact_id) : undefined;
    if (ct?.organization_id) orgIds.push(ct.organization_id);
    if (l.organization_id) orgIds.push(l.organization_id);
  }
  for (const d of dealRows) {
    const ct = d.contact_id ? contacts.get(d.contact_id) : undefined;
    if (ct?.organization_id) orgIds.push(ct.organization_id);
    if (d.org_id) orgIds.push(d.org_id);
  }
  const orgName = await fetchOrgNames(db, orgIds);

  // ── Dedupe: leads that already became a deal are shown as the deal, not twice.
  const dealContactIds = new Set(dealRows.map((d) => d.contact_id).filter(Boolean) as string[]);
  const dealLeadRefs = new Set(dealRows.map((d) => d.lead_ref).filter(Boolean) as string[]);

  // ── Build deal items.
  const deals: PipelineDeal[] = dealRows.map((d) => {
    const ct = d.contact_id ? contacts.get(d.contact_id) : undefined;
    const orgId = ct?.organization_id ?? d.org_id ?? null;
    const company = orgId ? orgName.get(orgId) ?? null : null;
    const who = ct?.name?.trim() || company || "Untitled deal";
    const col = dealCol(d.stage, {
      quoteSent: quoteSent.has(d.id),
      latestAccepted: latestAccepted.has(d.id),
      paid: paid.has(d.id),
    });
    return {
      id: d.id,
      type: "deal" as const,
      col,
      contact_id: d.contact_id,
      owner_id: d.owner_id,
      owner_name: repName(d.owner_id),
      who,
      company: company && company !== who ? company : null,
      title: d.title?.trim() || who,
      value_cents: d.value_cents ?? 0,
      stage: d.stage,
      source: d.source ?? d.source_channel ?? null,
      in_hands_date: d.in_hands_date,
      blocked: Boolean(d.blocked),
      when: d.created_at,
      last_activity_at: d.last_activity_at ?? d.created_at,
    };
  });

  // ── Build lead items (skip those represented by a deal).
  const leads: PipelineLead[] = [];
  for (const l of leadRows) {
    if (dealLeadRefs.has(l.id)) continue;
    if (l.contact_id && dealContactIds.has(l.contact_id)) continue;
    const col = leadCol(l.status, l.owner_id);
    if (!col) continue;
    const ct = l.contact_id ? contacts.get(l.contact_id) : undefined;
    const orgId = ct?.organization_id ?? l.organization_id ?? null;
    const company = orgId ? orgName.get(orgId) ?? null : null;
    const who = ct?.name?.trim() || company || "Unknown lead";
    const product =
      (l.products && l.products.trim()) ||
      (l.message && l.message.trim().split(/\r?\n/)[0].slice(0, 60)) ||
      null;
    leads.push({
      id: l.id,
      type: "lead",
      col,
      contact_id: l.contact_id,
      owner_id: l.owner_id,
      owner_name: repName(l.owner_id),
      who,
      company: company && company !== who ? company : null,
      source: l.source ?? l.channel ?? null,
      product,
      status: l.status,
      when: l.arrived_at ?? l.created_at,
      last_activity_at: l.last_activity_at ?? l.arrived_at ?? l.created_at,
    });
  }

  return NextResponse.json({ leads, deals });
}
