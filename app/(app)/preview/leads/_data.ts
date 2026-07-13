import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Lead, Stage, Priority } from "./_client";

// ─────────────────────────────────────────────────────────────────────────────
// Leads preview — REAL server-side data layer. Hayk 2026-07-12.
// Reads the SHARED local Postgres `leads` table (+ customer + linked ticket) and
// maps each row into the exact `Lead` shape the existing Leads UI renders.
// READ-ONLY. SELECTs only. Fields we genuinely have are filled; AI/enrichment
// fields the mock invented are left empty/neutral (no fabricated activity).
// ─────────────────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function cleanName(n: string | null | undefined): string | null {
  if (!n) return null;
  if (/^stub_[0-9a-f-]+@local\.invalid$/i.test(n.trim())) return null;
  return n.trim() || null;
}

function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

// Real lead.source → the UI's source union.
function mapSource(s: string | null | undefined): Lead["source"] {
  switch ((s ?? "").toLowerCase()) {
    case "instagram": case "ig": return "Instagram";
    case "website": case "web": case "web_form": return "Website";
    case "referral": return "Referral";
    case "email": return "Email";
    case "phone": case "phone_call": case "call": return "Phone";
    case "walk-in": case "walkin": return "Walk-in";
    default: return "Website";
  }
}

// Real status / sales_status → the UNIFIED pipeline Stage (leads + deals, one board).
const STAGE_SET: Stage[] = ["New Lead", "Qualifying", "Qualified", "Assigned / Claimed", "Contacted", "Working on Quote", "Quote Sent", "Quote Approved", "Pending Payment", "Closed Won", "Follow Up", "Lost"];
function mapStage(status: string | null | undefined, salesStatus: string | null | undefined): Stage {
  const s = (status ?? "").toLowerCase();
  const ss = (salesStatus ?? "").toLowerCase();
  if (ss === "won" || s.includes("converted") || s === "won" || s === "closed won") return "Closed Won";
  if (s.includes("reject") || s.includes("lost") || s.includes("disqualif") || ss.includes("reject") || ss.includes("lost")) return "Lost";
  if (s.includes("follow")) return "Follow Up";
  // Exact match against a real stage label.
  const hit = STAGE_SET.find(st => st.toLowerCase() === s);
  if (hit) return hit;
  // Back-compat with older labels.
  if (status === "New" || s === "pending" || s === "") return "New Lead";
  if (status === "Assigned" || status === "Claimed" || status === "Routed to Sales") return "Assigned / Claimed";
  if (status === "Quoted") return "Quote Sent";
  return "New Lead";
}

function mapPriority(u: string | null | undefined): Priority {
  switch ((u ?? "").toLowerCase()) {
    case "high": return "High";
    case "low": return "Low";
    default: return "Medium";
  }
}

// Standard next step per stage (process rule, not fabricated data).
function nextActionFor(stage: Stage): string {
  switch (stage) {
    case "New Lead": return "Start qualifying this lead";
    case "Qualifying": return "Confirm fit & mark qualified";
    case "Qualified": return "Assign to a sales rep";
    case "Assigned / Claimed": return "Make first contact";
    case "Contacted": return "Build the quote";
    case "Working on Quote": return "Finish & send the quote";
    case "Quote Sent": return "Follow up for approval";
    case "Quote Approved": return "Collect payment";
    case "Pending Payment": return "Confirm payment received";
    case "Closed Won": return "—";
    case "Follow Up": return "Re-engage the customer";
    case "Lost": return "—";
  }
}

// Transparent close-probability by stage (placeholder until real scoring exists).
function closeProbFor(stage: Stage): number {
  switch (stage) {
    case "New Lead": return 5;
    case "Qualifying": return 15;
    case "Qualified": return 30;
    case "Assigned / Claimed": return 40;
    case "Contacted": return 50;
    case "Working on Quote": return 60;
    case "Quote Sent": return 70;
    case "Quote Approved": return 90;
    case "Pending Payment": return 95;
    case "Closed Won": return 100;
    case "Follow Up": return 25;
    case "Lost": return 0;
  }
}

type LeadRow = {
  id: string;
  customer_id: string | null;
  source: string | null;
  status: string | null;
  sales_status: string | null;
  urgency: string | null;
  quote_total: number | null;
  quote_channel: string | null;
  is_returning_customer: boolean | null;
  interests: unknown;
  quantities: unknown;
  sdr_id: string | null;
  sales_owner_id: string | null;
  sdr_comment: string | null;
  sales_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Short date "Jul 11".
function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

// Compact duration since an ISO timestamp: "3d" / "12h" / "40m".
function fmtDur(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "0m";
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

type CustomerRow = { id: string; name: string | null; company: string | null; email: string | null; phone: string | null };

function productsOf(interests: unknown): string[] {
  if (interests && typeof interests === "object") {
    const p = (interests as Record<string, unknown>).products;
    if (Array.isArray(p)) return p.map(String);
  }
  return [];
}

function qtyOf(quantities: unknown): number | undefined {
  if (quantities && typeof quantities === "object") {
    const vals = Object.values(quantities as Record<string, unknown>).map(num).filter(n => n > 0);
    if (vals.length) return vals.reduce((a, b) => a + b, 0);
  }
  return undefined;
}

export async function loadLeads(): Promise<Lead[]> {
  const admin = createAdminClient();

  const { data: leadRows } = await admin
    .from("leads")
    .select("id, customer_id, source, status, sales_status, urgency, quote_total, quote_channel, is_returning_customer, interests, quantities, sdr_id, sales_owner_id, sdr_comment, sales_notes, created_at, updated_at")
    .order("created_at", { ascending: false });

  const rows = (leadRows ?? []) as LeadRow[];
  if (rows.length === 0) return [];

  const customerIds = Array.from(new Set(rows.map(r => r.customer_id).filter(Boolean) as string[]));
  const personIds = Array.from(new Set(rows.flatMap(r => [r.sdr_id, r.sales_owner_id]).filter(Boolean) as string[]));

  const [custRes, profRes] = await Promise.all([
    customerIds.length ? admin.from("customers").select("id, name, company, email, phone").in("id", customerIds) : Promise.resolve({ data: [] as CustomerRow[] }),
    personIds.length ? admin.from("profiles").select("id, full_name").in("id", personIds) : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
  ]);

  const custMap = new Map<string, CustomerRow>();
  for (const c of (custRes.data ?? []) as CustomerRow[]) custMap.set(c.id, c);
  const nameOf = new Map<string, string>();
  for (const p of (profRes.data ?? []) as Array<{ id: string; full_name: string | null }>) {
    const n = cleanName(p.full_name);
    if (n) nameOf.set(p.id, n);
  }

  return rows.map((r): Lead => {
    const c = r.customer_id ? custMap.get(r.customer_id) : undefined;
    const stage = mapStage(r.status, r.sales_status);
    const products = productsOf(r.interests);
    const potential = num(r.quote_total);
    const sdr = (r.sdr_id && nameOf.get(r.sdr_id)) || "—";
    const sales = r.sales_owner_id ? nameOf.get(r.sales_owner_id) : undefined;

    return {
      id: r.id,
      name: c?.name?.trim() || "(unnamed lead)",
      company: c?.company ?? "",
      industry: "",
      source: mapSource(r.source),
      potentialMin: potential || 0,
      potentialMax: potential || 0,
      stage,
      priority: mapPriority(r.urgency),
      tags: products,
      phone: c?.phone ?? "",
      email: c?.email ?? "",
      products,
      estimatedQty: qtyOf(r.quantities),
      returningCustomer: !!r.is_returning_customer,
      createdBy: sdr,
      createdAgo: fmtRelative(r.created_at),
      // "days in pipeline / days in this phase" — real, from created_at + last stage change.
      pipelineAge: fmtDur(r.created_at),
      stageAge: fmtDur(r.updated_at),
      // Real stage dates we actually know: created (New Lead) + last change (current stage).
      stageTimestamps: { "New Lead": fmtShort(r.created_at), [stage]: fmtShort(r.updated_at) } as Partial<Record<Stage, string>>,
      sdrOwner: sdr,
      salesRep: sales ?? undefined,
      lastActivity: "Lead created",
      lastActivityAt: fmtRelative(r.created_at),
      nextAction: nextActionFor(stage),
      nextActionDue: "",
      // Neutral/empty for fields we don't genuinely have yet — no fabricated data.
      leadScore: 0,
      leadScoreBreakdown: [],
      closeProbability: closeProbFor(stage),
      closeProbabilityBand: closeProbFor(stage) >= 70 ? "High" : closeProbFor(stage) <= 20 ? "Low" : "Good",
      estOrderMin: potential || 0,
      estOrderMax: potential || 0,
      estOrderConfidence: potential > 0 ? "High" : "Low",
      activityTimeline: [],
      quotes: potential > 0 ? [{ ref: r.quote_channel ? `Quote · ${r.quote_channel}` : "Quote", amount: potential, sentDaysAgo: 0, status: (stage === "Closed Won" || stage === "Quote Approved") ? "Accepted" : "Sent" }] : [],
      previousOrdersList: [],
      notes: r.sales_notes || r.sdr_comment || "",
    };
  });
}
