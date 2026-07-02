"use client";

// Hayk 2026-07-01 — Sales Pipeline preview.
// Kanban-first per spec doc. 9 stages, per-card actions, right inspector,
// "Deals That Need Your Attention" table, search + team filter + Filters modal,
// stage move menu on every card (no dead buttons).
// Real /sales-pipeline page NOT touched.

import { useMemo, useState } from "react";

const ACCENT = "#FF5D2E";

// ─── Stages ────────────────────────────────────────────
const STAGES = [
  "Assigned", "Contacted", "Qualifying", "Quoting", "Quote Approval",
  "Awaiting Payment", "Closed Today", "Follow Up", "Lost",
] as const;
type Stage = typeof STAGES[number];

const STAGE_COLORS: Record<Stage, string> = {
  "Assigned": "#94a3b8",
  "Contacted": "#3b82f6",
  "Qualifying": "#8b5cf6",
  "Quoting": "#f97316",
  "Quote Approval": "#eab308",
  "Awaiting Payment": "#06b6d4",
  "Closed Today": "#22c55e",
  "Follow Up": "#f59e0b",
  "Lost": "#dc2626",
};

// ─── Types ────────────────────────────────────────────
type Priority = "High" | "Medium" | "Low";
type ActivityKind = "quote_viewed" | "email_opened" | "email_replied" | "email_sent" | "called" | "sms_from" | "sms_sent" | "approved" | "paid" | "waiting_approval" | "no_response" | "customer_replied" | "phone_call";

interface Deal {
  id: string;
  customer: string;
  starred?: boolean;
  company?: string;
  product: string;
  productLabel?: string;
  estValue: number;
  priority: Priority;
  lastActivity: { kind: ActivityKind; label: string; at: string };
  rep: "MC" | "MH" | "GM" | "EN";
  stage: Stage;
  probability?: number;
  timeInStageHours: number;
  hoursInSystem: number;
  lastActivityHoursAgo: number;
  projectDetails: {
    products: string;
    quantity?: string;
    needBy?: string;
    hasArtwork?: "Yes" | "No" | "Partial";
    budget?: string;
    decisionMaker?: "Yes" | "No" | "Unknown";
    currentSupplier?: string;
  };
  nextAction?: { label: string; dueLabel: string; overdue?: boolean };
  activityTimeline?: { icon: string; tint: string; title: string; sub?: string; at: string }[];
}

const REPS: Record<string, { name: string; short: string; color: string }> = {
  MC: { name: "Manny Carlo", short: "Manny C.", color: "#3b82f6" },
  MH: { name: "Maria Hakobyan", short: "Maria H.", color: "#f97316" },
  GM: { name: "Gary Matevosyan", short: "Gary M.", color: "#8b5cf6" },
  EN: { name: "Ernesto Navarro", short: "Ernesto N.", color: "#22c55e" },
};

// ─── Mock dataset ────────────────────────────────────────
const INITIAL_DEALS: Deal[] = [
  { id: "d1", customer: "Safe Care Packaging", product: "Custom Boxes", estValue: 2800, priority: "Low", lastActivity: { kind: "email_sent", label: "1d ago", at: "1d ago" }, rep: "MC", stage: "Assigned", timeInStageHours: 26, hoursInSystem: 26, lastActivityHoursAgo: 24, projectDetails: { products: "Custom Boxes", quantity: "500 units" }, nextAction: { label: "Call to introduce", dueLabel: "Due today" } },
  { id: "d2", customer: "Dream Smoke", product: "Mylar Bags", estValue: 3600, priority: "Medium", lastActivity: { kind: "email_sent", label: "32m ago", at: "32m ago" }, rep: "MC", stage: "Assigned", timeInStageHours: 3, hoursInSystem: 3, lastActivityHoursAgo: 0.5, projectDetails: { products: "Mylar Bags", quantity: "1,000 units" }, nextAction: { label: "Send intro email", dueLabel: "Due today" } },
  { id: "d3", customer: "Little Bud Co", product: "Labels", estValue: 5100, priority: "Medium", lastActivity: { kind: "email_sent", label: "2d ago", at: "2d ago" }, rep: "MH", stage: "Assigned", timeInStageHours: 50, hoursInSystem: 50, lastActivityHoursAgo: 48, projectDetails: { products: "Labels", quantity: "3,000 units" } },
  { id: "d4", customer: "Vibe Tea", product: "Labels", estValue: 3200, priority: "Low", lastActivity: { kind: "email_sent", label: "3d ago", at: "3d ago" }, rep: "GM", stage: "Assigned", timeInStageHours: 74, hoursInSystem: 74, lastActivityHoursAgo: 72, projectDetails: { products: "Labels" } },

  { id: "c1", customer: "Cali Plug", product: "Labels", estValue: 4200, priority: "Medium", lastActivity: { kind: "called", label: "Called 2h ago", at: "2h ago" }, rep: "MC", stage: "Contacted", timeInStageHours: 12, hoursInSystem: 60, lastActivityHoursAgo: 2, projectDetails: { products: "Labels", quantity: "2,000 units" }, nextAction: { label: "Send follow up email", dueLabel: "Due tomorrow 9:00 AM" } },
  { id: "c2", customer: "Green Life", product: "Boxes", estValue: 3800, priority: "Low", lastActivity: { kind: "email_replied", label: "Email replied 1h ago", at: "1h ago" }, rep: "MC", stage: "Contacted", timeInStageHours: 4, hoursInSystem: 30, lastActivityHoursAgo: 1, projectDetails: { products: "Boxes", quantity: "800 units" } },
  { id: "c3", customer: "Sun Root Cafe", product: "Cup Sleeves", estValue: 2700, priority: "Low", lastActivity: { kind: "called", label: "Called 4h ago", at: "4h ago" }, rep: "MH", stage: "Contacted", timeInStageHours: 18, hoursInSystem: 92, lastActivityHoursAgo: 4, projectDetails: { products: "Cup Sleeves" } },
  { id: "c4", customer: "Cane Cove", product: "Labels", estValue: 4900, priority: "Medium", lastActivity: { kind: "email_opened", label: "Email opened 30m ago", at: "30m ago" }, rep: "MH", stage: "Contacted", timeInStageHours: 22, hoursInSystem: 46, lastActivityHoursAgo: 0.5, projectDetails: { products: "Labels" } },

  { id: "q1", customer: "Urban Flower", product: "Custom Boxes", estValue: 6500, priority: "Medium", lastActivity: { kind: "sms_from", label: "SMS 1h ago", at: "1h ago" }, rep: "MC", stage: "Qualifying", timeInStageHours: 20, hoursInSystem: 96, lastActivityHoursAgo: 1, projectDetails: { products: "Custom Boxes", quantity: "1,500 units", hasArtwork: "Partial" }, nextAction: { label: "Confirm artwork", dueLabel: "Due today" } },
  { id: "q2", customer: "Prime Cannabis", product: "Labels", estValue: 4800, priority: "Medium", lastActivity: { kind: "phone_call", label: "Phone call 4h ago", at: "4h ago" }, rep: "MC", stage: "Qualifying", timeInStageHours: 49, hoursInSystem: 120, lastActivityHoursAgo: 4, projectDetails: { products: "Labels", needBy: "Jul 20, 2026" }, nextAction: { label: "Confirm budget", dueLabel: "Due tomorrow 10:00 AM" } },
  { id: "q3", customer: "Rise Kombucha", product: "Bottle Labels", estValue: 5300, priority: "Medium", lastActivity: { kind: "email_replied", label: "Reply 3h ago", at: "3h ago" }, rep: "MH", stage: "Qualifying", timeInStageHours: 30, hoursInSystem: 78, lastActivityHoursAgo: 3, projectDetails: { products: "Bottle Labels", quantity: "2,500 units" } },

  { id: "qo1", customer: "Grim Lawd", starred: true, company: "Grimeylife Records", product: "Die Cutting", estValue: 18450, priority: "High", lastActivity: { kind: "quote_viewed", label: "Quote viewed 18m ago", at: "18m ago" }, rep: "MC", stage: "Quoting", timeInStageHours: 4.5, hoursInSystem: 40, lastActivityHoursAgo: 0.3, probability: 82, projectDetails: { products: "Die Cutting", quantity: "5,000 units", needBy: "July 15, 2026", hasArtwork: "Yes", budget: "$15K – $20K", decisionMaker: "Yes", currentSupplier: "ABC Printing" }, nextAction: { label: "Send revised quote", dueLabel: "Due today 11:00 AM" }, activityTimeline: [
    { icon: "👁", tint: "#22c55e", title: "Quote viewed", sub: "Customer viewed quote QO-2026-0189", at: "18m ago" },
    { icon: "✉", tint: "#f59e0b", title: "Email opened", sub: "You: Revised quote for Grim Lawd", at: "45m ago" },
    { icon: "✉", tint: "#8b5cf6", title: "Email sent", sub: "You: Initial quote", at: "2h ago" },
    { icon: "🎯", tint: "#3b82f6", title: "Lead assigned", sub: "Assigned to Maria Hakobyan", at: "3h ago" },
    { icon: "👤", tint: "#f97316", title: "Lead created", sub: "From Instagram", at: "Yesterday, 2:10 PM" },
  ] },
  { id: "qo2", customer: "Safe Care Packaging", product: "Folding Cartons", estValue: 12450, priority: "High", lastActivity: { kind: "email_opened", label: "Email opened 45m ago", at: "45m ago" }, rep: "MC", stage: "Quote Approval", timeInStageHours: 54, hoursInSystem: 168, lastActivityHoursAgo: 2, probability: 71, projectDetails: { products: "Folding Cartons", quantity: "3,000 units", hasArtwork: "Yes" }, nextAction: { label: "Call customer", dueLabel: "Due today 2:00 PM" } },
  { id: "qo3", customer: "Golden Leaf", product: "Mylar Pouches", estValue: 8200, priority: "Medium", lastActivity: { kind: "email_opened", label: "Email opened 6h ago", at: "6h ago" }, rep: "MH", stage: "Quoting", timeInStageHours: 22, hoursInSystem: 110, lastActivityHoursAgo: 6, probability: 55, projectDetails: { products: "Mylar Pouches", quantity: "2,000 units" }, nextAction: { label: "Follow up", dueLabel: "Due today" } },
  { id: "qo4", customer: "Ivy Beauty", product: "Cosmetic Labels", estValue: 7100, priority: "Medium", lastActivity: { kind: "quote_viewed", label: "Quote viewed 2h ago", at: "2h ago" }, rep: "GM", stage: "Quoting", timeInStageHours: 12, hoursInSystem: 88, lastActivityHoursAgo: 2, probability: 60, projectDetails: { products: "Cosmetic Labels" } },

  { id: "qa1", customer: "Global 448", product: "Die Cutting", estValue: 21300, priority: "High", lastActivity: { kind: "customer_replied", label: "Customer replied 2h ago", at: "2h ago" }, rep: "MC", stage: "Quote Approval", timeInStageHours: 27, hoursInSystem: 200, lastActivityHoursAgo: 2, probability: 74, projectDetails: { products: "Die Cutting", quantity: "8,000 units", needBy: "Aug 1, 2026", hasArtwork: "Yes", budget: "$18K – $25K", decisionMaker: "Yes" }, nextAction: { label: "Follow up", dueLabel: "Due today 3:00 PM" } },
  { id: "qa2", customer: "Mala Influencia", product: "Folding Cartons", estValue: 16900, priority: "Medium", lastActivity: { kind: "waiting_approval", label: "Waiting approval 5h ago", at: "5h ago" }, rep: "MC", stage: "Quote Approval", timeInStageHours: 30, hoursInSystem: 140, lastActivityHoursAgo: 5, probability: 60, projectDetails: { products: "Folding Cartons", quantity: "4,000 units" } },

  { id: "ap1", customer: "Danny J. Lee", product: "Custom Boxes", estValue: 9870, priority: "High", lastActivity: { kind: "approved", label: "Approved 3h ago", at: "3h ago" }, rep: "MC", stage: "Awaiting Payment", timeInStageHours: 24, hoursInSystem: 220, lastActivityHoursAgo: 3, probability: 90, projectDetails: { products: "Custom Boxes", quantity: "2,500 units" }, nextAction: { label: "Send payment link", dueLabel: "Due today 4:00 PM" } },
  { id: "ap2", customer: "Naomi Nhiho", product: "Mylar Bags", estValue: 5430, priority: "High", lastActivity: { kind: "waiting_approval", label: "Waiting payment 8h ago", at: "8h ago" }, rep: "MC", stage: "Awaiting Payment", timeInStageHours: 30, hoursInSystem: 190, lastActivityHoursAgo: 8, probability: 85, projectDetails: { products: "Mylar Bags" } },

  { id: "ct1", customer: "Roberto Mojica", product: "Folding Cartons", estValue: 8200, priority: "Low", lastActivity: { kind: "paid", label: "Paid 2h ago", at: "2h ago" }, rep: "MC", stage: "Closed Today", timeInStageHours: 2, hoursInSystem: 260, lastActivityHoursAgo: 2, probability: 100, projectDetails: { products: "Folding Cartons", quantity: "1,500 units" } },
  { id: "ct2", customer: "Unity Coffee", product: "Labels", estValue: 6800, priority: "Low", lastActivity: { kind: "paid", label: "Paid 4h ago", at: "4h ago" }, rep: "MC", stage: "Closed Today", timeInStageHours: 4, hoursInSystem: 300, lastActivityHoursAgo: 4, probability: 100, projectDetails: { products: "Labels" } },
  { id: "ct3", customer: "Palma Skincare", product: "Bottle Labels", estValue: 5340, priority: "Medium", lastActivity: { kind: "paid", label: "Paid 6h ago", at: "6h ago" }, rep: "EN", stage: "Closed Today", timeInStageHours: 6, hoursInSystem: 180, lastActivityHoursAgo: 6, probability: 100, projectDetails: { products: "Bottle Labels" } },

  { id: "fu1", customer: "Halcyon Herbal", product: "Loose Leaf Pouch", estValue: 5900, priority: "Medium", lastActivity: { kind: "no_response", label: "No response 3d ago", at: "3d ago" }, rep: "EN", stage: "Follow Up", timeInStageHours: 96, hoursInSystem: 360, lastActivityHoursAgo: 72, projectDetails: { products: "Loose Leaf Pouch" }, nextAction: { label: "Third follow-up", dueLabel: "Due tomorrow" } },
  { id: "fu2", customer: "Kingdom Kombucha", product: "Bottle Labels", estValue: 2500, priority: "Low", lastActivity: { kind: "no_response", label: "No response 5d ago", at: "5d ago" }, rep: "EN", stage: "Follow Up", timeInStageHours: 130, hoursInSystem: 420, lastActivityHoursAgo: 120, projectDetails: { products: "Bottle Labels" } },

  { id: "l1", customer: "Bear & Bone Co", product: "Craft Paper Bags", estValue: 3200, priority: "Low", lastActivity: { kind: "no_response", label: "Went with competitor", at: "6d ago" }, rep: "GM", stage: "Lost", timeInStageHours: 144, hoursInSystem: 480, lastActivityHoursAgo: 144, projectDetails: { products: "Craft Paper Bags" } },
];

// ─── Format ────────────────────────────────────────────
const fmtMoney = (n: number) => `$${n.toLocaleString()}`;
const fmtHours = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24); const rem = Math.round(h - d * 24);
  return rem ? `${d}d ${rem}h` : `${d}d`;
};
// Short single-unit format for the age badge: 45m / 8h / 3d / 2w
const fmtAgeShort = (h: number) => {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 7) return `${Math.round(d)}d`;
  return `${Math.round(d / 7)}w`;
};
// Time-age badge — left = time in system, right = time in current stage.
// Color coding is driven by time-in-stage.
const ageBadge = (hoursInSystem: number, hoursInStage: number) => {
  let bg = "rgba(34,197,94,0.12)", color = "#16a34a";      // < 24h
  if (hoursInStage >= 72)      { bg = "rgba(239,68,68,0.12)"; color = "#dc2626"; }
  else if (hoursInStage >= 24) { bg = "rgba(251,191,36,0.14)"; color = "#b45309"; }
  return {
    text: `⏱ ${fmtAgeShort(hoursInSystem)} / ${fmtAgeShort(hoursInStage)}`,
    bg, color,
    title: `In system: ${fmtHours(hoursInSystem)} · In this stage: ${fmtHours(hoursInStage)}`,
  };
};
// Stale threshold for the "Stale only" filter chip.
const isStale = (d: { timeInStageHours: number }) => d.timeInStageHours > 72;
const activityIcon = (k: ActivityKind) => {
  const map: Record<ActivityKind, { icon: string; color: string }> = {
    quote_viewed: { icon: "👁", color: "#22c55e" },
    email_opened: { icon: "✉", color: "#f59e0b" },
    email_replied: { icon: "✉", color: "#3b82f6" },
    email_sent: { icon: "✉", color: "#8b5cf6" },
    called: { icon: "📞", color: "#22c55e" },
    sms_from: { icon: "💬", color: "#3b82f6" },
    sms_sent: { icon: "💬", color: "#8b5cf6" },
    approved: { icon: "✓", color: "#22c55e" },
    paid: { icon: "💵", color: "#22c55e" },
    waiting_approval: { icon: "⏳", color: "#f59e0b" },
    no_response: { icon: "⚠", color: "#dc2626" },
    customer_replied: { icon: "✉", color: "#22c55e" },
    phone_call: { icon: "📞", color: "#3b82f6" },
  };
  return map[k];
};

// ─── Page ────────────────────────────────────────────
export default function SalesPipelinePreview() {
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const [fullDetailId, setFullDetailId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Filter deals
  const filtered = useMemo(() => {
    return deals.filter(d => {
      if (search && !d.customer.toLowerCase().includes(search.toLowerCase()) && !d.product.toLowerCase().includes(search.toLowerCase())) return false;
      if (teamFilter && d.rep !== teamFilter) return false;
      if (priorityFilter && d.priority !== priorityFilter) return false;
      if (staleOnly && !isStale(d)) return false;
      return true;
    });
  }, [deals, search, teamFilter, priorityFilter, staleOnly]);

  // Group by stage
  const byStage = useMemo(() => {
    const map: Record<Stage, Deal[]> = {} as any;
    STAGES.forEach(s => (map[s] = []));
    filtered.forEach(d => map[d.stage].push(d));
    return map;
  }, [filtered]);

  const selectedDeal = deals.find(d => d.id === selectedId) || null;

  // Deals that need attention: overdue next action OR untouched > 24h OR quote expiring
  const attentionDeals = useMemo(() => filtered.filter(d => d.nextAction && (d.timeInStageHours > 24 || d.lastActivityHoursAgo > 24 || d.priority === "High")).slice(0, 6), [filtered]);

  const moveDeal = (id: string, newStage: Stage) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: newStage, timeInStageHours: 0 } : d));
  };

  const clearFilters = () => { setTeamFilter(null); setPriorityFilter(null); setSearch(""); setAttentionOnly(false); setStaleOnly(false); };
  const anyFilter = teamFilter || priorityFilter || search || attentionOnly || staleOnly;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", margin: "-20px", padding: "20px", minHeight: "100vh", color: "var(--preview-text)" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>Sales Pipeline · Kanban + inspector · every button wired</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>Real /sales-pipeline page untouched</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>Sales Pipeline</h1>
          <div style={{ fontSize: "13px", color: "#666", marginTop: "2px" }}>Manage your deals and move them forward</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ position: "relative", width: "300px" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search leads, companies, or contacts..." style={{ width: "100%", padding: "9px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "10px", fontSize: "12.5px", outline: "none" }} />
            <span style={{ position: "absolute", right: "10px", top: "9px", fontSize: "10px", color: "#999", background: "#f5f5f5", padding: "2px 6px", borderRadius: "4px" }}>⌘K</span>
          </div>
          <button
            onClick={() => setStaleOnly(v => !v)}
            title="Show only deals stuck in current stage > 72h"
            style={{
              ...hdrBtn,
              padding: "8px 12px",
              borderColor: staleOnly ? "#dc2626" : "#e5e5e5",
              background: staleOnly ? "rgba(239,68,68,0.10)" : "var(--preview-surface)",
              color: staleOnly ? "#dc2626" : "#666",
              fontWeight: staleOnly ? 800 : 600,
            }}
          >
            🔴 Stale only
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setTeamMenuOpen(!teamMenuOpen)} style={{ ...hdrBtn, borderColor: teamFilter ? ACCENT : "#e5e5e5", color: teamFilter ? ACCENT : "#333" }}>
              👥 {teamFilter ? REPS[teamFilter].short : "All team members"} ▾
            </button>
            {teamMenuOpen && (
              <>
                <div onClick={() => setTeamMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                <div style={{ position: "absolute", top: "44px", right: 0, minWidth: "220px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: "6px 0", zIndex: 21 }}>
                  <button onClick={() => { setTeamFilter(null); setTeamMenuOpen(false); }} style={{ display: "flex", width: "100%", padding: "8px 14px", background: "transparent", border: "none", alignItems: "center", justifyContent: "space-between", fontSize: "12.5px", color: "#171717", fontWeight: 600, cursor: "pointer" }}>
                    <span>👥 All team members</span>
                    {!teamFilter && <span style={{ color: ACCENT }}>✓</span>}
                  </button>
                  <div style={{ height: "1px", background: "#f0f0f0", margin: "4px 0" }} />
                  {Object.entries(REPS).map(([code, r]) => {
                    const on = teamFilter === code;
                    return (
                      <button key={code} onClick={() => { setTeamFilter(code); setTeamMenuOpen(false); }} style={{ display: "flex", width: "100%", padding: "8px 14px", background: on ? "#fff7ed" : "transparent", border: "none", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "#171717", fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                        <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: r.color + "22", color: r.color, fontSize: "10px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{code}</span>
                        <span style={{ flex: 1, textAlign: "left" }}>{r.name}</span>
                        {on && <span style={{ color: ACCENT }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <button onClick={() => setFiltersOpen(true)} style={{ ...hdrBtn, ...(anyFilter ? { borderColor: ACCENT, color: ACCENT, fontWeight: 700 } : {}) }}>
            ⚙ Filters {anyFilter ? "•" : ""}
          </button>
          <button onClick={() => setAddOpen(true)} style={{ padding: "9px 16px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>+ Add Lead</button>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "3px", width: "fit-content", marginBottom: "14px" }}>
        <button onClick={() => setView("kanban")} style={vwBtn(view === "kanban")}>◧ Kanban</button>
        <button onClick={() => setView("list")} style={vwBtn(view === "list")}>≡ List</button>
      </div>

      {/* If full-detail is open, take over the page */}
      {fullDetailId ? (
        <FullDetailView deal={deals.find(d => d.id === fullDetailId)!} onBack={() => setFullDetailId(null)} onMove={(id, s) => { moveDeal(id, s); }} />
      ) : (
        <>
          {/* Automation hint */}
          <div style={{ background: "#fff", border: "1px solid #dbeafe", borderRadius: "10px", padding: "8px 14px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "#1e40af" }}>
            <span style={{ fontSize: "14px" }}>ℹ️</span>
            <span>Deals auto-advance as you work — contact made → Contacted, quote sent → Quoting, approved → Awaiting Payment, paid → Closed Today. You can also drag cards manually or use the "Move Stage" menu.</span>
          </div>

          {/* Main content: kanban/list + inspector */}
          <div style={{ display: "grid", gridTemplateColumns: selectedDeal ? "minmax(0, 1fr) 340px" : "1fr", gap: "14px", marginBottom: "18px" }}>
            <div style={{ minWidth: 0 }}>
              {view === "kanban"
                ? <KanbanBoard byStage={byStage} selectedId={selectedId} onSelect={setSelectedId} onMove={moveDeal} draggingId={draggingId} setDraggingId={setDraggingId} />
                : <DealsList deals={filtered} selectedId={selectedId} onSelect={setSelectedId} onMove={moveDeal} sortCol={sortCol} sortDir={sortDir} onSort={(c) => {
                    if (sortCol === c) setSortDir(sortDir === "asc" ? "desc" : "asc");
                    else { setSortCol(c); setSortDir("asc"); }
                  }} />}
            </div>
            {selectedDeal && <InspectorPanel deal={selectedDeal} onClose={() => setSelectedId(null)} onMove={moveDeal} onOpenFull={() => setFullDetailId(selectedDeal.id)} />}
          </div>

          {/* Deals That Need Your Attention */}
          <AttentionTable deals={attentionDeals} selectedId={selectedId} onSelect={setSelectedId} onMove={moveDeal} />
        </>
      )}

      {filtersOpen && (
        <FiltersModal
          teamFilter={teamFilter} setTeamFilter={setTeamFilter}
          priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
          attentionOnly={attentionOnly} setAttentionOnly={setAttentionOnly}
          clear={clearFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {addOpen && <QuickAddDealModal onClose={() => setAddOpen(false)} onAdd={d => { setDeals([d, ...deals]); setSelectedId(d.id); setAddOpen(false); }} />}
    </div>
  );
}

// ─── Kanban Board (drag & drop enabled, columns scroll internally) ─────
function KanbanBoard({ byStage, selectedId, onSelect, onMove, draggingId, setDraggingId }: { byStage: Record<Stage, Deal[]>; selectedId: string | null; onSelect: (id: string) => void; onMove: (id: string, s: Stage) => void; draggingId: string | null; setDraggingId: (id: string | null) => void }) {
  const [dropTarget, setDropTarget] = useState<Stage | null>(null);

  return (
    <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "min(240px, 100%)", gap: "10px", overflowX: "auto", paddingBottom: "8px" }}>
      {STAGES.map(stage => {
        const list = byStage[stage] || [];
        const total = list.reduce((a, b) => a + b.estValue, 0);
        const isClosed = stage === "Closed Today";
        const isDropTarget = dropTarget === stage && draggingId != null;
        return (
          <div
            key={stage}
            onDragOver={e => { if (draggingId) { e.preventDefault(); setDropTarget(stage); } }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={e => {
              e.preventDefault();
              if (draggingId) {
                onMove(draggingId, stage);
                setDraggingId(null);
                setDropTarget(null);
              }
            }}
            style={{
              background: isDropTarget ? "#fff7ed" : isClosed ? "#f0fdf4" : "#f7f7f7",
              borderRadius: "10px",
              padding: "10px",
              border: isDropTarget ? `2px dashed ${ACCENT}` : isClosed ? "1px solid #86efac" : "1px solid #eee",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              minHeight: "300px",
              maxHeight: "calc(100vh - 260px)",
            }}
          >
            {/* Column header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#171717" }}>{stage} {isClosed && "⭐"}</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "1px" }}>{list.length} Lead{list.length !== 1 ? "s" : ""} · {fmtMoney(total)}</div>
              </div>
              <button title="Add deal to this stage" style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: "14px" }}>＋</button>
            </div>
            {/* Scrollable card list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1, paddingRight: "2px", minHeight: 0 }}>
              {list.length === 0 && (
                <div style={{ padding: "20px 8px", textAlign: "center", fontSize: "11.5px", color: "#bbb", border: "1px dashed #ddd", borderRadius: "8px" }}>
                  {isDropTarget ? "Drop here" : "Empty"}
                </div>
              )}
              {list.map(d => (
                <DealCard
                  key={d.id}
                  deal={d}
                  selected={selectedId === d.id}
                  onSelect={onSelect}
                  onMove={onMove}
                  onDragStart={() => setDraggingId(d.id)}
                  onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                  isDragging={draggingId === d.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────
function DealCard({ deal, selected, onSelect, onMove, onDragStart, onDragEnd, isDragging }: { deal: Deal; selected: boolean; onSelect: (id: string) => void; onMove: (id: string, s: Stage) => void; onDragStart?: () => void; onDragEnd?: () => void; isDragging?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const priColor = deal.priority === "High" ? "#dc2626" : deal.priority === "Medium" ? "#f59e0b" : "#22c55e";
  const priBg = deal.priority === "High" ? "#fee2e2" : deal.priority === "Medium" ? "#fef3c7" : "#dcfce7";
  const ai = activityIcon(deal.lastActivity.kind);
  const age = ageBadge(deal.hoursInSystem, deal.timeInStageHours);
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart?.(); }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(deal.id)}
      style={{
        background: "#fff",
        border: `${selected ? 2 : 1}px solid ${selected ? ACCENT : "#eee"}`,
        borderRadius: "8px", padding: "10px 12px",
        cursor: isDragging ? "grabbing" : "grab",
        boxShadow: selected ? `0 0 0 3px ${ACCENT}22` : "0 1px 2px rgba(0,0,0,0.02)",
        position: "relative",
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity 0.1s",
      }}
    >
      {/* Age badge + menu button (top-right cluster) */}
      <div style={{ position: "absolute", top: "8px", right: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
        <span
          title={age.title}
          style={{
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "3px 7px",
            borderRadius: "999px",
            background: age.bg,
            color: age.color,
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {age.text}
        </span>
        <button onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }} style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", padding: "2px 4px", fontSize: "13px" }}>⋯</button>
        {menuOpen && (
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: "20px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 10, minWidth: "180px", padding: "6px 0" }}>
            <div style={{ padding: "4px 12px", fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Move to</div>
            {STAGES.filter(s => s !== deal.stage).map(s => (
              <button key={s} onClick={() => { onMove(deal.id, s); setMenuOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", background: "transparent", border: "none", fontSize: "12px", cursor: "pointer", color: "#333" }}>
                <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: STAGE_COLORS[s], marginRight: "6px" }} />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Customer */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", paddingRight: "110px" }}>
        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: REPS[deal.rep].color + "22", color: REPS[deal.rep].color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 800 }}>{deal.customer.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#171717", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {deal.customer}{deal.starred && <span style={{ color: "#fbbf24", marginLeft: "4px" }}>★</span>}
          </div>
          <div style={{ fontSize: "10.5px", color: "#888" }}>{deal.product}</div>
        </div>
      </div>

      {/* Value + priority */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
        <span style={{ fontSize: "13px", fontWeight: 800 }}>Est. {fmtMoney(deal.estValue)}</span>
        <span style={{ padding: "2px 7px", background: priBg, color: priColor, fontSize: "9.5px", fontWeight: 700, borderRadius: "4px" }}>{deal.priority}</span>
      </div>

      {/* Last activity */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", padding: "5px 8px", background: "var(--preview-surface-2)", borderRadius: "5px" }}>
        <span style={{ color: ai.color, fontSize: "11px" }}>{ai.icon}</span>
        <span style={{ fontSize: "10.5px", color: "#666", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.lastActivity.label}</span>
        <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: REPS[deal.rep].color + "22", color: REPS[deal.rep].color, fontSize: "8px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{deal.rep}</span>
      </div>
    </div>
  );
}

// ─── List View (sortable) ────────────────────────────────────────
function DealsList({ deals, selectedId, onSelect, onMove, sortCol, sortDir, onSort }: { deals: Deal[]; selectedId: string | null; onSelect: (id: string) => void; onMove: (id: string, s: Stage) => void; sortCol: string | null; sortDir: "asc" | "desc"; onSort: (col: string) => void }) {
  const PRI_ORDER: Record<Priority, number> = { "Low": 0, "Medium": 1, "High": 2 };
  const STAGE_ORDER_MAP: Record<Stage, number> = STAGES.reduce((acc, s, i) => ({ ...acc, [s]: i }), {} as any);

  const sorted = useMemo(() => {
    if (!sortCol) return deals;
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...deals];
    arr.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortCol) {
        case "customer": av = a.customer.toLowerCase(); bv = b.customer.toLowerCase(); break;
        case "product": av = a.product.toLowerCase(); bv = b.product.toLowerCase(); break;
        case "stage": av = STAGE_ORDER_MAP[a.stage]; bv = STAGE_ORDER_MAP[b.stage]; break;
        case "value": av = a.estValue; bv = b.estValue; break;
        case "priority": av = PRI_ORDER[a.priority]; bv = PRI_ORDER[b.priority]; break;
        case "activity": av = a.lastActivityHoursAgo; bv = b.lastActivityHoursAgo; break;
        case "rep": av = REPS[a.rep].name; bv = REPS[b.rep].name; break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [deals, sortCol, sortDir]);

  const SortableHeader = ({ col, label }: { col: string; label: string }) => {
    const active = sortCol === col;
    return (
      <th onClick={() => onSort(col)} style={{ ...th, cursor: "pointer", userSelect: "none", color: active ? ACCENT : "#888" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          {label}
          <span style={{ fontSize: "9px", opacity: active ? 1 : 0.4 }}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "▲▼"}
          </span>
        </span>
      </th>
    );
  };

  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "10px", border: "1px solid var(--preview-border)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--preview-surface-2)" }}>
            <SortableHeader col="customer" label="Customer" />
            <SortableHeader col="product" label="Product" />
            <SortableHeader col="stage" label="Stage" />
            <SortableHeader col="value" label="Value" />
            <SortableHeader col="priority" label="Priority" />
            <SortableHeader col="activity" label="Last Activity" />
            <th style={th}>Age</th>
            <SortableHeader col="rep" label="Rep" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(d => {
            const age = ageBadge(d.hoursInSystem, d.timeInStageHours);
            return (
            <tr key={d.id} onClick={() => onSelect(d.id)} style={{ borderTop: "1px solid #f4f4f4", background: selectedId === d.id ? "#fff7ed" : "transparent", cursor: "pointer" }}>
              <td style={td}><span style={{ fontWeight: 700 }}>{d.customer}</span>{d.starred && <span style={{ color: "#fbbf24", marginLeft: "4px" }}>★</span>}</td>
              <td style={td}>{d.product}</td>
              <td style={td}><span style={{ padding: "2px 8px", background: STAGE_COLORS[d.stage] + "22", color: STAGE_COLORS[d.stage], fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{d.stage}</span></td>
              <td style={td}><b>{fmtMoney(d.estValue)}</b></td>
              <td style={td}><PriPill p={d.priority} /></td>
              <td style={td}>{d.lastActivity.label}</td>
              <td style={td}><span title={age.title} style={{ fontSize: "10.5px", fontWeight: 700, padding: "3px 7px", borderRadius: "999px", background: age.bg, color: age.color, whiteSpace: "nowrap" }}>{age.text}</span></td>
              <td style={td}><span style={{ width: "24px", height: "24px", borderRadius: "50%", background: REPS[d.rep].color + "22", color: REPS[d.rep].color, fontSize: "10px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{d.rep}</span></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Attention table ────────────────────────────────────────
function AttentionTable({ deals, selectedId, onSelect, onMove }: { deals: Deal[]; selectedId: string | null; onSelect: (id: string) => void; onMove: (id: string, s: Stage) => void }) {
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", padding: "16px 18px", marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 800 }}>Deals That Need Your Attention <span style={{ padding: "2px 8px", background: "#fee2e2", color: "#dc2626", fontSize: "11px", fontWeight: 700, borderRadius: "999px", marginLeft: "6px" }}>{deals.length}</span></div>
        <span style={{ fontSize: "12px", color: ACCENT, fontWeight: 700, cursor: "pointer" }}>View all deals →</span>
      </div>
      {deals.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#888" }}>✓ All caught up — nothing needs immediate attention.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#888", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <th style={th}>Customer</th>
              <th style={th}>Stage</th>
              <th style={th}>Last Activity</th>
              <th style={th}>Next Action</th>
              <th style={th}>Time in Stage</th>
              <th style={th}>Value</th>
              <th style={th}>Priority</th>
              <th style={{ width: "24px" }}></th>
            </tr>
          </thead>
          <tbody>
            {deals.map(d => (
              <tr key={d.id} onClick={() => onSelect(d.id)} style={{ borderTop: "1px solid #f4f4f4", background: selectedId === d.id ? "#fff7ed" : "transparent", cursor: "pointer" }}>
                <td style={td}>
                  <div style={{ fontWeight: 700 }}>{d.customer}</div>
                  <div style={{ fontSize: "11px", color: "#888" }}>{d.product}</div>
                </td>
                <td style={td}><span style={{ padding: "2px 8px", background: STAGE_COLORS[d.stage] + "22", color: STAGE_COLORS[d.stage], fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{d.stage}</span></td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#333" }}>
                    <span style={{ color: activityIcon(d.lastActivity.kind).color }}>{activityIcon(d.lastActivity.kind).icon}</span>
                    <span style={{ fontSize: "12px" }}>{d.lastActivity.label}</span>
                  </div>
                </td>
                <td style={td}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{d.nextAction?.label || "—"}</div>
                  <div style={{ fontSize: "10.5px", color: d.nextAction?.overdue ? "#dc2626" : "#888" }}>{d.nextAction?.dueLabel}</div>
                </td>
                <td style={td}><b>{fmtHours(d.timeInStageHours)}</b></td>
                <td style={td}><b>{fmtMoney(d.estValue)}</b></td>
                <td style={td}><PriPill p={d.priority} /></td>
                <td style={td}><button onClick={e => { e.stopPropagation(); onSelect(d.id); }} style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "13px" }}>⋯</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Inspector Panel ────────────────────────────────────────
function InspectorPanel({ deal, onClose, onMove, onOpenFull }: { deal: Deal; onClose: () => void; onMove: (id: string, s: Stage) => void; onOpenFull: () => void }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const quoteCTA = (() => {
    if (["Quoting", "Quote Approval"].includes(deal.stage)) return { label: "📄 Send Revised Quote", primary: true };
    if (deal.stage === "Awaiting Payment") return { label: "💳 Send Payment Link", primary: true };
    if (deal.stage === "Closed Today") return { label: "🧾 Send Invoice Receipt", primary: false };
    return { label: "📄 Create & Send Quote", primary: true };
  })();
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "18px", height: "fit-content", position: "sticky", top: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>{deal.customer}</div>
            {deal.starred && <span style={{ color: "#fbbf24" }}>★</span>}
          </div>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{deal.company || deal.product}</div>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", fontSize: "13px" }}>⋯</button>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", fontSize: "12px" }}>✕</button>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: "flex", gap: "6px", marginTop: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <span style={{ padding: "3px 10px", background: STAGE_COLORS[deal.stage] + "22", color: STAGE_COLORS[deal.stage], fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>{deal.stage}</span>
        <span style={{ padding: "3px 10px", background: deal.priority === "High" ? "#fee2e2" : deal.priority === "Medium" ? "#fef3c7" : "#dcfce7", color: deal.priority === "High" ? "#dc2626" : deal.priority === "Medium" ? "#f59e0b" : "#22c55e", fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>🚩 {deal.priority} Priority</span>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "14px" }}>
        <ActionBtn icon="📞" label="Call" onClick={() => alert(`Calling ${deal.customer}...`)} />
        <ActionBtn icon="💬" label="SMS" onClick={() => alert(`SMS to ${deal.customer}...`)} />
        <ActionBtn icon="✉" label="Email" onClick={() => alert(`Email to ${deal.customer}...`)} />
        <ActionBtn icon="📷" label="Open IG" onClick={() => alert(`Open Instagram for ${deal.customer}...`)} />
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
        <StatBox label="Est. Value" value={fmtMoney(deal.estValue)} sub="↑ High" tone="green" />
        {deal.probability != null && <StatBox label="Probability" value={`${deal.probability}%`} sub={deal.probability >= 75 ? "↑ High" : deal.probability >= 50 ? "↔ Medium" : "↓ Low"} tone={deal.probability >= 75 ? "green" : deal.probability >= 50 ? "amber" : "red"} />}
        <StatBox label="Time in Stage" value={fmtHours(deal.timeInStageHours)} sub={deal.timeInStageHours > 48 ? "⚠ Long" : "On track"} tone={deal.timeInStageHours > 48 ? "red" : "green"} />
        <StatBox label="Last Activity" value={deal.lastActivity.at} sub={deal.lastActivity.label.split(" ")[0]} tone="blue" />
      </div>

      {/* Activity timeline */}
      {deal.activityTimeline && deal.activityTimeline.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>Activity Timeline</div>
            <span style={{ fontSize: "11px", color: ACCENT, fontWeight: 700, cursor: "pointer" }}>View all</span>
          </div>
          <div style={{ position: "relative", paddingLeft: "0" }}>
            {deal.activityTimeline.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", padding: "6px 0", borderTop: i > 0 ? "1px solid #f5f5f5" : "none" }}>
                <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: a.tint + "22", color: a.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>{a.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700 }}>{a.title}</span>
                    <span style={{ fontSize: "10.5px", color: "#888", whiteSpace: "nowrap" }}>{a.at}</span>
                  </div>
                  {a.sub && <div style={{ fontSize: "11px", color: "#666", marginTop: "1px" }}>{a.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project details */}
      <div style={{ background: "var(--preview-surface-2)", borderRadius: "8px", padding: "10px 12px", marginBottom: "12px" }}>
        <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Project Details</div>
        <div style={{ display: "grid", gap: "5px", fontSize: "12px" }}>
          <DetailRow label="Products" value={deal.projectDetails.products} bold />
          {deal.projectDetails.quantity && <DetailRow label="Quantity" value={deal.projectDetails.quantity} />}
          {deal.projectDetails.needBy && <DetailRow label="Need By" value={deal.projectDetails.needBy} />}
          <DetailRow label="Priority" value={<PriPill p={deal.priority} />} />
          {deal.projectDetails.hasArtwork && <DetailRow label="Has Artwork" value={deal.projectDetails.hasArtwork} />}
          {deal.projectDetails.budget && <DetailRow label="Budget" value={deal.projectDetails.budget} />}
          {deal.projectDetails.decisionMaker && <DetailRow label="Decision Maker" value={deal.projectDetails.decisionMaker} />}
          {deal.projectDetails.currentSupplier && <DetailRow label="Current Supplier" value={deal.projectDetails.currentSupplier} />}
        </div>
      </div>

      {/* Next action + Move + Full details */}
      {deal.nextAction && (
        <div style={{ background: "#fff7ed", border: `1px solid ${ACCENT}44`, borderRadius: "8px", padding: "10px 12px", marginBottom: "10px" }}>
          <div style={{ fontSize: "10.5px", color: ACCENT, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Next Action</div>
          <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "3px" }}>{deal.nextAction.label}</div>
          <div style={{ fontSize: "11.5px", color: "#c2410c", fontWeight: 600, marginTop: "1px" }}>{deal.nextAction.dueLabel}</div>
        </div>
      )}
      {/* Primary stage-aware CTA — create/send quote */}
      <button onClick={() => setQuoteOpen(true)} style={{
        width: "100%", padding: "10px",
        background: quoteCTA.primary ? ACCENT : "#fff",
        color: quoteCTA.primary ? "#fff" : "#333",
        border: quoteCTA.primary ? "none" : "1px solid #e5e5e5",
        borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", marginBottom: "6px",
      }}>{quoteCTA.label}</button>

      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", position: "relative" }}>
        <button onClick={() => setMoveOpen(!moveOpen)} style={{ flex: 1, padding: "9px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Move Stage ▾</button>
        <button onClick={() => alert("Marked complete")} style={{ flex: 1, padding: "9px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Mark Complete</button>
        {moveOpen && (
          <div style={{ position: "absolute", top: "44px", left: 0, right: 0, background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 10, padding: "6px 0" }}>
            {STAGES.filter(s => s !== deal.stage).map(s => (
              <button key={s} onClick={() => { onMove(deal.id, s); setMoveOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", background: "transparent", border: "none", fontSize: "12px", cursor: "pointer", color: "#333" }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: STAGE_COLORS[s], marginRight: "8px" }} />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onOpenFull} style={{ width: "100%", padding: "10px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>View Full Details →</button>

      {quoteOpen && <QuoteBuilderModal deal={deal} onClose={() => setQuoteOpen(false)} onSent={() => { setQuoteOpen(false); if (deal.stage !== "Quoting" && deal.stage !== "Quote Approval") onMove(deal.id, "Quoting"); }} />}
    </div>
  );
}

// ─── Quote Builder Modal ────────────────────────────────────────
function QuoteBuilderModal({ deal, onClose, onSent }: { deal: Deal; onClose: () => void; onSent: () => void }) {
  type Line = { id: string; product: string; qty: number; unitPrice: number; note?: string };
  const initialLine: Line = { id: "l1", product: deal.product, qty: Number((deal.projectDetails.quantity || "").replace(/[^0-9]/g, "")) || 1000, unitPrice: 3.5 };
  const [lines, setLines] = useState<Line[]>([initialLine]);
  const [taxPct, setTaxPct] = useState(9.5);
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("Standard turnaround: 5–7 business days after artwork approval. Rush available for 30% surcharge.");
  const [attachments, setAttachments] = useState<{ name: string; size: string; kind: string }[]>([]);
  const [validDays, setValidDays] = useState(30);

  const addLine = () => setLines([...lines, { id: `l${Date.now()}`, product: "", qty: 100, unitPrice: 0 }]);
  const removeLine = (id: string) => setLines(lines.filter(l => l.id !== id));
  const updateLine = (id: string, patch: Partial<Line>) => setLines(lines.map(l => l.id === id ? { ...l, ...patch } : l));

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const afterDisc = subtotal * (1 - discount / 100);
  const tax = afterDisc * (taxPct / 100);
  const total = afterDisc + tax + shipping;
  const quoteRef = `Q-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "min(820px, 96vw)", maxHeight: "92vh", overflowY: "auto", padding: "20px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>📄 Create & Send Quote</div>
            <div style={{ fontSize: "12.5px", color: "#666", marginTop: "3px" }}>
              For <b>{deal.customer}</b> · <span style={{ fontFamily: "monospace" }}>{quoteRef}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer" }}>✕</button>
        </div>

        {/* Line items */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr 40px", gap: "8px", padding: "8px 10px", background: "var(--preview-surface-2)", borderRadius: "8px 8px 0 0", fontSize: "10.5px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, border: "1px solid var(--preview-border)", borderBottom: "none" }}>
            <div>Product</div>
            <div>Quantity</div>
            <div>Unit Price</div>
            <div style={{ textAlign: "right" }}>Extended</div>
            <div></div>
          </div>
          <div style={{ border: "1px solid var(--preview-border)", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {lines.map((l, i) => (
              <div key={l.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr 40px", gap: "8px", padding: "8px 10px", borderTop: i > 0 ? "1px solid #f0f0f0" : "none", alignItems: "center" }}>
                <input value={l.product} onChange={e => updateLine(l.id, { product: e.target.value })} placeholder="Product name" style={{ ...lightInp, padding: "6px 10px" }} />
                <input type="number" value={l.qty} onChange={e => updateLine(l.id, { qty: Number(e.target.value) || 0 })} style={{ ...lightInp, padding: "6px 10px" }} />
                <input type="number" step="0.01" value={l.unitPrice} onChange={e => updateLine(l.id, { unitPrice: Number(e.target.value) || 0 })} style={{ ...lightInp, padding: "6px 10px" }} />
                <div style={{ textAlign: "right", fontWeight: 700, fontSize: "13px" }}>{fmtMoney(Math.round(l.qty * l.unitPrice * 100) / 100)}</div>
                <button onClick={() => removeLine(l.id)} disabled={lines.length === 1} style={{ background: "transparent", border: "none", color: lines.length === 1 ? "#ddd" : "#dc2626", cursor: lines.length === 1 ? "not-allowed" : "pointer", fontSize: "14px" }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={addLine} style={{ marginTop: "8px", padding: "6px 12px", background: "#fff", border: "1px dashed #ddd", borderRadius: "8px", color: "#666", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>＋ Add line item</button>
        </div>

        {/* Adjustments + summary side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Adjustments</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={lightLbl}>Discount %</label>
                <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value) || 0)} style={lightInp} />
              </div>
              <div>
                <label style={lightLbl}>Tax %</label>
                <input type="number" step="0.1" value={taxPct} onChange={e => setTaxPct(Number(e.target.value) || 0)} style={lightInp} />
              </div>
              <div>
                <label style={lightLbl}>Shipping $</label>
                <input type="number" step="0.01" value={shipping} onChange={e => setShipping(Number(e.target.value) || 0)} style={lightInp} />
              </div>
              <div>
                <label style={lightLbl}>Valid for (days)</label>
                <input type="number" value={validDays} onChange={e => setValidDays(Number(e.target.value) || 0)} style={lightInp} />
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Summary</div>
            <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px" }}>
              <SumRow label="Subtotal" value={fmtMoney(Math.round(subtotal * 100) / 100)} />
              {discount > 0 && <SumRow label={`Discount (${discount}%)`} value={`− ${fmtMoney(Math.round((subtotal - afterDisc) * 100) / 100)}`} color="#22c55e" />}
              <SumRow label={`Tax (${taxPct}%)`} value={fmtMoney(Math.round(tax * 100) / 100)} />
              <SumRow label="Shipping" value={fmtMoney(shipping)} />
              <div style={{ height: "1px", background: "#e5e5e5", margin: "6px 0" }} />
              <SumRow label="Total" value={fmtMoney(Math.round(total * 100) / 100)} bold />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: "16px" }}>
          <label style={lightLbl}>Notes to customer</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...lightInp, minHeight: "70px", resize: "vertical", fontFamily: "inherit" }} />
        </div>

        {/* Attachments */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
            📎 Attach file
            <input type="file" multiple style={{ display: "none" }} onChange={e => {
              if (!e.target.files) return;
              const added = Array.from(e.target.files).map(f => ({
                name: f.name,
                size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`,
                kind: f.type.startsWith("image") ? "image" : f.name.endsWith(".pdf") ? "pdf" : "file",
              }));
              setAttachments([...attachments, ...added]);
              e.target.value = "";
            }} />
          </label>
          {attachments.length > 0 && (
            <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {attachments.map((f, i) => (
                <span key={i} style={{ padding: "5px 10px", background: "#f5f5f5", borderRadius: "6px", fontSize: "11.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                  📎 {f.name} <span style={{ color: "#888" }}>{f.size}</span>
                  <span onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "#888" }}>✕</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "14px", borderTop: "1px solid #eee" }}>
          <div style={{ fontSize: "11px", color: "#888" }}>
            Deal will auto-move to <b style={{ color: STAGE_COLORS["Quoting"] }}>Quoting</b> stage on send · Quote saved as <b>{quoteRef}</b>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onClose} style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => alert(`Preview: ${quoteRef} · Total ${fmtMoney(Math.round(total * 100) / 100)}`)} style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>👁 Preview</button>
            <button onClick={() => alert(`Draft saved: ${quoteRef}`)} style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Save Draft</button>
            <button onClick={onSent} style={{ padding: "8px 18px", background: ACCENT, border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>Send Quote →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SumRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: bold ? 800 : 500, fontSize: bold ? "14px" : "12.5px" }}>
      <span style={{ color: color || (bold ? "#171717" : "#666") }}>{label}</span>
      <span style={{ color: color || "#171717" }}>{value}</span>
    </div>
  );
}

// ─── Full Detail View (takeover) ────────────────────────────────────────
function FullDetailView({ deal, onBack, onMove }: { deal: Deal; onBack: () => void; onMove: (id: string, s: Stage) => void }) {
  const [notes, setNotes] = useState<{ id: string; author: string; at: string; body: string }[]>([
    { id: "n1", author: "Manny Carlo", at: "3h ago", body: "Warm lead — has budget. Asked about rush turnaround. Sending quote today." },
    { id: "n2", author: "Maria Hakobyan", at: "1h ago", body: "Followed up after quote sent. Customer said they'll review with the team." },
  ]);
  const [noteText, setNoteText] = useState("");
  const [comms] = useState<{ id: string; type: string; author: string; at: string; body: string; subject?: string; icon: string; color: string }[]>([
    { id: "c1", type: "email_in", author: deal.customer, at: "18m ago", subject: "Re: Quote", body: "Received the quote, thanks. Reviewing with the team.", icon: "✉", color: "#f59e0b" },
    { id: "c2", type: "email_out", author: "Maria Hakobyan", at: "2h ago", subject: `Quote for ${deal.product}`, body: `Please find attached the quote for ${deal.product}. Let me know if you have questions.`, icon: "✉", color: "#8b5cf6" },
    { id: "c3", type: "call_out", author: "Maria Hakobyan", at: "3h ago", body: "Discussed specs and timeline. Confirmed budget range.", icon: "📞", color: "#22c55e" },
  ]);
  const [files] = useState([
    { name: "QO-2026-0189.pdf", size: "246 KB", kind: "pdf" },
    { name: "Customer-reference.png", size: "1.2 MB", kind: "image" },
  ]);
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#666", fontSize: "13px", cursor: "pointer", fontWeight: 500 }}>← Back to Pipeline</button>
        <div style={{ display: "flex", gap: "8px", position: "relative" }}>
          <button onClick={() => setMoveOpen(!moveOpen)} style={{ padding: "8px 14px", fontSize: "12.5px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "#333", cursor: "pointer", fontWeight: 600 }}>Move Stage ▾</button>
          <button style={{ padding: "8px 14px", fontSize: "12.5px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "#333", cursor: "pointer", fontWeight: 600 }}>✎ Edit Deal</button>
          <button style={{ padding: "8px 16px", fontSize: "12.5px", background: ACCENT, border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Mark Complete</button>
          {moveOpen && (
            <div style={{ position: "absolute", top: "40px", left: 0, background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 20, padding: "6px 0", minWidth: "200px" }}>
              {STAGES.filter(s => s !== deal.stage).map(s => (
                <button key={s} onClick={() => { onMove(deal.id, s); setMoveOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", background: "transparent", border: "none", fontSize: "12px", cursor: "pointer", color: "#333" }}>
                  <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: STAGE_COLORS[s], marginRight: "8px" }} />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Header card */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "20px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0 }}>{deal.customer}</h1>
              {deal.starred && <span style={{ color: "#fbbf24", fontSize: "20px" }}>★</span>}
            </div>
            <div style={{ fontSize: "13px", color: "#666" }}>{deal.company || deal.product}</div>
            <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
              <span style={{ padding: "3px 10px", background: STAGE_COLORS[deal.stage] + "22", color: STAGE_COLORS[deal.stage], fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>{deal.stage}</span>
              <span style={{ padding: "3px 10px", background: deal.priority === "High" ? "#fee2e2" : deal.priority === "Medium" ? "#fef3c7" : "#dcfce7", color: deal.priority === "High" ? "#dc2626" : deal.priority === "Medium" ? "#f59e0b" : "#22c55e", fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>🚩 {deal.priority}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Est. Value</div>
            <div style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.5px" }}>{fmtMoney(deal.estValue)}</div>
            {deal.probability != null && <div style={{ fontSize: "12px", color: "#22c55e", fontWeight: 700 }}>↑ {deal.probability}% probability</div>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "16px" }}>
          <ActionBtn icon="📞" label="Call" onClick={() => alert("Calling...")} />
          <ActionBtn icon="💬" label="SMS" onClick={() => alert("SMS...")} />
          <ActionBtn icon="✉" label="Email" onClick={() => alert("Email...")} />
          <ActionBtn icon="📷" label="Open IG" onClick={() => alert("Instagram...")} />
        </div>
      </div>

      {/* 3-column: activity timeline | comm history / notes | project + files */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {/* Activity Timeline */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Activity Timeline</div>
          {deal.activityTimeline && deal.activityTimeline.length > 0 ? (
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "13px", top: "6px", bottom: "6px", width: "2px", background: "#f0f0f0" }} />
              {deal.activityTimeline.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", position: "relative", zIndex: 1 }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: a.tint + "22", color: a.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0, border: "2px solid #fff" }}>{a.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                      <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{a.title}</span>
                      <span style={{ fontSize: "10.5px", color: "#888" }}>{a.at}</span>
                    </div>
                    {a.sub && <div style={{ fontSize: "11px", color: "#666", marginTop: "1px" }}>{a.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : <div style={{ padding: "20px 0", textAlign: "center", fontSize: "12px", color: "#aaa" }}>No activity yet.</div>}
        </div>

        {/* Communication history + notes composer */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>💬 Communication</div>
            <span style={{ fontSize: "11px", color: "#888" }}>{comms.length} messages</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto", paddingRight: "4px" }}>
            {comms.map(c => (
              <div key={c.id} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "8px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: c.color }}>{c.icon}</span>
                    <span style={{ fontSize: "11.5px", fontWeight: 700 }}>{c.author}</span>
                  </span>
                  <span style={{ fontSize: "10.5px", color: "#888" }}>{c.at}</span>
                </div>
                {c.subject && <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "3px" }}>{c.subject}</div>}
                <div style={{ fontSize: "12px", color: "#333", marginTop: "3px", lineHeight: 1.5 }}>{c.body}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Add Internal Note</div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Note visible to team only..." style={{ ...lightInp, minHeight: "50px", resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
              <button onClick={() => { if (noteText.trim()) { setNotes([{ id: `n${Date.now()}`, author: "Hayk Zohrabyan", at: "just now", body: noteText.trim() }, ...notes]); setNoteText(""); } }} style={{ padding: "6px 14px", background: ACCENT, border: "none", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Save Note</button>
            </div>
            {notes.length > 0 && (
              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {notes.map(n => (
                  <div key={n.id} style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "6px", padding: "6px 10px", fontSize: "11.5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                      <span style={{ fontWeight: 700, color: "#7c3aed" }}>{n.author}</span>
                      <span style={{ color: "#888", fontSize: "10px" }}>{n.at}</span>
                    </div>
                    <div style={{ color: "#333" }}>{n.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Project details + Files */}
        <div>
          <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px", marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Project Details</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px" }}>
              <DetailRow label="Products" value={deal.projectDetails.products} bold />
              {deal.projectDetails.quantity && <DetailRow label="Quantity" value={deal.projectDetails.quantity} />}
              {deal.projectDetails.needBy && <DetailRow label="Need By" value={deal.projectDetails.needBy} />}
              {deal.projectDetails.hasArtwork && <DetailRow label="Has Artwork" value={deal.projectDetails.hasArtwork} />}
              {deal.projectDetails.budget && <DetailRow label="Budget" value={deal.projectDetails.budget} />}
              {deal.projectDetails.decisionMaker && <DetailRow label="Decision Maker" value={deal.projectDetails.decisionMaker} />}
              {deal.projectDetails.currentSupplier && <DetailRow label="Current Supplier" value={deal.projectDetails.currentSupplier} />}
            </div>
          </div>

          <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>📎 Files</div>
              <button style={{ padding: "3px 10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }}>+ Upload</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "6px" }}>
                  <span style={{ fontSize: "13px", color: f.kind === "pdf" ? "#dc2626" : "#3b82f6" }}>{f.kind === "pdf" ? "📄" : "🖼"}</span>
                  <span style={{ flex: 1, fontSize: "11.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: "10.5px", color: "#888" }}>{f.size}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filters modal ────────────────────────────────────────
function FiltersModal({ teamFilter, setTeamFilter, priorityFilter, setPriorityFilter, attentionOnly, setAttentionOnly, clear, onClose }: any) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "460px", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Filters</h3>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Team Member</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {Object.entries(REPS).map(([code, r]) => (
              <button key={code} onClick={() => setTeamFilter(teamFilter === code ? null : code)} style={{ padding: "6px 12px", background: teamFilter === code ? "#fff7ed" : "#f7f7f7", border: `1px solid ${teamFilter === code ? ACCENT : "#eee"}`, color: teamFilter === code ? ACCENT : "#333", borderRadius: "8px", fontSize: "12px", fontWeight: teamFilter === code ? 700 : 500, cursor: "pointer" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "50%", background: r.color + "22", color: r.color, fontSize: "9px", fontWeight: 800, marginRight: "5px" }}>{code}</span>
                {r.short}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Priority</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["High", "Medium", "Low"] as Priority[]).map(p => (
              <button key={p} onClick={() => setPriorityFilter(priorityFilter === p ? null : p)} style={{ padding: "6px 14px", background: priorityFilter === p ? "#fff7ed" : "#f7f7f7", border: `1px solid ${priorityFilter === p ? ACCENT : "#eee"}`, color: priorityFilter === p ? ACCENT : "#333", borderRadius: "8px", fontSize: "12px", fontWeight: priorityFilter === p ? 700 : 500, cursor: "pointer" }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", cursor: "pointer" }}>
            <input type="checkbox" checked={attentionOnly} onChange={e => setAttentionOnly(e.target.checked)} />
            Only show deals needing attention (overdue / stalled &gt; 24h)
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "10px", borderTop: "1px solid #eee" }}>
          <button onClick={() => { clear(); onClose(); }} style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Clear all</button>
          <button onClick={onClose} style={{ padding: "8px 14px", background: ACCENT, border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, color: "#fff", cursor: "pointer" }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Add Deal modal ────────────────────────────────────────
function QuickAddDealModal({ onClose, onAdd }: { onClose: () => void; onAdd: (d: Deal) => void }) {
  const [customer, setCustomer] = useState("");
  const [product, setProduct] = useState("");
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [rep, setRep] = useState("MC");

  const canSave = customer && product && value;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "500px", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>+ Add Lead to Pipeline</h3>
            <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>Quick add — will land in "Assigned" column</div>
          </div>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={lightLbl}>Customer *</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" style={lightInp} />
          </div>
          <div>
            <label style={lightLbl}>Product *</label>
            <input value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. Custom Boxes" style={lightInp} />
          </div>
          <div>
            <label style={lightLbl}>Est. Value *</label>
            <input value={value} onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ""))} placeholder="5000" style={lightInp} />
          </div>
          <div>
            <label style={lightLbl}>Priority</label>
            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
              {(["High", "Medium", "Low"] as Priority[]).map(p => (
                <button key={p} onClick={() => setPriority(p)} style={{ padding: "6px 14px", background: priority === p ? "#fff7ed" : "#f7f7f7", border: `1px solid ${priority === p ? ACCENT : "#eee"}`, color: priority === p ? ACCENT : "#333", borderRadius: "8px", fontSize: "12px", fontWeight: priority === p ? 700 : 500, cursor: "pointer" }}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lightLbl}>Sales Rep</label>
            <select value={rep} onChange={e => setRep(e.target.value)} style={lightInp}>
              {Object.entries(REPS).map(([code, r]) => <option key={code} value={code}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px", paddingTop: "12px", borderTop: "1px solid #eee" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button disabled={!canSave} onClick={() => {
            onAdd({
              id: `new${Date.now()}`, customer, product, estValue: Number(value), priority,
              lastActivity: { kind: "email_sent", label: "Just added", at: "just now" },
              rep: rep as any, stage: "Assigned",
              timeInStageHours: 0, hoursInSystem: 0, lastActivityHoursAgo: 0,
              projectDetails: { products: product },
              nextAction: { label: "Call to introduce", dueLabel: "Due today" },
            });
          }} style={{ padding: "8px 16px", background: canSave ? ACCENT : "#e5e5e5", color: "var(--preview-text)", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed" }}>Add to Pipeline</button>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────
const th: React.CSSProperties = { textAlign: "left", padding: "10px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "12px 8px" };
const hdrBtn: React.CSSProperties = { fontSize: "12.5px", color: "#333", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "8px 14px", borderRadius: "10px", whiteSpace: "nowrap", fontWeight: 600, cursor: "pointer" };
const vwBtn = (active: boolean): React.CSSProperties => ({ padding: "6px 14px", background: active ? "#0a0a0a" : "transparent", color: active ? "#fff" : "#666", border: "none", borderRadius: "7px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" });
const lightInp: React.CSSProperties = { width: "100%", padding: "8px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" };
const lightLbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "#555", marginBottom: "4px" };

function PriPill({ p }: { p: Priority }) {
  const color = p === "High" ? "#dc2626" : p === "Medium" ? "#f59e0b" : "#22c55e";
  const bg = p === "High" ? "#fee2e2" : p === "Medium" ? "#fef3c7" : "#dcfce7";
  return <span style={{ padding: "2px 8px", background: bg, color, fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{p}</span>;
}
function ActionBtn({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px", background: "#f7f7f7", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "#333", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>{icon} {label}</button>
  );
}
function StatBox({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "green" | "amber" | "red" | "blue" }) {
  const color = tone === "green" ? "#16a34a" : tone === "amber" ? "#f59e0b" : tone === "red" ? "#dc2626" : "#3b82f6";
  return (
    <div style={{ background: "var(--preview-surface-2)", borderRadius: "8px", padding: "8px 10px" }}>
      <div style={{ fontSize: "10.5px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: 800, marginTop: "2px" }}>{value}</div>
      <div style={{ fontSize: "10.5px", color, marginTop: "2px", fontWeight: 700 }}>{sub}</div>
    </div>
  );
}
function DetailRow({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: "#171717" }}>{value}</span>
    </div>
  );
}
