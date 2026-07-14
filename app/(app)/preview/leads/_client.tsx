"use client";

// Hayk 2026-07-01 — Leads preview.
// 3 views: List + side panel · Full lead detail · Add Lead modal
// Follows Bazaar_CRM_Lead_Enrichment_AI_Logic.docx —
// SDR-entered / CRM auto-filled / Sales-updated / AI-computed sections are labeled.
// Real /leads page NOT touched.

import { useMemo, useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendSms } from "../orders/_comms";
import { commsForLead } from "../inbox/_seed";
import { RoleGate } from "../_shared/RoleGate";
import { searchCustomers, createLead, claimLead, setLeadStage, type CustomerHit } from "./_actions";

const ACCENT = "#FF5D2E";

// ─── Types ────────────────────────────────────────────
export type Priority = "High" | "Medium" | "Low";
// Unified pipeline: leads + deals on ONE board. SDR zone = New Lead→Qualified,
// sales zone = Assigned→Closed Won. Follow Up / Lost are the two drop-out lanes.
export type Stage =
  | "New Lead" | "Qualifying" | "Qualified"
  | "Assigned / Claimed" | "Contacted" | "Working on Quote" | "Quote Sent" | "Quote Approved" | "Pending Payment" | "Closed Won"
  | "Follow Up" | "Lost";
type TabKey =
  | "all" | "new" | "qualifying" | "qualified"
  | "assigned" | "contacted" | "working" | "quote_sent" | "quote_approved" | "pending_payment" | "closed"
  | "followup" | "lost";

export interface Lead {
  id: string;
  name: string;
  starred?: boolean;
  company: string;
  industry: string;
  source: "Instagram" | "Website" | "Referral" | "Email" | "Phone" | "Walk-in";
  sourceHandle?: string;
  potentialMin: number;
  potentialMax: number;
  stage: Stage;
  priority: Priority;
  tags: string[];
  phone: string;
  email: string;
  instagram?: string;
  website?: string;
  products: string[];
  estimatedQty?: number;
  timeline?: string;
  budgetMin?: number;
  budgetMax?: number;
  hasArtwork?: boolean;
  currentSupplier?: string;
  decisionMaker?: "Yes" | "No" | "Unknown";
  returningCustomer?: boolean;
  ltvSpend?: number;
  previousOrders?: number;
  avgOrderValue?: number;
  lastOrderDate?: string;
  createdBy: string;
  createdAgo: string;
  pipelineAge?: string;   // total time in the pipeline, e.g. "3d"
  stageAge?: string;      // time in the current phase, e.g. "12h"
  sdrOwner: string;
  salesRep?: string;
  lastActivity: string;
  lastActivityAt: string;
  nextAction: string;
  nextActionDue: string;
  nextActionOverdue?: boolean;
  needsAttention?: boolean;
  waitingOnCustomer?: boolean;
  leadScore: number;
  leadScoreBreakdown: { label: string; points: number; on: boolean }[];
  closeProbability: number;
  closeProbabilityBand: "High" | "Good" | "Low";
  estOrderMin: number;
  estOrderMax: number;
  estOrderConfidence: "High" | "Medium" | "Low";
  activityTimeline: { time: string; title: string; sub?: string; icon: string; tint: string }[];
  quotes: { ref: string; amount: number; sentDaysAgo: number; status: "Sent" | "Viewed" | "Accepted" }[];
  previousOrdersList: { ref: string; amount: number; shipped: string }[];
  notes: string;
  suggestedQuestion?: string;
  commHistory?: CommItem[];
  stageTimestamps?: Partial<Record<Stage, string>>;
}

type CommType = "email_in" | "email_out" | "call_in" | "call_out" | "sms_in" | "sms_out" | "ig_in" | "ig_out" | "note";
interface CommItem {
  id: string;
  type: CommType;
  at: string;            // human timestamp e.g. "Jul 1 · 2:14 PM"
  atRel: string;         // "2h ago"
  author: string;        // who sent/created it
  subject?: string;      // for emails
  body: string;          // main content
  attachments?: { name: string; size: string; kind?: string }[];
  callDurationSec?: number;
  callSummary?: string;
  noteAuthor?: string;   // internal note author
  read?: boolean;
}


// ─── Tab logic ────────────────────────────────────────
const TAB_DEFS: { key: TabKey; label: string; predicate: (l: Lead) => boolean; color?: string }[] = [
  { key: "all",             label: "All",             predicate: () => true },
  { key: "new",             label: "New Lead",        predicate: l => l.stage === "New Lead" },
  { key: "qualifying",      label: "Qualifying",      predicate: l => l.stage === "Qualifying" },
  { key: "qualified",       label: "Qualified",       predicate: l => l.stage === "Qualified" },
  { key: "assigned",        label: "Assigned / Claimed",        predicate: l => l.stage === "Assigned / Claimed" },
  { key: "contacted",       label: "Contacted",       predicate: l => l.stage === "Contacted" },
  { key: "working",         label: "Working on Quote", predicate: l => l.stage === "Working on Quote" },
  { key: "quote_sent",      label: "Quote Sent",      predicate: l => l.stage === "Quote Sent" },
  { key: "quote_approved",  label: "Quote Approved",  predicate: l => l.stage === "Quote Approved" },
  { key: "pending_payment", label: "Pending Payment", predicate: l => l.stage === "Pending Payment" },
  { key: "closed",          label: "Closed / Won",    predicate: l => l.stage === "Closed Won" },
  { key: "followup",        label: "Follow Up",       predicate: l => l.stage === "Follow Up" },
  { key: "lost",            label: "Lost",            predicate: l => l.stage === "Lost" },
];

// ─── Format helpers ────────────────────────────────────────
const fmtMoney = (n: number) => `$${n.toLocaleString()}`;
const fmtRange = (a: number, b: number) => `${fmtMoney(a).replace(",000", "K")}–${fmtMoney(b).replace(",000", "K")}`;
const potentialTier = (max: number) => max >= 20000 ? "$$$$" : max >= 10000 ? "$$$" : max >= 5000 ? "$$" : "$";

const STAGE_COLORS: Record<Stage, string> = {
  "New Lead": "#3b82f6",
  "Qualifying": "#eab308",
  "Qualified": "#8b5cf6",
  "Assigned / Claimed": "#6366f1",
  "Contacted": "#0ea5e9",
  "Working on Quote": "#f59e0b",
  "Quote Sent": "#a855f7",
  "Quote Approved": "#14b8a6",
  "Pending Payment": "#f97316",
  "Closed Won": "#16a34a",
  "Follow Up": "#eab308",
  "Lost": "#6b7280",
};

// Linear happy path for the progress rail (drop-out lanes excluded).
const STAGE_FLOW: Stage[] = ["New Lead", "Qualifying", "Qualified", "Assigned / Claimed", "Contacted", "Working on Quote", "Quote Sent", "Quote Approved", "Pending Payment", "Closed Won"];

// "18m ago" / "1h ago" / "2d ago" → days-old number (min → 0, hour → 0, day → n)
function daysOldFromAgo(ago: string): number {
  const m = ago.match(/(\d+)([mhd])/);
  if (!m) return 999;
  const n = parseInt(m[1], 10);
  if (m[2] === "m") return 0;
  if (m[2] === "h") return 0;
  return n;
}

type DateFilter = "all" | "7d" | "30d" | "90d";
const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};
const DATE_FILTER_MAX_DAYS: Record<DateFilter, number> = { all: Infinity, "7d": 7, "30d": 30, "90d": 90 };

// ─── Page ────────────────────────────────────────
// Hayk 2026-07-02 — role gate: leads hidden from accountant / designer / print-manager.
type TeamMember = { code: string; name: string; role: string };
export default function LeadsPreviewGated({ leads, products = [], team = [] }: { leads: Lead[]; products?: string[]; team?: TeamMember[] }) {
  return (
    <RoleGate capability="leads-module">
      <LeadsPreview leads={leads} products={products} team={team} />
    </RoleGate>
  );
}

function LeadsPreview({ leads, products = [], team = [] }: { leads: Lead[]; products?: string[]; team?: TeamMember[] }) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [layout, setLayout] = useState<"table" | "kanban">("kanban");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [userLeads, setUserLeads] = useState<Lead[]>([]);
  const [leadEdits, setLeadEdits] = useState<Record<string, Partial<Lead>>>({});
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sdrFilter, setSdrFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const sourceOptions = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => s.add(l.source));
    return Array.from(s).sort();
  }, []);
  const sdrOptions = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => s.add(l.sdrOwner));
    return Array.from(s).sort();
  }, []);
  const [addDraft, setAddDraft] = useState<{ phone: string; name: string; company: string; email: string; source: string; products: string[]; quantity: string; notes: string; urgency: string; hasArtwork: boolean }>({
    phone: "", name: "", company: "", email: "", source: "", products: [], quantity: "", notes: "", urgency: "", hasArtwork: false,
  });

  const filtered = useMemo(() => {
    // In kanban view, tabs are irrelevant — kanban shows all stages as columns.
    const combined = [...userLeads, ...leads];
    const tabDef = TAB_DEFS.find(t => t.key === tab)!;
    let out = layout === "kanban" ? combined.slice() : combined.filter(tabDef.predicate);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(l => l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q) || l.email.toLowerCase().includes(q));
    }
    if (sourceFilter !== "all") out = out.filter(l => l.source === sourceFilter);
    if (sdrFilter !== "all") out = out.filter(l => l.sdrOwner === sdrFilter);
    const maxDays = DATE_FILTER_MAX_DAYS[dateFilter];
    if (maxDays !== Infinity) out = out.filter(l => daysOldFromAgo(l.lastActivityAt) <= maxDays);
    return out;
  }, [tab, search, sourceFilter, sdrFilter, dateFilter, layout, userLeads]);

  const counts: Record<TabKey, number> = useMemo(() => {
    const c: any = {};
    TAB_DEFS.forEach(t => (c[t.key] = leads.filter(t.predicate).length));
    return c;
  }, []);

  const selectedLeadRaw = selectedId ? [...userLeads, ...leads].find(l => l.id === selectedId) : null;
  const selectedLead = selectedLeadRaw && leadEdits[selectedLeadRaw.id]
    ? { ...selectedLeadRaw, ...leadEdits[selectedLeadRaw.id] } as Lead
    : selectedLeadRaw;
  const saveLeadEdits = (id: string, patch: Partial<Lead>) => {
    setLeadEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
    setSavedToast(`Lead updated`);
    setTimeout(() => setSavedToast(null), 2200);
  };

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", color: "var(--preview-text)", borderRadius: "14px", padding: "20px", margin: "-20px" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)", border: "1px solid var(--preview-border)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>Sales Pipeline · leads + deals on one board · New Lead → Qualified is the SDR zone, the rest is sales</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>Real /leads page untouched</span>
      </div>

      {view === "list" ? (
        <ListView
          leads={filtered}
          allCount={counts.all}
          counts={counts}
          tab={tab} setTab={setTab}
          search={search} setSearch={setSearch}
          selectedId={selectedId}
          onSelect={(id: string) => setSelectedId(id)}
          onOpenAdd={() => setAddOpen(true)}
          onOpenNewQuote={() => setQuoteOpen(true)}
          onViewFull={() => setView("detail")}
          onEdit={(id: string) => setEditingLeadId(id)}
          selectedLead={selectedLead}
          layout={layout}
          setLayout={setLayout}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          sdrFilter={sdrFilter} setSdrFilter={setSdrFilter}
          dateFilter={dateFilter} setDateFilter={setDateFilter}
          sourceOptions={sourceOptions}
          sdrOptions={sdrOptions}
        />
      ) : (
        <DetailView lead={selectedLead!} onBack={() => setView("list")} catalog={products} team={team} />
      )}

      {addOpen && (
        <AddLeadModal
          draft={addDraft}
          setDraft={setAddDraft}
          onClose={() => setAddOpen(false)}
          onSave={(newLead: Lead, assignedToSales: boolean) => {
            setUserLeads(prev => [newLead, ...prev]);
            setSelectedId(newLead.id);
            setAddOpen(false);
            setAddDraft({ phone: "", name: "", company: "", email: "", source: "", products: [], quantity: "", notes: "", urgency: "", hasArtwork: false });
            setTab("all");
            // Persist to the real DB (creates/matches the customer) so the lead survives a refresh.
            createLead({
              name: newLead.name, company: newLead.company, phone: newLead.phone, email: newLead.email,
              source: newLead.source, products: newLead.products, quantity: newLead.estimatedQty ?? null,
              urgency: newLead.priority, notes: newLead.notes,
            }).then(r => {
              setSavedToast(r.ok ? `✓ ${newLead.name || "New lead"} saved` : `Saved on screen — DB error: ${r.error}`);
              setTimeout(() => setSavedToast(null), 4000);
            });
          }}
        />
      )}
      {quoteOpen && <NewQuoteCustomerModal onClose={() => setQuoteOpen(false)} />}
      {editingLeadId && (() => {
        const target = [...userLeads, ...leads].find(l => l.id === editingLeadId);
        if (!target) return null;
        const merged = leadEdits[target.id] ? { ...target, ...leadEdits[target.id] } as Lead : target;
        return (
          <EditLeadModal
            lead={merged}
            onClose={() => setEditingLeadId(null)}
            onSave={patch => { saveLeadEdits(target.id, patch); setEditingLeadId(null); }}
          />
        );
      })()}
      {savedToast && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", padding: "12px 18px", background: "#16a34a", color: "#fff", borderRadius: "10px", fontSize: "13px", fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", zIndex: 1000 }}>{savedToast}</div>
      )}
    </div>
  );
}

// Reusable pill-style select for the filter row.
function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const active = value !== "all";
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        fontSize: "12px",
        color: active ? "#fff" : "var(--preview-text)",
        background: active ? "rgba(255,93,46,0.14)" : "var(--preview-chip-bg-strong)",
        border: `1px solid ${active ? "rgba(255,93,46,0.45)" : "var(--preview-chip-border)"}`,
        padding: "6px 26px 6px 12px",
        borderRadius: "8px",
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        fontWeight: active ? 700 : 500,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path fill='%23ffffff88' d='M2 4l4 4 4-4z'/></svg>")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map(o => <option key={o.value} value={o.value} style={{ background: "var(--preview-surface-2)", color: "var(--preview-text)" }}>{o.label}</option>)}
    </select>
  );
}

// ─── LIST VIEW ────────────────────────────────────────
function ListView({ leads, allCount, counts, tab, setTab, search, setSearch, selectedId, onSelect, onOpenAdd, onOpenNewQuote, onViewFull, onEdit, selectedLead, layout, setLayout, sourceFilter, setSourceFilter, sdrFilter, setSdrFilter, dateFilter, setDateFilter, sourceOptions, sdrOptions }: any) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--preview-text)" }}>Sales Pipeline</h1>
          <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "2px" }}>Every lead and deal, first touch to paid — one board</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ position: "relative", width: "320px" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search leads, people, companies..."
              style={{ width: "100%", padding: "9px 12px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "10px", fontSize: "12.5px", color: "var(--preview-text)", outline: "none" }}
            />
            <span style={{ position: "absolute", right: "10px", top: "9px", fontSize: "10px", color: "var(--preview-text-faint)", background: "var(--preview-chip-bg-strong)", padding: "2px 6px", borderRadius: "4px" }}>⌘K</span>
          </div>
          <div style={{ position: "relative", cursor: "pointer" }}>
            <span style={{ fontSize: "20px" }}>🔔</span>
            <span style={{ position: "absolute", top: "-4px", right: "-6px", background: "#dc2626", color: "#fff", fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "999px" }}>12</span>
          </div>
          <button onClick={onOpenAdd} style={{ background: "var(--preview-surface)", color: "var(--preview-text)", border: "1px solid var(--preview-border)", padding: "9px 16px", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>+ Add Lead</button>
          {/* Ready-to-buy customer → skip the funnel, quote them directly. Creates
              the customer record on the spot; matches an existing one if found. */}
          <button onClick={onOpenNewQuote} title="Quote a walk-in / returning customer directly — no lead needed" style={{ background: ACCENT, color: "#fff", border: "none", padding: "9px 16px", borderRadius: "10px", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>+ New Quote</button>
        </div>
      </div>

      {/* Tabs — hidden in kanban mode because stages ARE the columns */}
      <div style={{ display: layout === "kanban" ? "none" : "flex", gap: "20px", borderBottom: "1px solid var(--preview-border)", marginBottom: "16px", overflowX: "auto" }}>
        {TAB_DEFS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                background: "transparent",
                border: "none",
                padding: "10px 2px",
                marginBottom: "-1px",
                borderBottom: active ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: active ? "#fff" : t.color ? t.color : "var(--preview-text-muted)",
                fontSize: "13px", fontWeight: active ? 700 : 500, cursor: "pointer",
                display: "flex", alignItems: "center", gap: "8px",
                whiteSpace: "nowrap",
              }}>
              {t.label}
              <span style={{
                background: active ? "rgba(255,93,46,0.2)" : "var(--preview-chip-bg-strong)",
                color: active ? ACCENT : "var(--preview-text-muted)",
                fontSize: "10.5px", fontWeight: 700, padding: "1px 8px", borderRadius: "999px",
              }}>{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <FilterSelect value={sourceFilter} onChange={setSourceFilter} options={[{ value: "all", label: "All sources" }, ...sourceOptions.map((s: string) => ({ value: s, label: s }))]} />
          <FilterSelect value={sdrFilter} onChange={setSdrFilter} options={[{ value: "all", label: "All SDRs" }, ...sdrOptions.map((s: string) => ({ value: s, label: s }))]} />
          <FilterSelect value={dateFilter} onChange={(v: string) => setDateFilter(v as DateFilter)} options={(Object.keys(DATE_FILTER_LABEL) as DateFilter[]).map(k => ({ value: k, label: DATE_FILTER_LABEL[k] }))} />
          {(sourceFilter !== "all" || sdrFilter !== "all" || dateFilter !== "all") && (
            <button onClick={() => { setSourceFilter("all"); setSdrFilter("all"); setDateFilter("all"); }} style={{ fontSize: "11px", color: ACCENT, background: "transparent", border: "none", cursor: "pointer", fontWeight: 700 }}>× Clear filters</button>
          )}
          {/* Layout toggle: Table / Kanban */}
          <div style={{ display: "inline-flex", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", overflow: "hidden", marginLeft: "4px" }}>
            <button onClick={() => setLayout("table")} style={{ padding: "6px 12px", fontSize: "12px", background: layout === "table" ? ACCENT : "transparent", color: layout === "table" ? "#fff" : "var(--preview-text)", border: "none", cursor: "pointer", fontWeight: layout === "table" ? 700 : 500 }}>☰ Table</button>
            <button onClick={() => setLayout("kanban")} style={{ padding: "6px 12px", fontSize: "12px", background: layout === "kanban" ? ACCENT : "transparent", color: layout === "kanban" ? "#fff" : "var(--preview-text)", border: "none", cursor: "pointer", fontWeight: layout === "kanban" ? 700 : 500 }}>▦ Kanban</button>
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "var(--preview-text-muted)" }}>{leads.length} lead{leads.length === 1 ? "" : "s"}</div>
      </div>

      {/* Content grid: table/kanban + side panel */}
      <div style={{ display: "grid", gridTemplateColumns: selectedLead ? "minmax(0, 1fr) 460px" : "1fr", gap: "14px" }}>
        {layout === "table" ? (
          <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "var(--preview-text-muted)", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--preview-chip-bg)" }}>
                  <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 700 }}>Lead ▸</th>
                  <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 700 }}>Source</th>
                  <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 700 }}>Last Activity</th>
                  <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 700 }}>Potential</th>
                  <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 700 }}>Status</th>
                  <th style={{ textAlign: "left", padding: "12px 8px", fontWeight: 700 }}>Next Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 8).map((l: Lead) => (
                  <LeadRow key={l.id} lead={l} selected={l.id === selectedId} onClick={() => onSelect(l.id)} />
                ))}
              </tbody>
            </table>
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--preview-border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "var(--preview-text-muted)" }}>
              <span>Showing 1 to {Math.min(8, leads.length)} of {leads.length} leads</span>
              <div style={{ display: "flex", gap: "5px" }}>
                {["‹","1","2","3","4","5","...","9","›"].map((p, i) => (
                  <span key={i} style={{
                    padding: "4px 9px", fontSize: "12px", borderRadius: "5px",
                    background: p === "1" ? ACCENT : "transparent",
                    color: p === "1" ? "#fff" : "var(--preview-text-muted)",
                    border: "1px solid var(--preview-chip-border)", cursor: "pointer", fontWeight: p === "1" ? 700 : 500,
                  }}>{p}</span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <KanbanView leads={leads} selectedId={selectedId} onSelect={onSelect} />
        )}

        {/* Side panel */}
        {selectedLead && <SidePanel lead={selectedLead} onClose={() => onSelect(null)} onViewFull={onViewFull} onEdit={onEdit} />}
      </div>
    </div>
  );
}

// ─── KANBAN VIEW ──────────────────────────────────────
const KANBAN_COLUMNS: { stage: Stage; color: string }[] = [
  { stage: "New Lead",         color: "#3b82f6" },
  { stage: "Qualifying",       color: "#eab308" },
  { stage: "Qualified",        color: "#a78bfa" },
  { stage: "Assigned / Claimed",         color: "#6366f1" },
  { stage: "Contacted",        color: "#0ea5e9" },
  { stage: "Working on Quote", color: "#f59e0b" },
  { stage: "Quote Sent",       color: "#a855f7" },
  { stage: "Quote Approved",   color: "#14b8a6" },
  { stage: "Pending Payment",  color: "#f97316" },
  { stage: "Closed Won",       color: "#16a34a" },
  { stage: "Follow Up",        color: "#eab308" },
  { stage: "Lost",             color: "#6b7280" },
];

function KanbanView({ leads, selectedId, onSelect }: { leads: Lead[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const router = useRouter();
  const [, startMove] = useTransition();
  const [overCol, setOverCol] = useState<string | null>(null);
  // Optimistic override so a dropped card jumps columns instantly.
  const [moved, setMoved] = useState<Record<string, Stage>>({});
  const stageOf = (l: Lead): Stage => moved[l.id] ?? l.stage;

  const byStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    KANBAN_COLUMNS.forEach(c => { map[c.stage] = []; });
    leads.forEach(l => { const s = moved[l.id] ?? l.stage; if (map[s]) map[s].push(l); });
    return map;
  }, [leads, moved]);

  const drop = (leadId: string, stage: Stage) => {
    setOverCol(null);
    setMoved(m => ({ ...m, [leadId]: stage }));
    startMove(async () => { await setLeadStage(leadId, stage); router.refresh(); });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${KANBAN_COLUMNS.length}, minmax(220px, 1fr))`, gap: "10px", overflowX: "auto", paddingBottom: "6px" }}>
      {KANBAN_COLUMNS.map(col => {
        const items = byStage[col.stage] || [];
        const isOver = overCol === col.stage;
        return (
          <div key={col.stage}
            onDragOver={e => { e.preventDefault(); if (!isOver) setOverCol(col.stage); }}
            onDragLeave={() => setOverCol(c => (c === col.stage ? null : c))}
            onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/leadId"); if (id) drop(id, col.stage); }}
            style={{ background: isOver ? `${col.color}14` : "var(--preview-surface)", borderRadius: "12px", border: `1px solid ${isOver ? col.color : "var(--preview-border)"}`, padding: "10px", minHeight: "400px", display: "flex", flexDirection: "column", transition: "background .1s, border-color .1s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", paddingBottom: "8px", borderBottom: `2px solid ${col.color}` }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: col.color }} />
              <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--preview-text)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{col.stage}</div>
              <span style={{ marginLeft: "auto", fontSize: "10.5px", fontWeight: 700, color: "var(--preview-text-muted)", background: "var(--preview-chip-bg-strong)", padding: "1px 7px", borderRadius: "999px" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
              {items.length === 0 && (
                <div style={{ fontSize: "11px", color: "var(--preview-text-faint)", padding: "18px 4px", textAlign: "center", fontStyle: "italic" }}>{isOver ? "Drop here" : "No leads"}</div>
              )}
              {items.map(l => <KanbanCard key={l.id} lead={l} selected={l.id === selectedId} onClick={() => onSelect(l.id)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ lead, selected, onClick }: { lead: Lead; selected: boolean; onClick: () => void }) {
  const priorityColor = lead.priority === "High" ? "#dc2626" : lead.priority === "Medium" ? "#f59e0b" : "#6b7280";
  const router = useRouter();
  const [claiming, startClaim] = useTransition();
  // A sales rep can claim any lead still in the SDR zone (before it's assigned).
  const canClaim = (["New Lead", "Qualifying", "Qualified"] as Stage[]).includes(lead.stage);
  const doClaim = (e: React.MouseEvent) => {
    e.stopPropagation();
    startClaim(async () => { await claimLead(lead.id); router.refresh(); });
  };
  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/leadId", lead.id); e.dataTransfer.effectAllowed = "move"; }}
      style={{
        background: selected ? "rgba(255,93,46,0.12)" : "var(--preview-chip-bg)",
        border: selected ? `1px solid ${ACCENT}` : "1px solid var(--preview-border)",
        borderRadius: "8px", padding: "9px 10px", cursor: "grab",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
        <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "#fff", fontSize: "9px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {lead.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
        </div>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--preview-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{lead.name}</div>
        {lead.starred && <span style={{ color: "#fbbf24", fontSize: "10px" }}>★</span>}
        {lead.pipelineAge && (
          <span title={`In pipeline ${lead.pipelineAge} · in this phase ${lead.stageAge}`} style={{ flexShrink: 0, fontSize: "9.5px", color: "var(--preview-text-muted)", display: "inline-flex", alignItems: "center", gap: "2px", whiteSpace: "nowrap" }}>
            ⏱ {lead.pipelineAge} / {lead.stageAge}
          </span>
        )}
      </div>
      {lead.company && lead.company !== lead.name && <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", marginBottom: "5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.company}</div>}
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "5px" }}>
        <span style={{ fontSize: "9.5px", fontWeight: 700, color: priorityColor, background: `${priorityColor}22`, padding: "1px 6px", borderRadius: "4px", textTransform: "uppercase" }}>{lead.priority}</span>
        {lead.products.slice(0, 1).map(p => (
          <span key={p} style={{ fontSize: "9.5px", color: "var(--preview-text)", background: "var(--preview-chip-bg-strong)", padding: "1px 6px", borderRadius: "4px" }}>{p}</span>
        ))}
      </div>
      <div style={{ fontSize: "10px", color: "var(--preview-text-muted)", display: "flex", justifyContent: "space-between", gap: "6px" }}>
        {/* Only show a $ value once there's a real quote — no fake $0. */}
        {lead.potentialMax > 0 ? <span style={{ fontWeight: 600, color: "#4ade80" }}>{fmtRange(lead.potentialMin, lead.potentialMax)}</span> : <span />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.nextAction || "—"}</span>
      </div>
      {/* A sales rep can claim the lead straight off the card — moves it to Assigned / Claimed. */}
      {canClaim && (
        <button onClick={doClaim} disabled={claiming} style={{ width: "100%", marginTop: "8px", padding: "6px", background: claiming ? "var(--preview-chip-bg-strong)" : ACCENT, color: claiming ? "var(--preview-text-muted)" : "#fff", border: "none", borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: claiming ? "default" : "pointer" }}>
          {claiming ? "Claiming…" : "✋ Claim this lead"}
        </button>
      )}
    </div>
  );
}

// ─── Lead row ────────────────────────────────────────
function LeadRow({ lead, selected, onClick }: { lead: Lead; selected: boolean; onClick: () => void }) {
  const priBg = lead.priority === "High" ? "rgba(220,38,38,0.15)" : lead.priority === "Medium" ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)";
  const priColor = lead.priority === "High" ? "#f87171" : lead.priority === "Medium" ? "#fbbf24" : "#4ade80";
  const stageColor = STAGE_COLORS[lead.stage];
  return (
    <tr onClick={onClick} style={{
      borderTop: "1px solid var(--preview-border)",
      background: selected ? "rgba(255,93,46,0.08)" : "transparent",
      cursor: "pointer",
      borderLeft: selected ? `3px solid ${ACCENT}` : "3px solid transparent",
    }}>
      <td style={{ padding: "14px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "#fff", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {lead.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "var(--preview-text)", fontWeight: 700, fontSize: "13px" }}>{lead.name}</span>
              {lead.starred && <span style={{ color: "#fbbf24", fontSize: "12px" }}>★</span>}
              <span style={{ padding: "1px 7px", background: priBg, color: priColor, fontSize: "9.5px", fontWeight: 700, borderRadius: "4px", letterSpacing: "0.02em" }}>{lead.priority}</span>
            </div>
            {lead.company && lead.company !== lead.name && <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "1px" }}>{lead.company}</div>}
            <div style={{ display: "flex", gap: "4px", marginTop: "5px", flexWrap: "wrap" }}>
              {lead.tags.slice(0, 2).map(t => (
                <span key={t} style={{ padding: "1px 7px", background: "var(--preview-chip-bg-strong)", color: "var(--preview-text)", fontSize: "10px", fontWeight: 600, borderRadius: "4px" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding: "14px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--preview-text)" }}>
          {sourceIcon(lead.source)} {lead.source}
        </div>
        <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", marginTop: "1px" }}>{lead.createdBy}</div>
      </td>
      <td style={{ padding: "14px 8px" }}>
        <div style={{ fontSize: "12.5px", color: "var(--preview-text)" }}>{lead.lastActivity}</div>
        <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", marginTop: "1px" }}>{lead.lastActivityAt}</div>
      </td>
      <td style={{ padding: "14px 8px" }}>
        {lead.potentialMax > 0 ? (
          <>
            <div style={{ fontSize: "12.5px", fontWeight: 700 }}>{fmtRange(lead.potentialMin, lead.potentialMax)}</div>
            <div style={{ fontSize: "10.5px", color: "#4ade80", marginTop: "1px", fontWeight: 700 }}>{potentialTier(lead.potentialMax)}</div>
          </>
        ) : <span style={{ color: "var(--preview-text-faint)", fontSize: "12px" }}>—</span>}
      </td>
      <td style={{ padding: "14px 8px" }}>
        <div style={{ fontSize: "12px", color: stageColor, fontWeight: 700 }}>{lead.stage}</div>
        <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", marginTop: "1px" }}>{lead.lastActivityAt}</div>
      </td>
      <td style={{ padding: "14px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--preview-text)" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: lead.nextActionOverdue ? "#dc2626" : "#4ade80" }} />
          {lead.nextAction}
        </div>
        <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", marginTop: "1px" }}>{lead.nextActionDue}</div>
      </td>
    </tr>
  );
}

function sourceIcon(source: string) {
  if (source === "Instagram") return <span style={{ color: "#ec4899" }}>📷</span>;
  if (source === "Website") return <span style={{ color: "#3b82f6" }}>🌐</span>;
  if (source === "Referral") return <span style={{ color: "#a78bfa" }}>🤝</span>;
  if (source === "Email") return <span style={{ color: "#f59e0b" }}>✉</span>;
  if (source === "Phone") return <span style={{ color: "#22c55e" }}>📞</span>;
  return <span>·</span>;
}

// ─── Side Panel ────────────────────────────────────────
function SidePanel({ lead, onClose, onViewFull, onEdit }: { lead: Lead; onClose: () => void; onViewFull: () => void; onEdit: (id: string) => void }) {
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", padding: "16px", height: "fit-content", position: "sticky", top: "16px" }}>
      {/* Left: Quote / Route to Sales · Right: Edit next to the X */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "8px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {/* Create Quote — from Qualified until the quote's actually sent. */}
          {(["Qualified", "Assigned / Claimed", "Contacted", "Working on Quote"] as Stage[]).includes(lead.stage) && (
            <a
              href={`/preview/new-quote?leadId=${encodeURIComponent(lead.id)}&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(lead.phone || "")}&email=${encodeURIComponent(lead.email || "")}`}
              title="Start a new quote for this lead"
              style={{ padding: "6px 12px", fontSize: "11.5px", background: "#22c55e", border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >📄 Quote</a>
          )}
          {!(["Closed Won", "Lost"] as Stage[]).includes(lead.stage) && (
            <button
              title="Hand this lead off to the Sales team so they can build a quote and close it"
              style={{ padding: "6px 12px", fontSize: "11.5px", background: ACCENT, border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >Route to Sales</button>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button
            onClick={() => onEdit(lead.id)}
            title="Edit this lead's contact info + project details"
            style={{ padding: "6px 12px", fontSize: "11.5px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", color: "var(--preview-text)", cursor: "pointer" }}
          >✎ Edit</button>
          <button onClick={onClose} style={{ padding: "6px 10px", fontSize: "13px", background: "transparent", border: "none", color: "var(--preview-text-muted)", cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* Header — company on top, contact name under (show whichever exist) */}
      {(() => {
        const company = lead.company?.trim();
        const contact = lead.name?.trim();
        const top = company || contact || "—";
        const sub = company && contact && contact !== company ? contact : "";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "#fff", fontSize: "13px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {top.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--preview-text)" }}>{top}</div>
                {lead.starred && <span style={{ color: "#fbbf24" }}>★</span>}
              </div>
              {sub && <div style={{ fontSize: "12px", color: "var(--preview-text-muted)" }}>{sub}</div>}
            </div>
          </div>
        );
      })()}

      {/* Tags row */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
        <TagPill color={lead.priority === "High" ? "#dc2626" : lead.priority === "Medium" ? "#f59e0b" : "#22c55e"} label={lead.priority} />
        <TagPill color={STAGE_COLORS[lead.stage]} label={lead.stage} filled />
      </div>

      {/* Source + received. Industry chip dropped (no real data). */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "12px", fontSize: "11.5px", color: "var(--preview-text-muted)", flexWrap: "wrap" }}>
        <span title="Where this lead came from">{sourceIcon(lead.source)} {lead.source} <span style={{ color: "var(--preview-text-faint)" }}>· source</span></span>
        {lead.industry && <span>🌿 {lead.industry}</span>}
        <span>⏱ Received {lead.pipelineAge ? `${lead.pipelineAge} ago` : lead.createdAgo}</span>
      </div>

      {/* Action buttons — Call / SMS / Email / Open IG (go live with JustCall + email) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "12px" }}>
        <ActionBtn icon="📞" label="Call" />
        <ActionBtn icon="💬" label="SMS" />
        <ActionBtn icon="✉" label="Email" />
        <ActionBtn icon="📷" label="Open IG" />
      </div>

      {/* Project interest, under the reach-out buttons. (Contact info lives in the
          Call / SMS / Email / Open IG buttons — no separate card needed.) */}
      <div style={{ marginBottom: "14px" }}>
        <PanelCard title="Project Interest">
          <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginBottom: "3px" }}>Products</div>
          <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "var(--preview-text)" }}>
            {lead.products.map(p => <li key={p}>{p}</li>)}
          </ul>
          {lead.estimatedQty && <MiniField label="Estimated Qty" value={`${lead.estimatedQty.toLocaleString()} units`} />}
          {lead.timeline && <MiniField label="Timeline" value={lead.timeline} />}
          {lead.budgetMin && <MiniField label="Budget" value={fmtRange(lead.budgetMin, lead.budgetMax!)} />}
          <MiniField label="Artwork" value={lead.hasArtwork ? "Yes, already have" : "Not yet"} />
          {lead.currentSupplier && <MiniField label="Current Supplier" value={lead.currentSupplier} />}
        </PanelCard>
      </div>

      {/* Comms — last 3 touchpoints from the unified Inbox */}
      <LeadCommsPreview leadId={lead.id} phone={lead.phone} email={lead.email} instagram={lead.instagram} />

      {/* Lead Status progress */}
      <StageProgress current={lead.stage} stamps={lead.stageTimestamps} />

      {/* Chronological history — the "what happened" behind the dots */}
      {lead.activityTimeline.length > 0 && (
        <div style={{ marginTop: "10px", padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--preview-text-muted)" }}>History</span>
            <span style={{ fontSize: "9.5px", color: "var(--preview-text-faint)" }}>{lead.activityTimeline.length} events</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "160px", overflowY: "auto" }}>
            {lead.activityTimeline.slice().reverse().map((a, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "11px", lineHeight: 1.4 }}>
                <span style={{ fontSize: "13px", flexShrink: 0 }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--preview-text)", fontWeight: 600 }}>{a.title}</div>
                  {a.sub && <div style={{ color: "var(--preview-text-muted)", fontSize: "10.5px" }}>{a.sub}</div>}
                </div>
                <span style={{ fontSize: "10px", color: "var(--preview-text-faint)", whiteSpace: "nowrap", flexShrink: 0 }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Action */}
      <div style={{ background: "rgba(255,93,46,0.08)", border: `1px solid ${ACCENT}44`, borderRadius: "8px", padding: "10px 12px", marginTop: "10px" }}>
        <div style={{ fontSize: "10.5px", color: ACCENT, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Next Action</div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
          <span>📞</span>
          <span style={{ fontSize: "13px", fontWeight: 700 }}>{lead.nextAction}</span>
        </div>
        <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "2px" }}>{lead.nextActionDue}</div>
      </div>

      {/* Just a small Reject Lead at the bottom. Reach-out actions live in the top
          Call / SMS / Email / Open IG row; Quote / Route to Sales up top. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
        <button style={{ padding: "6px 12px", fontSize: "11.5px", fontWeight: 600, background: "transparent", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: "8px", cursor: "pointer" }}>🚫 Reject lead</button>
      </div>

      {/* AI Summary removed — comes back when AI is actually wired. */}

      {/* Quotes + Previous Orders */}
      {(lead.quotes.length > 0 || lead.previousOrdersList.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
          <PanelCard title={`Quotes · ${lead.quotes.length}`}>
            {lead.quotes.map(q => (
              <a
                key={q.ref}
                href={`/preview/sales-pipeline?quote=${encodeURIComponent(q.ref)}&leadId=${encodeURIComponent(lead.id)}`}
                title={`Open ${q.ref} in Sales Pipeline`}
                style={{ display: "block", padding: "4px 0", fontSize: "11.5px", borderBottom: "1px solid var(--preview-border)", color: "var(--preview-text)", textDecoration: "none", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--preview-chip-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: ACCENT, fontWeight: 600 }}>{q.ref} ↗</span>
                  <span style={{ fontWeight: 700 }}>{fmtMoney(q.amount)}</span>
                </div>
                <div style={{ fontSize: "10px", color: "var(--preview-text-muted)" }}>Sent {q.sentDaysAgo} days ago · {q.status}</div>
              </a>
            ))}
          </PanelCard>
          <PanelCard title={`Previous Orders · ${lead.previousOrdersList.length}`}>
            {lead.previousOrdersList.map(o => (
              <a
                key={o.ref}
                href={`/preview/orders?open=${encodeURIComponent(o.ref.replace(/^ORD-/, ""))}`}
                title={`Open ${o.ref} detail`}
                style={{ display: "block", padding: "4px 0", fontSize: "11.5px", borderBottom: "1px solid var(--preview-border)", color: "var(--preview-text)", textDecoration: "none", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--preview-chip-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: ACCENT, fontWeight: 600 }}>{o.ref} ↗</span>
                  <span style={{ fontWeight: 700 }}>{fmtMoney(o.amount)}</span>
                </div>
                <div style={{ fontSize: "10px", color: "var(--preview-text-muted)" }}>Shipped {o.shipped}</div>
              </a>
            ))}
          </PanelCard>
        </div>
      )}

      {lead.ltvSpend != null && (
        <div style={{ marginTop: "10px", padding: "10px 12px", background: "var(--preview-chip-bg)", borderRadius: "8px", border: "1px solid var(--preview-border)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          <MiniStat label="Total Spent" value={fmtMoney(lead.ltvSpend)} sub={`${lead.previousOrders} Orders`} />
          <MiniStat label="Avg Order Value" value={fmtMoney(lead.avgOrderValue!)} />
          <MiniStat label="Last Order Date" value={lead.lastOrderDate!} />
        </div>
      )}

      {/* View Full Details button */}
      <button onClick={onViewFull} style={{ width: "100%", marginTop: "14px", padding: "10px", background: "#fff", color: "#000", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 800, cursor: "pointer" }}>Open Full Details →</button>
    </div>
  );
}

// ─── Full Detail View ────────────────────────────────────────
function DetailView({ lead, onBack, catalog = [], team = [] }: { lead: Lead; onBack: () => void; catalog?: string[]; team?: TeamMember[] }) {
  // Local, mutable state so every button actually does something.
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");

  const [products, setProducts] = useState(lead.products);
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState<{ name: string; qty: string; hasArtwork: boolean }>({ name: "", qty: "", hasArtwork: false });

  const [files, setFiles] = useState<{ name: string; size: string; kind: string; caption?: string }[]>([]);

  const [commItems, setCommItems] = useState<CommItem[]>(lead.commHistory || []);
  const addComm = (item: CommItem) => setCommItems(prev => [...prev, item]);

  // Modal flags
  const [modal, setModal] = useState<null | "call" | "sms" | "email" | "quote" | "assign" | "followup" | "convert" | "route">(null);

  // Copy helper
  const copyToClipboard = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setNewTag(""); setAddingTag(false);
  };

  const addProductInterest = () => {
    if (newProduct.name.trim()) {
      setProducts([...products, newProduct.name.trim()]);
      // also drop a note into comm history so it's tracked
      addComm({ id: `pi${Date.now()}`, type: "note", at: nowStamp(), atRel: "just now", author: "Hayk Zohrabyan", noteAuthor: "Hayk Zohrabyan", body: `Added product interest: ${newProduct.name} · Qty ${newProduct.qty || "TBD"} · Artwork ${newProduct.hasArtwork ? "yes" : "no"}` });
    }
    setNewProduct({ name: "", qty: "", hasArtwork: false }); setAddingProduct(false);
  };

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--preview-text)", fontSize: "13px", cursor: "pointer", fontWeight: 500 }}>← Back to Leads</button>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ padding: "8px 14px", fontSize: "12.5px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", color: "var(--preview-text)", cursor: "pointer" }}>⋯</button>
          <button style={{ padding: "8px 14px", fontSize: "12.5px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", color: "var(--preview-text)", cursor: "pointer", fontWeight: 600 }}>✎ Edit Lead</button>
          <a
            href={`/preview/new-quote?leadId=${encodeURIComponent(lead.id)}&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(lead.phone || "")}&email=${encodeURIComponent(lead.email || "")}`}
            style={{ padding: "8px 16px", fontSize: "12.5px", background: "#22c55e", border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >📄 Create Quote</a>
          {(["Quote Sent", "Quote Approved", "Pending Payment", "Closed Won"] as Stage[]).includes(lead.stage) ? (
            <button style={{ padding: "8px 16px", fontSize: "12.5px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: "8px", color: "#22c55e", fontWeight: 700, cursor: "pointer" }}>→ Open in Sales Pipeline</button>
          ) : (
            <button onClick={() => setModal("route")} style={{ padding: "8px 16px", fontSize: "12.5px", background: ACCENT, border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>→ Route to Sales</button>
          )}
        </div>
      </div>

      {/* Header block */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
        {/* Left header */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--preview-text)", margin: 0 }}>{lead.name}</h1>
            {lead.starred && <span style={{ color: "#fbbf24", fontSize: "20px" }}>★</span>}
          </div>
          <div style={{ fontSize: "14px", color: "var(--preview-text-muted)", marginBottom: "14px" }}>{lead.company}</div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
            <TagPill color={STAGE_COLORS[lead.stage]} label={lead.stage} filled />
            <TagPill color={lead.priority === "High" ? "#dc2626" : lead.priority === "Medium" ? "#f59e0b" : "#22c55e"} label={lead.priority} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            <ActionBtn icon="📞" label="Call" big onClick={() => setModal("call")} />
            <ActionBtn icon="💬" label="SMS" big onClick={() => setModal("sms")} />
            <ActionBtn icon="✉" label="Email" big onClick={() => setModal("email")} />
            <ActionBtn icon="📷" label="Open Instagram ↗" big onClick={() => window.open("https://instagram.com/" + (lead.instagram || "").replace("@", ""), "_blank")} />
          </div>
          <div style={{ display: "flex", gap: "14px", marginTop: "14px", fontSize: "12px", color: "var(--preview-text-muted)" }}>
            <span>{sourceIcon(lead.source)} {lead.source}</span>
            <span>🌿 {lead.industry}</span>
            <span>⏱ Received {lead.createdAgo}</span>
          </div>
          {/* Contact details — merged in so the block isn't half-empty */}
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--preview-border)" }}>
            <SmallRow icon="📱" value={lead.phone} sub="Mobile" copyable onCopy={() => copyToClipboard(lead.phone)} />
            <SmallRow icon="✉" value={lead.email} sub="Email" copyable onCopy={() => copyToClipboard(lead.email)} />
            {lead.instagram && <SmallRow icon="📷" value={lead.instagram} sub="Instagram" copyable onCopy={() => copyToClipboard(lead.instagram!)} />}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
              <MiniField label="Decision Maker?" value={lead.decisionMaker || "Unknown"} valueColor={lead.decisionMaker === "Yes" ? "#4ade80" : undefined} />
              <MiniField label="Returning Customer?" value={lead.returningCustomer ? "Yes" : "No"} />
            </div>
          </div>
        </div>

        {/* Right — Lead Status stage flow */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Lead Status</div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: ACCENT, marginTop: "4px" }}>{lead.stage}</div>
          <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", marginTop: "2px" }}>Since {lead.createdAgo}</div>
          <StageProgress current={lead.stage} big stamps={lead.stageTimestamps} />
        </div>
      </div>

      {/* Product Interests + Company (2 columns) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "14px", marginBottom: "18px" }}>
        <div>
          <PanelCard title={`Product Interests · ${products.length} item${products.length !== 1 ? "s" : ""}`} big>
            {products.map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", background: "var(--preview-chip-bg)", borderRadius: "8px", marginBottom: "8px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: `${ACCENT}22`, color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>📦</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--preview-text)" }}>{p}</div>
                  <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>Has Design {lead.hasArtwork ? "· Yes" : "· No"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>Quantity</div>
                  <div style={{ fontSize: "14px", fontWeight: 800 }}>{lead.estimatedQty?.toLocaleString() || "—"}</div>
                </div>
              </div>
            ))}
            {addingProduct ? (
              <div style={{ padding: "10px", background: "var(--preview-chip-bg)", border: `1px solid ${ACCENT}55`, borderRadius: "8px" }}>
                <select autoFocus value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} style={darkInp}>
                  <option value="">Select a product…</option>
                  {catalog.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input placeholder="Estimated quantity (e.g. 5000)" value={newProduct.qty} onChange={e => setNewProduct({ ...newProduct, qty: e.target.value })} style={{ ...darkInp, marginTop: "6px" }} />
                <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "12px", color: "var(--preview-text)", cursor: "pointer" }}>
                  <input type="checkbox" checked={newProduct.hasArtwork} onChange={e => setNewProduct({ ...newProduct, hasArtwork: e.target.checked })} />
                  Has artwork ready
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "8px" }}>
                  <button onClick={() => { setAddingProduct(false); setNewProduct({ name: "", qty: "", hasArtwork: false }); }} style={{ padding: "6px 12px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "6px", color: "var(--preview-text)", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                  <button onClick={addProductInterest} disabled={!newProduct.name.trim()} style={{ padding: "6px 12px", background: newProduct.name.trim() ? ACCENT : "var(--preview-text-faint)", border: "none", borderRadius: "6px", color: "var(--preview-text)", fontSize: "12px", fontWeight: 700, cursor: newProduct.name.trim() ? "pointer" : "not-allowed" }}>Save</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingProduct(true)} style={{ width: "100%", padding: "8px", background: "var(--preview-chip-bg)", border: "1px dashed var(--preview-border-strong)", borderRadius: "8px", color: "var(--preview-text-muted)", fontSize: "12px", cursor: "pointer" }}>+ Add Product Interest</button>
            )}
          </PanelCard>
        </div>

        {/* Company */}
        <PanelCard title="Company Information" big>
          <MiniField label="Company" value={lead.company} />
          <MiniField label="Industry" value={`🌿 ${lead.industry}`} />
          {lead.website && <MiniField label="Website / Social" value={lead.website} valueColor={ACCENT} />}
        </PanelCard>
      </div>

      {/* Team Notes + Files & Attachments (2 columns) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "18px" }}>
        <TeamNotesCard commItems={commItems} addComm={addComm} />
        <FilesCard files={files} setFiles={setFiles} />
      </div>

      {/* Quick Actions bar */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "14px 18px", marginBottom: "18px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--preview-text-muted)", marginBottom: "10px" }}>💫 Quick Actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }}>
          <ActionBtn icon="📞" label="Call" big onClick={() => setModal("call")} />
          <ActionBtn icon="💬" label="Text" big onClick={() => setModal("sms")} />
          <ActionBtn icon="✉" label="Email" big onClick={() => setModal("email")} />
          <ActionBtn icon="📄" label="Send Quote" big onClick={() => {
            window.location.href = `/preview/new-quote?leadId=${encodeURIComponent(lead.id)}&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(lead.phone || "")}&email=${encodeURIComponent(lead.email || "")}`;
          }} />
          <ActionBtn icon="🎯" label="Assign" big onClick={() => setModal("assign")} />
          <ActionBtn icon="📅" label="Schedule Follow Up" big onClick={() => setModal("followup")} />
          <ActionBtn icon="✓" label="Convert to Order" big highlight onClick={() => setModal("convert")} />
        </div>
      </div>

      {/* Communication History */}
      <CommunicationHistory commItems={commItems} addComm={addComm} onAttach={file => setFiles([...files, file])} />

      {/* Modals */}
      {modal && <QuickActionModal type={modal} lead={lead} team={team} onClose={() => setModal(null)} onLog={item => { addComm(item); setModal(null); }} onAttach={file => setFiles([...files, file])} />}
    </div>
  );
}

// ─── Team Notes ────────────────────────────────
function TeamNotesCard({ commItems, addComm }: { commItems: CommItem[]; addComm: (c: CommItem) => void }) {
  const [text, setText] = useState("");
  const notes = commItems.filter(c => c.type === "note").slice().reverse();
  const saveNote = () => {
    if (!text.trim()) return;
    addComm({ id: `n${Date.now()}`, type: "note", at: nowStamp(), atRel: "just now", author: "Hayk Zohrabyan", noteAuthor: "Hayk Zohrabyan", body: text.trim() });
    setText("");
  };
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)" }}>📝 Team Notes</div>
        <span style={{ fontSize: "10.5px", color: "var(--preview-text-faint)" }}>{notes.length} internal note{notes.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Composer — always visible */}
      <div style={{ marginBottom: "12px" }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="Write a note (visible to team only)... ⌘Enter to save"
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote(); }}
          style={{ width: "100%", minHeight: "70px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "var(--preview-text)", padding: "10px", fontSize: "12.5px", outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
          <button onClick={saveNote} disabled={!text.trim()} style={{ padding: "6px 14px", background: text.trim() ? ACCENT : "var(--preview-chip-border)", border: "none", borderRadius: "6px", color: "var(--preview-text)", fontSize: "12px", fontWeight: 700, cursor: text.trim() ? "pointer" : "not-allowed" }}>Save Note</button>
        </div>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div style={{ fontSize: "12px", color: "var(--preview-text-faint)", textAlign: "center", padding: "16px 0" }}>No team notes yet.</div>
      ) : (
        <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {notes.map(n => (
            <div key={n.id} style={{ padding: "10px 12px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#a78bfa" }}>{n.noteAuthor || n.author}</span>
                <span style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{n.atRel}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--preview-text)", lineHeight: 1.5 }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Files & Attachments ────────────────────────────────
function FilesCard({ files, setFiles }: { files: { name: string; size: string; kind: string; caption?: string }[]; setFiles: (f: any[]) => void }) {
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const added = Array.from(list).map(f => ({
      name: f.name,
      size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`,
      kind: f.type.startsWith("image") ? "image" : f.name.endsWith(".pdf") ? "pdf" : "file",
    }));
    setFiles([...files, ...added]);
    e.target.value = "";
  };
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)" }}>📎 Files & Attachments</div>
        <label style={{ padding: "5px 10px", background: ACCENT, borderRadius: "6px", color: "#fff", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          + Upload
          <input type="file" multiple onChange={onUpload} style={{ display: "none" }} />
        </label>
      </div>
      {files.length === 0 ? (
        <div style={{ padding: "24px", border: "1px dashed var(--preview-border-strong)", borderRadius: "10px", textAlign: "center", fontSize: "12px", color: "var(--preview-text-muted)" }}>
          Drop files here or click Upload · screenshots, artwork, references
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {files.map((f, i) => (
            <div key={i} style={{ background: "var(--preview-chip-bg)", border: "1px solid var(--preview-border)", borderRadius: "8px", overflow: "hidden", cursor: "pointer" }}>
              <div style={{ aspectRatio: "16/10", background: f.kind === "image" ? "linear-gradient(135deg,#3b82f6,#8b5cf6)" : f.kind === "pdf" ? "linear-gradient(135deg,#dc2626,#f97316)" : "linear-gradient(135deg,#525252,#171717)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "22px", fontWeight: 800 }}>
                {f.kind === "image" ? "🖼" : f.kind === "pdf" ? "PDF" : "📎"}
              </div>
              <div style={{ padding: "6px 8px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                <div style={{ fontSize: "9.5px", color: "var(--preview-text-muted)" }}>{f.size}</div>
                {f.caption && <div style={{ fontSize: "10px", color: "var(--preview-text-muted)", marginTop: "2px", fontStyle: "italic" }}>{f.caption}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function nowStamp() {
  return "Just now";
}

// ─── Communication History ────────────────────────────────
function CommunicationHistory({ commItems, addComm, onAttach }: { commItems: CommItem[]; addComm: (c: CommItem) => void; onAttach: (f: any) => void }) {
  const [filter, setFilter] = useState<"all" | "email" | "call" | "sms" | "note">("all");
  const [composerOpen, setComposerOpen] = useState<null | "email" | "call" | "sms" | "note">(null);
  const [noteText, setNoteText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ name: string; size: string; kind: string }[]>([]);

  const items = commItems;
  const filtered = items.filter(item => {
    if (filter === "all") return true;
    if (filter === "email") return item.type === "email_in" || item.type === "email_out";
    if (filter === "call") return item.type === "call_in" || item.type === "call_out";
    if (filter === "sms") return item.type === "sms_in" || item.type === "sms_out" || item.type === "ig_in" || item.type === "ig_out";
    if (filter === "note") return item.type === "note";
    return true;
  });

  const counts = {
    all: items.length,
    email: items.filter(i => i.type === "email_in" || i.type === "email_out").length,
    call: items.filter(i => i.type === "call_in" || i.type === "call_out").length,
    sms: items.filter(i => ["sms_in", "sms_out", "ig_in", "ig_out"].includes(i.type)).length,
    note: items.filter(i => i.type === "note").length,
  };

  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "18px 20px" }}>
      {/* Header + filters + compose */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--preview-text)", letterSpacing: "0.04em" }}>💬 COMMUNICATION HISTORY</div>
          <span style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>Every email · call · text · note in one place</span>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <CompactBtn icon="📝" label="Add Note" onClick={() => setComposerOpen("note")} accent />
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All", color: "#a3a3a3" },
          { key: "email", label: "Emails", color: "#f59e0b" },
          { key: "call", label: "Calls", color: "#22c55e" },
          { key: "sms", label: "Texts & DMs", color: "#3b82f6" },
          { key: "note", label: "Notes", color: "#a78bfa" },
        ].map(f => {
          const active = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key as any)} style={{
              padding: "6px 12px", background: active ? `${f.color}22` : "var(--preview-chip-bg)",
              border: `1px solid ${active ? f.color : "var(--preview-chip-bg-strong)"}`, borderRadius: "8px",
              color: active ? f.color : "var(--preview-text)", fontSize: "12px", fontWeight: active ? 700 : 500,
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: f.color }} />
              {f.label} <span style={{ opacity: 0.7 }}>({(counts as any)[f.key]})</span>
            </button>
          );
        })}
      </div>

      {/* Composer (inline, opens above the feed) */}
      {composerOpen && (
        <div style={{ background: "var(--preview-chip-bg)", border: "1px solid var(--preview-chip-border)", borderRadius: "10px", padding: "12px", marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--preview-text)" }}>
              {composerOpen === "email" && "✉ Log an email"}
              {composerOpen === "call" && "📞 Log a call"}
              {composerOpen === "sms" && "💬 Log a text"}
              {composerOpen === "note" && "📝 Add an internal note"}
            </div>
            <button onClick={() => { setComposerOpen(null); setNoteText(""); setPendingFiles([]); }} style={{ background: "transparent", border: "none", color: "var(--preview-text-muted)", cursor: "pointer", fontSize: "14px" }}>✕</button>
          </div>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder={composerOpen === "note" ? "Note visible only to your team..." : composerOpen === "call" ? "Call summary: what was discussed, next steps..." : composerOpen === "email" ? "Type or paste the email body..." : "Text message content..."}
            style={{ width: "100%", minHeight: "80px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "var(--preview-text)", padding: "10px", fontSize: "12.5px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
          {pendingFiles.length > 0 && (
            <div style={{ marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {pendingFiles.map((f, i) => (
                <span key={i} style={{ padding: "4px 10px", background: "var(--preview-chip-bg-strong)", borderRadius: "6px", fontSize: "11px", color: "var(--preview-text)", display: "flex", alignItems: "center", gap: "6px" }}>
                  📎 {f.name} <span style={{ color: "var(--preview-text-muted)" }}>{f.size}</span>
                  <span onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "var(--preview-text-faint)" }}>✕</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginTop: "8px" }}>
            <label style={{ padding: "6px 10px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "6px", color: "var(--preview-text)", fontSize: "11.5px", fontWeight: 600, cursor: "pointer" }}>
              📎 Attach file
              <input type="file" multiple style={{ display: "none" }} onChange={e => {
                if (!e.target.files) return;
                const added = Array.from(e.target.files).map(f => ({
                  name: f.name,
                  size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`,
                  kind: f.type.startsWith("image") ? "image" : f.name.endsWith(".pdf") ? "pdf" : "file",
                }));
                setPendingFiles([...pendingFiles, ...added]);
                e.target.value = "";
              }} />
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setComposerOpen(null); setNoteText(""); setPendingFiles([]); }} style={{ padding: "7px 14px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", color: "var(--preview-text)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={() => {
                  if (!noteText.trim() && pendingFiles.length === 0) return;
                  const type: CommType = composerOpen === "note" ? "note" : composerOpen === "call" ? "call_out" : composerOpen === "email" ? "email_out" : "sms_out";
                  const newItem: CommItem = {
                    id: `c${Date.now()}`, type, at: nowStamp(), atRel: "just now",
                    author: "Hayk Zohrabyan",
                    body: noteText.trim() || (composerOpen === "email" ? "(no body)" : ""),
                    ...(composerOpen === "note" ? { noteAuthor: "Hayk Zohrabyan" } : {}),
                    ...(composerOpen === "call" ? { callSummary: noteText.trim() } : {}),
                    ...(pendingFiles.length ? { attachments: pendingFiles } : {}),
                  };
                  addComm(newItem);
                  // also attach files to the lead
                  pendingFiles.forEach(f => onAttach(f));
                  setComposerOpen(null); setNoteText(""); setPendingFiles([]);
                }}
                style={{ padding: "7px 14px", background: ACCENT, border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
              >{composerOpen === "note" ? "Save Note" : "Save & Log"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline feed — vertical line + items */}
      {filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--preview-text-faint)", fontSize: "13px" }}>No communication yet in this category.</div>
      ) : (
        <div style={{ position: "relative", paddingLeft: "22px" }}>
          <div style={{ position: "absolute", left: "12px", top: "10px", bottom: "10px", width: "2px", background: "var(--preview-chip-bg-strong)" }} />
          {filtered.map((item, i) => <CommCard key={item.id} item={item} last={i === filtered.length - 1} />)}
        </div>
      )}
    </div>
  );
}

function CommCard({ item, last }: { item: CommItem; last: boolean }) {
  const meta = commTypeMeta(item.type);
  return (
    <div style={{ position: "relative", paddingBottom: last ? 0 : "12px" }}>
      {/* dot on the timeline */}
      <div style={{ position: "absolute", left: "-22px", top: "10px", width: "20px", height: "20px", borderRadius: "50%", background: meta.color + "22", border: `2px solid #151516`, display: "flex", alignItems: "center", justifyContent: "center", color: meta.color, fontSize: "10px", boxShadow: `0 0 0 2px ${meta.color}44` }}>
        {meta.icon}
      </div>
      <div style={{ background: "var(--preview-chip-bg)", border: `1px solid ${item.type === "note" ? "rgba(167,139,250,0.3)" : "var(--preview-border)"}`, borderRadius: "10px", padding: "12px 14px", marginLeft: "8px" }}>
        {/* header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ padding: "2px 8px", background: meta.color + "22", color: meta.color, fontSize: "10px", fontWeight: 700, borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{meta.label}</span>
            <span style={{ fontSize: "12px", color: "var(--preview-text)", fontWeight: 700 }}>{item.author}</span>
            {item.type === "email_in" && !item.read && <span style={{ padding: "1px 6px", background: "#dc2626", color: "#fff", fontSize: "9px", fontWeight: 700, borderRadius: "3px" }}>UNREAD</span>}
            {item.type === "note" && <span style={{ padding: "1px 6px", background: "rgba(167,139,250,0.2)", color: "#a78bfa", fontSize: "9px", fontWeight: 700, borderRadius: "3px" }}>INTERNAL</span>}
          </div>
          <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", whiteSpace: "nowrap" }}>{item.at} · {item.atRel}</div>
        </div>

        {/* subject (emails) */}
        {item.subject && <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--preview-text)", marginBottom: "4px" }}>{item.subject}</div>}

        {/* body */}
        <div style={{ fontSize: "12.5px", color: "var(--preview-text)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{item.body}</div>

        {/* call duration + summary */}
        {item.callDurationSec != null && (
          <div style={{ marginTop: "8px", padding: "8px 10px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", fontSize: "11px", color: "#4ade80", fontWeight: 700 }}>
              <span>⏱ Duration</span>
              <span style={{ color: "var(--preview-text)" }}>{Math.floor(item.callDurationSec / 60)}m {item.callDurationSec % 60}s</span>
            </div>
            {item.callSummary && <div style={{ fontSize: "12px", color: "var(--preview-text)", lineHeight: 1.5 }}>{item.callSummary}</div>}
          </div>
        )}

        {/* attachments */}
        {item.attachments && item.attachments.length > 0 && (
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {item.attachments.map(a => (
              <div key={a.name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", background: "var(--preview-chip-bg)", border: "1px solid var(--preview-border)", borderRadius: "6px", cursor: "pointer" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: a.kind === "pdf" ? "rgba(220,38,38,0.15)" : "rgba(59,130,246,0.15)", color: a.kind === "pdf" ? "#f87171" : "#60a5fa", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>{a.kind === "pdf" ? "PDF" : a.kind === "image" ? "IMG" : "📎"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", color: "var(--preview-text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                  <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{a.size}</div>
                </div>
                <span style={{ fontSize: "12px", color: ACCENT, fontWeight: 700 }}>↓</span>
              </div>
            ))}
          </div>
        )}

        {/* footer actions */}
        <div style={{ marginTop: "8px", display: "flex", gap: "10px", fontSize: "11px" }}>
          {(item.type === "email_in" || item.type === "sms_in" || item.type === "ig_in") && (
            <button style={{ background: "transparent", border: "none", color: ACCENT, cursor: "pointer", fontWeight: 700, padding: 0 }}>↩ Reply</button>
          )}
          {item.type === "email_in" && <button style={{ background: "transparent", border: "none", color: "var(--preview-text-muted)", cursor: "pointer", padding: 0 }}>↪ Forward</button>}
          {item.type === "note" && <button style={{ background: "transparent", border: "none", color: "var(--preview-text-muted)", cursor: "pointer", padding: 0 }}>✎ Edit</button>}
          <button style={{ background: "transparent", border: "none", color: "var(--preview-text-faint)", cursor: "pointer", padding: 0, marginLeft: "auto" }}>⋯</button>
        </div>
      </div>
    </div>
  );
}

function commTypeMeta(type: CommType): { label: string; icon: string; color: string } {
  switch (type) {
    case "email_in": return { label: "Email received", icon: "✉", color: "#f59e0b" };
    case "email_out": return { label: "Email sent", icon: "✉", color: "#f59e0b" };
    case "call_in": return { label: "Call received", icon: "📞", color: "#22c55e" };
    case "call_out": return { label: "Call made", icon: "📞", color: "#22c55e" };
    case "sms_in": return { label: "Text received", icon: "💬", color: "#3b82f6" };
    case "sms_out": return { label: "Text sent", icon: "💬", color: "#3b82f6" };
    case "ig_in": return { label: "Instagram DM in", icon: "📷", color: "#ec4899" };
    case "ig_out": return { label: "Instagram DM out", icon: "📷", color: "#ec4899" };
    case "note": return { label: "Internal note", icon: "📝", color: "#a78bfa" };
  }
}

function CompactBtn({ icon, label, onClick, accent }: any) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "7px 12px",
      background: accent ? "rgba(255,93,46,0.15)" : "var(--preview-chip-bg-strong)",
      border: `1px solid ${accent ? ACCENT + "55" : "var(--preview-chip-border)"}`,
      color: accent ? ACCENT : "#fff",
      borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    }}>{icon} {label}</button>
  );
}

// ─── Add Lead Modal ────────────────────────────────────────
// ─── New Quote — pick WHO the quote is for, then continue to the quote ───
function NewQuoteCustomerModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"search" | "new">("search");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newNote, setNewNote] = useState("");
  const seq = useRef(0);

  // Debounced live search of the real customer database.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchCustomers(term);
      if (mine === seq.current) { setHits(res); setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (params: Record<string, string>) => {
    const usp = new URLSearchParams(params);
    window.location.href = `/preview/new-quote?${usp.toString()}`;
  };
  const pick = (c: CustomerHit) => go({ customerId: c.id, name: c.name, phone: c.phone || "", email: c.email || "", company: c.company || "" });
  const createAndGo = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    go({ name: newName.trim(), phone: newPhone.trim(), email: newEmail.trim(), company: newCompany.trim(), source: newSource, note: newNote.trim(), newCustomer: "1" });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "8vh", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "16px", padding: "22px 24px", width: "520px", maxWidth: "92vw", boxShadow: "0 24px 70px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--preview-text)" }}>New Quote</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: "20px", color: "#888", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: "12.5px", color: "var(--preview-text-muted)", marginBottom: "16px" }}>Who is this quote for? Search an existing customer, or add a new one.</div>

        {mode === "search" ? (
          <>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search by name, company, phone, or email…"
              style={{ width: "100%", padding: "11px 14px", border: "1px solid var(--preview-border)", borderRadius: "10px", fontSize: "13.5px", boxSizing: "border-box", background: "var(--preview-surface-2)", color: "var(--preview-text)", outline: "none", marginBottom: "10px" }} />

            <div style={{ minHeight: "120px" }}>
              {q.trim().length < 2 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--preview-text-faint)", fontSize: "12.5px" }}>Start typing a name to find the customer…</div>
              ) : loading ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "12.5px" }}>Searching…</div>
              ) : hits.length === 0 ? (
                <div style={{ padding: "18px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "12.5px" }}>
                  No customer matches “{q}”.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "320px", overflowY: "auto" }}>
                  {hits.map(c => (
                    <button key={c.id} onClick={() => pick(c)} style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left", padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "10px", cursor: "pointer" }}>
                      <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "#fff", fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: "13.5px", fontWeight: 700, color: "var(--preview-text)" }}>{c.name}{c.company && c.company !== c.name ? <span style={{ color: "var(--preview-text-muted)", fontWeight: 500 }}> · {c.company}</span> : null}</span>
                        <span style={{ display: "block", fontSize: "11px", color: "var(--preview-text-muted)" }}>{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                      {c.orders > 0 && <span style={{ flexShrink: 0, fontSize: "10.5px", fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "2px 8px", borderRadius: "999px" }}>{c.orders} order{c.orders === 1 ? "" : "s"} · ${c.lifetime.toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--preview-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "var(--preview-text-muted)" }}>Not in the system?</span>
              <button onClick={() => { setMode("new"); setNewName(q); }} style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "9px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", color: "var(--preview-text)" }}>+ New customer</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "52vh", overflowY: "auto" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase" }}>Full name *
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Customer's full name" style={qFieldStyle} />
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase" }}>Phone *
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(555) 000-0000" style={qFieldStyle} />
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase" }}>Company
                <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company name (optional)" style={qFieldStyle} />
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase" }}>Email
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="you@example.com" style={qFieldStyle} />
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase" }}>Source
                <select value={newSource} onChange={e => setNewSource(e.target.value)} style={{ ...qFieldStyle, cursor: "pointer" }}>
                  <option value="">Select source</option>
                  <option>Instagram</option><option>Website</option><option>Referral</option><option>Email</option><option>Phone</option><option>Walk-in</option>
                </select>
              </label>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase" }}>Note about the customer
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="e.g. referral from Jane · friend of the owner · handle with care…" style={{ ...qFieldStyle, minHeight: "56px", resize: "vertical", fontFamily: "inherit" }} />
              </label>
            </div>
            <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
              <button onClick={createAndGo} disabled={!newName.trim() || !newPhone.trim()} style={{ flex: 1, padding: "11px", background: (newName.trim() && newPhone.trim()) ? ACCENT : "#ccc", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13.5px", fontWeight: 700, cursor: (newName.trim() && newPhone.trim()) ? "pointer" : "default" }}>Continue to quote →</button>
              <button onClick={() => setMode("search")} style={{ padding: "11px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "10px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", color: "var(--preview-text)" }}>← Back to search</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const qFieldStyle: React.CSSProperties = { display: "block", width: "100%", marginTop: "4px", padding: "10px 12px", border: "1px solid var(--preview-border)", borderRadius: "9px", fontSize: "13px", boxSizing: "border-box", background: "var(--preview-surface-2)", color: "var(--preview-text)", outline: "none", fontWeight: 500, textTransform: "none" };

function AddLeadModal({ draft, setDraft, onClose, onSave }: { draft: any; setDraft: any; onClose: () => void; onSave: (lead: Lead, assignedToSales: boolean) => void }) {
  function buildLeadFromDraft(assignedToSales: boolean): Lead {
    const now = new Date();
    const nowIso = now.toISOString();
    // Human timestamp for the stage strip — matches existing seed format "Jul 1 · 10:35a".
    const month = now.toLocaleString("en-US", { month: "short" });
    const day = now.getDate();
    let hr = now.getHours();
    const min = now.getMinutes().toString().padStart(2, "0");
    const ampm = hr >= 12 ? "p" : "a";
    hr = hr % 12 || 12;
    const nowStamp = `${month} ${day} · ${hr}:${min}${ampm}`;
    const stageTimestamps: Partial<Record<Stage, string>> = { "New Lead": nowStamp };
    if (assignedToSales) stageTimestamps["Qualified"] = nowStamp;
    const idSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return {
      stageTimestamps,
      id: `L-NEW-${idSuffix}`,
      name: (draft.name || "").trim() || "Untitled lead",
      company: (draft.company || "").trim() || "—",
      industry: "—",
      source: (draft.source as Lead["source"]) || "Instagram",
      potentialMin: 1000, potentialMax: 5000,
      stage: assignedToSales ? "Qualified" : "New Lead",
      priority: (["High", "Medium", "Low"].includes(draft.urgency) ? draft.urgency : "Medium") as Priority,
      tags: [],
      phone: draft.phone || "",
      email: draft.email || "",
      products: draft.products || [],
      estimatedQty: Number(draft.quantity) || undefined,
      hasArtwork: !!draft.hasArtwork,
      createdBy: "Hayk Zohrabyan",
      createdAgo: "just now",
      sdrOwner: "Hayk Zohrabyan",
      salesRep: assignedToSales ? "Maria Hakobyan" : undefined,
      lastActivity: assignedToSales ? "Assigned to Sales" : "Lead captured",
      lastActivityAt: "just now",
      nextAction: assignedToSales ? "Call customer" : "Qualify",
      nextActionDue: "today",
      leadScore: 60,
      leadScoreBreakdown: [],
      closeProbability: 0.4,
      closeProbabilityBand: "Good",
      estOrderMin: 1000, estOrderMax: 5000, estOrderConfidence: "Medium",
      activityTimeline: [{ time: nowIso, title: assignedToSales ? "Assigned to Sales" : "Lead captured", icon: "•", tint: assignedToSales ? "#22c55e" : "#3b82f6" }],
      quotes: [], previousOrdersList: [],
      notes: draft.notes || "",
    };
  }
  const set = (k: string, v: any) => setDraft({ ...draft, [k]: v });
  const toggleProduct = (p: string) => {
    setDraft({ ...draft, products: draft.products.includes(p) ? draft.products.filter((x: string) => x !== p) : [...draft.products, p] });
  };
  // AI summary derives from real form input — never invented
  const summary = {
    products: draft.products.length ? draft.products.join(", ") : "—",
    quantity: draft.quantity || "—",
    urgency: draft.urgency || "—",
    designNeeded: draft.hasArtwork ? "No" : "—",
    estValue: draft.quantity && draft.products.length ? `~$${(Number(draft.quantity) * 3).toLocaleString()}` : "—",
  };
  const existingCheck = {
    status: draft.phone.length >= 10 ? "Checking..." : "—",
    prevOrders: "—", lifetime: "—", lastOrder: "—",
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", color: "#171717", borderRadius: "16px", width: "min(920px, 95vw)", maxHeight: "92vh", overflowY: "auto", padding: "24px 28px", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>Add New Lead</h2>
            <div style={{ fontSize: "12.5px", color: "#666", marginTop: "2px" }}>Capture a new lead in seconds. Only the essentials.</div>
          </div>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer", fontSize: "13px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "20px" }}>
          {/* Left form */}
          <div>
            <Field label="Phone *" icon="📱">
              <input value={draft.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" style={inp} />
            </Field>
            <Field label="Name *" icon="👤">
              <input value={draft.name} onChange={e => set("name", e.target.value)} placeholder="Full name" style={inp} />
            </Field>
            <Field label="Company" icon="🏢">
              <input value={draft.company} onChange={e => set("company", e.target.value)} placeholder="Company name (optional)" style={inp} />
            </Field>
            <Field label="Email (optional)" icon="✉">
              <input value={draft.email} onChange={e => set("email", e.target.value)} placeholder="you@example.com" style={inp} />
            </Field>
            <Field label="Source *" icon="📍">
              <select value={draft.source} onChange={e => set("source", e.target.value)} style={inp}>
                <option value="">Select source</option>
                <option>Instagram</option><option>Website</option><option>Referral</option><option>Email</option><option>Phone</option><option>Walk-in</option>
              </select>
            </Field>
            <Field label="Products Needed *" icon="📦">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "3px" }}>
                {["Labels", "Boxes", "Mylar Bags", "Apparel", "Banners", "Signs", "Other"].map(p => {
                  const on = draft.products.includes(p);
                  return (
                    <label key={p} onClick={() => toggleProduct(p)} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", border: `1px solid ${on ? ACCENT : "#e5e5e5"}`, background: on ? "#fff7ed" : "#fff", color: on ? ACCENT : "#333", borderRadius: "8px", fontSize: "12.5px", fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                      <span style={{ width: "14px", height: "14px", border: `1.5px solid ${on ? ACCENT : "#ccc"}`, borderRadius: "3px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? ACCENT : "#fff" }}>
                        {on && <span style={{ color: "#fff", fontSize: "10px" }}>✓</span>}
                      </span>
                      {p}
                    </label>
                  );
                })}
              </div>
            </Field>
            <Field label="Estimated Quantity" icon="#">
              <input value={draft.quantity} onChange={e => set("quantity", e.target.value)} placeholder="e.g. 5,000 units" style={inp} />
            </Field>
            <Field label="Urgency" icon="⏱">
              <select value={draft.urgency} onChange={e => set("urgency", e.target.value)} style={inp}>
                <option value="">Select urgency</option>
                <option value="High">High — rush, this week</option>
                <option value="Medium">Medium — standard, this month</option>
                <option value="Low">Low — flexible, planning ahead</option>
              </select>
            </Field>
            <Field label="Has Artwork?" icon="🖼">
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => set("hasArtwork", true)} style={{ ...toggleBtn, ...(draft.hasArtwork ? toggleOn : {}) }}>Yes</button>
                <button onClick={() => set("hasArtwork", false)} style={{ ...toggleBtn, ...(!draft.hasArtwork ? toggleOn : {}) }}>No</button>
              </div>
            </Field>
            <Field label="Notes *" icon="📝">
              <textarea value={draft.notes} onChange={e => set("notes", e.target.value)} placeholder="What did they ask for? Any important details..." style={{ ...inp, minHeight: "88px", fontFamily: "inherit" }} maxLength={1000} />
              <div style={{ fontSize: "10.5px", color: "#888", textAlign: "right", marginTop: "3px" }}>{draft.notes.length}/1000</div>
            </Field>
            <Field label="Attach files (screenshots, artwork, references)" icon="📎">
              <label style={{ display: "block", padding: "20px", border: "1.5px dashed #d4d4d4", borderRadius: "10px", background: "var(--preview-surface-2)", textAlign: "center", cursor: "pointer", color: "#666" }}>
                <div style={{ fontSize: "22px", marginBottom: "6px" }}>📎</div>
                <div style={{ fontSize: "12.5px", fontWeight: 600 }}>Click to upload or drag files here</div>
                <div style={{ fontSize: "11px", color: "#999", marginTop: "3px" }}>Instagram screenshots, email attachments, artwork · PNG, JPG, PDF up to 20MB</div>
                <input type="file" multiple style={{ display: "none" }} onChange={e => {
                  if (!e.target.files) return;
                  const added = Array.from(e.target.files).map(f => ({
                    name: f.name,
                    size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`,
                    kind: f.type.startsWith("image") ? "image" : f.name.endsWith(".pdf") ? "pdf" : "file",
                  }));
                  setDraft({ ...draft, files: [...(draft.files || []), ...added] });
                  e.target.value = "";
                }} />
              </label>
              {draft.files && draft.files.length > 0 && (
                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "5px" }}>
                  {draft.files.map((f: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "#f7f7f7", border: "1px solid var(--preview-border)", borderRadius: "6px" }}>
                      <span style={{ fontSize: "13px" }}>{f.kind === "image" ? "🖼" : f.kind === "pdf" ? "📄" : "📎"}</span>
                      <span style={{ flex: 1, fontSize: "12px", fontWeight: 600, color: "#171717", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span style={{ fontSize: "11px", color: "#888" }}>{f.size}</span>
                      <span onClick={() => setDraft({ ...draft, files: draft.files.filter((_: any, j: number) => j !== i) })} style={{ cursor: "pointer", color: "#dc2626", fontSize: "12px" }}>✕</span>
                    </div>
                  ))}
                </div>
              )}
            </Field>
          </div>

          {/* Right sidebar: AI summary + existing check + who captures */}
          <div>
            <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px" }}>✨</span>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#171717" }}>AI Quick Summary</span>
                <span style={{ marginLeft: "auto", padding: "1px 7px", background: "#7c3aed", color: "#fff", fontSize: "9px", fontWeight: 700, borderRadius: "999px" }}>Live</span>
              </div>
              <div style={{ fontSize: "11px", color: "#666", marginBottom: "8px" }}>As you fill in the details, Nova AI will summarize.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "11.5px" }}>
                <AIField label="Products" value={summary.products} />
                <AIField label="Quantity" value={summary.quantity} />
                <AIField label="Urgency" value={summary.urgency} />
                <AIField label="Design Needed" value={summary.designNeeded} />
                <AIField label="Estimated Value" value={summary.estValue} />
              </div>
            </div>

            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <span style={{ fontSize: "13px" }}>🔎</span>
                <span style={{ fontSize: "12.5px", fontWeight: 800 }}>Existing Customer Check</span>
              </div>
              <div style={{ fontSize: "10.5px", color: "#065f46", marginBottom: "8px" }}>We'll automatically check if this is an existing customer and show their history here.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "11.5px" }}>
                <AIField label="Customer Status" value={existingCheck.status} />
                <AIField label="Previous Orders" value={existingCheck.prevOrders} />
                <AIField label="Lifetime Spend" value={existingCheck.lifetime} />
                <AIField label="Last Order Date" value={existingCheck.lastOrder} />
              </div>
            </div>

          </div>
        </div>

        {/* Footer buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #f0f0f0" }}>
          <button onClick={onClose} style={{ padding: "9px 16px", background: "#fff", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button
            onClick={() => onSave(buildLeadFromDraft(false), false)}
            style={{ padding: "9px 22px", background: ACCENT, border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, color: "#fff", cursor: "pointer" }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", background: "#fff", outline: "none", boxSizing: "border-box" };
const toggleBtn: React.CSSProperties = { padding: "8px 20px", border: "1px solid var(--preview-border)", background: "#fff", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontWeight: 600 };
const toggleOn: React.CSSProperties = { background: ACCENT, color: "#fff", borderColor: ACCENT };

function Field({ label, icon, children }: any) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "5px" }}>
        {icon} {label}
      </label>
      {children}
    </div>
  );
}
function AIField({ label, value }: any) {
  const isEmpty = value === "—" || !value;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ color: "#666", display: "flex", alignItems: "center", gap: "4px" }}>{label}</span>
      <span style={{ fontWeight: 700, color: isEmpty ? "#bbb" : "#171717" }}>{value}</span>
    </div>
  );
}

function TagPill({ color, label, filled }: any) {
  return (
    <span style={{
      padding: "3px 10px",
      background: filled ? color : color + "22",
      color: filled ? "#fff" : color,
      fontSize: "11px", fontWeight: 700, borderRadius: "6px",
    }}>{label}</span>
  );
}

// Hayk 2026-07-01 — Comms history from the unified Inbox, last 3 touchpoints.
// Sources: /preview/inbox/_seed. Clicking a row deep-links into the inbox.
function LeadCommsPreview({ leadId, phone, email, instagram }: { leadId: string; phone?: string; email?: string; instagram?: string }) {
  const items = commsForLead(leadId, phone, email, instagram, 3);
  const channelIcon: Record<string, string> = { call: "📞", sms: "📱", email: "✉", ig: "📷", web_form: "🌐" };
  return (
    <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "10px 12px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--preview-text-muted)", fontWeight: 700 }}>
          Recent Comms
        </div>
        <a href="/preview/inbox" style={{ fontSize: "10.5px", color: ACCENT, textDecoration: "none", fontWeight: 700 }}>Open Inbox →</a>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", fontStyle: "italic", padding: "4px 0" }}>
          No touchpoints yet for this lead.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {items.map((it) => (
            <a
              key={it.id}
              href={`/preview/inbox?item=${encodeURIComponent(it.id)}`}
              style={{ display: "flex", gap: "8px", padding: "6px 8px", borderRadius: "6px", textDecoration: "none", color: "var(--preview-text)", background: "var(--preview-surface)", border: "1px solid var(--preview-border)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--preview-chip-bg)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--preview-surface)")}
            >
              <div style={{ fontSize: "13px", lineHeight: 1.1 }}>{channelIcon[it.channel] ?? "•"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--preview-text)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                  {it.aiSummary}
                </div>
                <div style={{ fontSize: "10px", color: "var(--preview-text-muted)", marginTop: "1px" }}>{it.receivedAt}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ icon, label, big, highlight, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
      padding: big ? "10px" : "8px",
      background: highlight ? ACCENT : "var(--preview-chip-bg-strong)",
      border: `1px solid ${highlight ? ACCENT : "var(--preview-chip-border)"}`,
      borderRadius: "8px",
      color: "var(--preview-text)",
      fontSize: big ? "12.5px" : "11.5px",
      fontWeight: highlight ? 700 : 600,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }}>{icon} {label}</button>
  );
}

function CTABtn({ label, primary, danger }: any) {
  return (
    <button style={{
      width: "100%",
      padding: "10px",
      background: primary ? ACCENT : danger ? "rgba(220,38,38,0.1)" : "var(--preview-chip-bg)",
      border: `1px solid ${primary ? ACCENT : danger ? "#dc262666" : "var(--preview-chip-border)"}`,
      borderRadius: "8px",
      color: primary ? "#fff" : danger ? "#f87171" : "#e5e5e5",
      fontSize: "12.5px", fontWeight: 700, cursor: "pointer",
      textAlign: "left",
    }}>{label}</button>
  );
}

// Vertical stage rail — legible labels + the dates we actually have (created +
// current stage). Replaces the cramped horizontal stepper.
function StageProgress({ current, stamps }: { current: Stage; big?: boolean; stamps?: Partial<Record<Stage, string>> }) {
  const idx = STAGE_FLOW.indexOf(current);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "10px" }}>
      {STAGE_FLOW.map((s, i) => {
        const done = i < idx;
        const isCurrent = i === idx;
        const reached = done || isCurrent;
        const date = stamps?.[s];
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "3px 0" }}>
            <div style={{
              width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
              background: done ? "#22c55e" : isCurrent ? ACCENT : "var(--preview-surface-2)",
              color: reached ? "#fff" : "var(--preview-text-muted)",
              border: reached ? "none" : "1px solid var(--preview-border)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 800,
            }}>{done ? "✓" : isCurrent ? "●" : i + 1}</div>
            <span style={{ fontSize: "12px", color: reached ? "var(--preview-text)" : "var(--preview-text-muted)", fontWeight: isCurrent ? 800 : 500 }}>{s}</span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
              {date && <span style={{ fontSize: "10.5px", color: isCurrent ? ACCENT : "var(--preview-text-muted)", fontWeight: isCurrent ? 700 : 600 }}>{date}</span>}
              {isCurrent && <span style={{ fontSize: "9px", fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Now</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PanelCard({ title, children, beta, big, rightLink }: any) {
  return (
    <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: big ? "12px" : "10px", padding: big ? "14px 16px" : "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: big ? "12px" : "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--preview-text-muted)" }}>{title}</span>
          {beta && <span style={{ padding: "1px 6px", background: "linear-gradient(135deg, #a78bfa, #ec4899)", color: "#fff", fontSize: "8.5px", fontWeight: 700, borderRadius: "999px" }}>BETA</span>}
        </div>
        {rightLink && <span style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", cursor: "pointer" }}>{rightLink}</span>}
      </div>
      {children}
    </div>
  );
}

function SmallRow({ icon, value, sub, copyable, onCopy }: any) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => { if (onCopy) { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1200); } };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
      <span style={{ fontSize: "12px", color: "var(--preview-text-muted)" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12.5px", color: "var(--preview-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
        {sub && <div style={{ fontSize: "10px", color: "var(--preview-text-muted)" }}>{sub}</div>}
      </div>
      {copyable && <span onClick={doCopy} style={{ color: copied ? "#4ade80" : "var(--preview-text-faint)", fontSize: "12px", cursor: "pointer", fontWeight: copied ? 700 : 500 }}>{copied ? "✓" : "⧉"}</span>}
    </div>
  );
}

function MiniField({ label, value, valueColor }: any) {
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{label}</div>
      <div style={{ fontSize: "12.5px", color: valueColor || "#fff", fontWeight: 600, marginTop: "1px" }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, sub }: any) {
  return (
    <div>
      <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--preview-text)", marginTop: "2px" }}>{value}</div>
      {sub && <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{sub}</div>}
    </div>
  );
}

function AICard({ label, value, band, small }: any) {
  const bandColor = band === "High" ? "#4ade80" : band === "Good" ? "#38bdf8" : band === "Medium" ? "#fbbf24" : band === "Low" ? "#f87171" : "#4ade80";
  return (
    <div style={{ background: "var(--preview-chip-bg)", padding: "8px 10px", borderRadius: "8px" }}>
      <div style={{ fontSize: "9.5px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: small ? "13px" : "18px", fontWeight: 800, color: "var(--preview-text)", marginTop: "3px", lineHeight: 1 }}>{value}</div>
      {band && <div style={{ fontSize: "10px", color: bandColor, fontWeight: 700, marginTop: "3px" }}>{small ? band : `↗ ${band}`}</div>}
    </div>
  );
}

// ─── Shared dark input style ────────────────────────────────
const darkInp: React.CSSProperties = { width: "100%", padding: "8px 10px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--preview-chip-border)", borderRadius: "6px", color: "var(--preview-text)", fontSize: "12.5px", outline: "none", boxSizing: "border-box" };


// ─── Quick Action Modal — Call, SMS, Email, Send Quote, Assign, Follow-up, Convert to Order, Route ─────
function QuickActionModal({ type, lead, team = [], onClose, onLog, onAttach }: { type: string; lead: Lead; team?: TeamMember[]; onClose: () => void; onLog: (i: CommItem) => void; onAttach: (f: any) => void }) {
  const roster = team;
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [assignee, setAssignee] = useState(team[0]?.code ?? "");
  const [followupDate, setFollowupDate] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [pendingFiles, setPendingFiles] = useState<any[]>([]);

  const titles: Record<string, string> = {
    call: "📞 Call customer", sms: "💬 Send SMS", email: "✉ Send Email", quote: "📄 Send Quote",
    assign: "🎯 Assign to team member", followup: "📅 Schedule follow-up", convert: "✓ Convert to Order",
    route: "→ Route to Sales",
  };

  const doSubmit = () => {
    const now = { id: `c${Date.now()}`, at: nowStamp(), atRel: "just now", author: "Hayk Zohrabyan" };
    if (type === "call") onLog({ ...now, type: "call_out", body: `Called ${lead.name}.`, callSummary: body || "Call logged — no summary.", callDurationSec: 60 * 3, ...(pendingFiles.length ? { attachments: pendingFiles } : {}) });
    if (type === "sms") {
      // Actually send via Twilio (routed to your test number for safety), then log.
      const draft = body;
      sendSms({ to: lead.phone || "", body: draft }).then(r => {
        onLog({ ...now, type: "sms_out", body: (draft || "(empty message)") + (r.ok ? "" : `  ⚠ not sent: ${r.detail}`) });
      });
      onClose();
      return;
    }
    if (type === "email") onLog({ ...now, type: "email_out", subject: subject || "(no subject)", body: body || "(no body)", ...(pendingFiles.length ? { attachments: pendingFiles } : {}) });
    if (type === "quote") onLog({ ...now, type: "email_out", subject: `Quote #Q-${Date.now().toString().slice(-4)} · ${lead.name}`, body: `Sent quote for ${quoteAmount || "amount TBD"}. ${body}`, attachments: [{ name: `QO-2026-${Date.now().toString().slice(-4)}.pdf`, size: "246 KB", kind: "pdf" }, ...pendingFiles] });
    if (type === "assign") {
      const t = roster.find(m => m.code === assignee);
      onLog({ ...now, type: "note", noteAuthor: "Hayk Zohrabyan", body: `Assigned to ${t?.name ?? "—"}${t?.role ? ` (${t.role})` : ""}. Question: ${body || "See lead notes."}` });
    }
    if (type === "followup") onLog({ ...now, type: "note", noteAuthor: "Hayk Zohrabyan", body: `Follow-up scheduled for ${followupDate || "TBD"}. ${body}` });
    if (type === "convert") onLog({ ...now, type: "note", noteAuthor: "Hayk Zohrabyan", body: `Lead converted to order. Value: ${quoteAmount || "TBD"}. ${body}` });
    if (type === "route") onLog({ ...now, type: "note", noteAuthor: "Hayk Zohrabyan", body: `Marked Qualified — routed to Sales. ${body}` });
    pendingFiles.forEach(f => onAttach(f));
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--preview-surface-2)", color: "var(--preview-text)", borderRadius: "14px", width: "min(560px, 95vw)", maxHeight: "92vh", overflowY: "auto", padding: "22px 24px", border: "1px solid var(--preview-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>{titles[type]}</div>
            <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "2px" }}>{lead.name} · {lead.company}</div>
          </div>
          <button onClick={onClose} style={{ background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", color: "var(--preview-text)", width: "28px", height: "28px", borderRadius: "50%", cursor: "pointer", fontSize: "13px" }}>✕</button>
        </div>

        {/* Type-specific fields */}
        {type === "email" || type === "quote" ? (
          <div style={{ marginBottom: "10px" }}>
            <label style={darkLabel}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={type === "quote" ? "Quote for..." : "Subject"} style={darkInp} />
          </div>
        ) : null}

        {type === "quote" && (
          <div style={{ marginBottom: "10px" }}>
            <label style={darkLabel}>Quote amount</label>
            <input value={quoteAmount} onChange={e => setQuoteAmount(e.target.value)} placeholder="$12,450" style={darkInp} />
          </div>
        )}

        {type === "assign" && (
          <div style={{ marginBottom: "10px" }}>
            <label style={darkLabel}>Assign to</label>
            {roster.length === 0 && <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "6px" }}>No team members added yet — real users appear here once they're in the system.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "6px" }}>
              {roster.map(m => {
                const on = assignee === m.code;
                return (
                  <label key={m.code} onClick={() => setAssignee(m.code)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "8px", background: on ? `${ACCENT}22` : "var(--preview-chip-bg)", border: `1px solid ${on ? ACCENT : "var(--preview-chip-bg-strong)"}`, cursor: "pointer" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#171717", color: "#fff", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{m.code}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--preview-text)" }}>{m.name}</div>
                      <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{m.role}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {type === "followup" && (
          <div style={{ marginBottom: "10px" }}>
            <label style={darkLabel}>Follow-up date & time</label>
            <input type="datetime-local" value={followupDate} onChange={e => setFollowupDate(e.target.value)} style={darkInp} />
          </div>
        )}

        {type === "convert" && (
          <>
            <div style={{ marginBottom: "10px", padding: "10px 12px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: "8px", fontSize: "12px", color: "var(--preview-text)" }}>
              🎉 Converting <b>{lead.name}</b> to an order will create Order #ORD-{Date.now().toString().slice(-4)} and move this lead to Won.
            </div>
            <div style={{ marginBottom: "10px" }}>
              <label style={darkLabel}>Order total</label>
              <input value={quoteAmount} onChange={e => setQuoteAmount(e.target.value)} placeholder="$12,450" style={darkInp} />
            </div>
          </>
        )}

        <div style={{ marginBottom: "12px" }}>
          <label style={darkLabel}>
            {type === "call" ? "Call summary (what was discussed, next steps)" :
             type === "sms" ? "Message" :
             type === "email" ? "Email body" :
             type === "quote" ? "Notes for customer (optional)" :
             type === "assign" ? "Question / context for assignee" :
             type === "followup" ? "Follow-up notes" :
             type === "convert" ? "Additional notes" :
             "Notes"}
          </label>
          <textarea value={body} onChange={e => setBody(e.target.value)} style={{ ...darkInp, minHeight: "90px", resize: "vertical", fontFamily: "inherit" }} placeholder="..." />
        </div>

        {/* Attachments */}
        {["email", "quote", "assign"].includes(type) && (
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", color: "var(--preview-text)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              📎 Attach file
              <input type="file" multiple style={{ display: "none" }} onChange={e => {
                if (!e.target.files) return;
                const added = Array.from(e.target.files).map(f => ({
                  name: f.name,
                  size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`,
                  kind: f.type.startsWith("image") ? "image" : f.name.endsWith(".pdf") ? "pdf" : "file",
                }));
                setPendingFiles([...pendingFiles, ...added]);
                e.target.value = "";
              }} />
            </label>
            {pendingFiles.length > 0 && (
              <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {pendingFiles.map((f, i) => (
                  <span key={i} style={{ padding: "4px 10px", background: "var(--preview-chip-bg-strong)", borderRadius: "6px", fontSize: "11px", color: "var(--preview-text)", display: "flex", alignItems: "center", gap: "6px" }}>
                    📎 {f.name} <span style={{ color: "var(--preview-text-muted)" }}>{f.size}</span>
                    <span onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "var(--preview-text-faint)" }}>✕</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--preview-border)" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", color: "var(--preview-text)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={doSubmit} style={{ padding: "8px 16px", background: type === "convert" ? "#16a34a" : ACCENT, border: "none", borderRadius: "8px", color: "#fff", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
            {type === "call" ? "Log Call" :
             type === "sms" ? "Send SMS" :
             type === "email" ? "Send Email" :
             type === "quote" ? "Send Quote" :
             type === "assign" ? "Assign & Notify" :
             type === "followup" ? "Schedule" :
             type === "convert" ? "Convert to Order" :
             "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const darkLabel: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.06em" };

// ─── Edit Lead Modal ─────────────────────────────────────
function EditLeadModal({ lead, onClose, onSave }: { lead: Lead; onClose: () => void; onSave: (patch: Partial<Lead>) => void }) {
  const [name, setName] = useState(lead.name || "");
  const [company, setCompany] = useState(lead.company || "");
  const [email, setEmail] = useState(lead.email || "");
  const [phone, setPhone] = useState(lead.phone || "");
  const [source, setSource] = useState<Lead["source"]>(lead.source);
  const [priority, setPriority] = useState<Priority>(lead.priority || "Medium");
  const [nextAction, setNextAction] = useState(lead.nextAction || "");
  const [notes, setNotes] = useState(lead.notes || "");
  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", background: "var(--preview-surface)", color: "var(--preview-text)", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.05em" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--preview-surface)", color: "var(--preview-text)", borderRadius: "14px", padding: "22px 26px", width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid var(--preview-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}>Edit Lead</h2>
            <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", marginTop: "2px" }}>{lead.id} · changes apply immediately in this preview</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--preview-text-muted)", fontSize: "20px", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
          <div>
            <label style={lbl}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Source</label>
            <select value={source} onChange={e => setSource(e.target.value as Lead["source"])} style={inp}>
              <option>Instagram</option>
              <option>Website</option>
              <option>Referral</option>
              <option>Email</option>
              <option>Phone</option>
              <option>Walk-in</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} style={inp}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label style={lbl}>Next action</label>
          <input value={nextAction} onChange={e => setNextAction(e.target.value)} style={inp} />
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={lbl}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--preview-border)" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", background: "var(--preview-chip-bg-strong)", border: "1px solid var(--preview-chip-border)", borderRadius: "8px", color: "var(--preview-text)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button
            onClick={() => onSave({ name, company, email, phone, source, priority, nextAction, notes })}
            style={{ padding: "8px 18px", background: ACCENT, border: "none", borderRadius: "8px", color: "#fff", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
          >Save Changes</button>
        </div>
      </div>
    </div>
  );
}
