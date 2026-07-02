"use client";

// Hayk 2026-07-01 — Interactive VersionA (ChatGPT copy variant).
// All top-bar buttons wired: date range, customize, notifications, AI panel, user menu.
// Search bar removed per Hayk request.
// KPI numbers made clickable — each links to its filtered list view.

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
// Hover styling for KPI links lives in a <style> tag inside the render tree
// (see .kpi-link CSS below) — Next Link is used as the wrapper.

const ACCENT = "#FF5D2E";

// ─── Inline popover styles (forced solid background so KPI content behind
// dropdowns can't bleed through — CSS class version was losing to Tailwind
// resets in the preview shell). Do NOT convert these back to className.
const POPOVER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  background: "var(--preview-surface)",
  border: "1px solid var(--preview-border)",
  borderRadius: "12px",
  boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
  zIndex: 1000,
  padding: "6px",
  minWidth: "220px",
  color: "var(--preview-text)",
};

const POPOVER_ITEM_STYLE: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  fontSize: "13px",
  cursor: "pointer",
  color: "var(--preview-text)",
  textDecoration: "none",
  display: "block",
  transition: "background 120ms ease",
};

// ─── Types ────────────────────────────────────────────────────
type DateRangeKey = "today" | "7d" | "30d" | "90d" | "custom";
type DateRangeState = { key: DateRangeKey; from?: string; to?: string };

type WidgetKey =
  | "moneyPosition"
  | "outstandingBreakdown"
  | "pipelineValue"
  | "activeJobs"
  | "totalLeads"
  | "conversionRate"
  | "alertsActions"
  | "pipelineFunnel"
  | "teamPerformance"
  | "quickActions";

type Notification = { id: string; text: string; ts: string };

const DEFAULT_WIDGETS: Record<WidgetKey, boolean> = {
  moneyPosition: true,
  outstandingBreakdown: true,
  pipelineValue: true,
  activeJobs: true,
  totalLeads: true,
  conversionRate: true,
  alertsActions: true,
  pipelineFunnel: true,
  teamPerformance: true,
  quickActions: true,
};

const WIDGET_LABELS: Record<WidgetKey, string> = {
  moneyPosition: "Money Position",
  outstandingBreakdown: "Outstanding Order Breakdown",
  pipelineValue: "Pipeline Value",
  activeJobs: "Active Jobs",
  totalLeads: "Total Leads",
  conversionRate: "Conversion Rate",
  alertsActions: "Alerts & Actions",
  pipelineFunnel: "Pipeline Funnel",
  teamPerformance: "Team Performance",
  quickActions: "Quick Actions",
};

const DEFAULT_NOTIFS: Notification[] = [
  { id: "n1", text: "Lead Sarah Chen requires response", ts: "2m ago" },
  { id: "n2", text: "Quote #Q-4821 past due (48h)", ts: "14m ago" },
  { id: "n3", text: "Payment received from Northside Café — $2,480", ts: "38m ago" },
  { id: "n4", text: "Rush order #O-9124 in production", ts: "1h ago" },
  { id: "n5", text: "New lead from website: Vahan Petrosyan", ts: "2h ago" },
  { id: "n6", text: "Quote #Q-4815 approved by customer", ts: "3h ago" },
  { id: "n7", text: "Follow-up due: Green Leaf Dispensary", ts: "4h ago" },
  { id: "n8", text: "Shipping label printed for #O-9110", ts: "5h ago" },
  { id: "n9", text: "Lead David Kim requires response", ts: "6h ago" },
  { id: "n10", text: "Design proof ready for #O-9098", ts: "yesterday" },
  { id: "n11", text: "Payment received from Bloom Studio — $6,120", ts: "yesterday" },
  { id: "n12", text: "Rush order #O-9081 shipped", ts: "yesterday" },
];

const AI_SUGGESTIONS = [
  "Show me this week's revenue trend",
  "Which leads need my attention?",
  "Draft a follow-up email for X customer",
  "Summarize open quotes",
];

// ─── Helpers ─────────────────────────────────────────────────
function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function rangeLabel(r: DateRangeState): string {
  switch (r.key) {
    case "today": return "Today";
    case "7d": return "Last 7 days";
    case "30d": return "Last 30 days";
    case "90d": return "Last 90 days";
    case "custom":
      if (r.from && r.to) return `${formatDateShort(r.from)} – ${formatDateShort(r.to)}`;
      return "Custom range…";
    default: return "Last 30 days";
  }
}

// ─── Click-outside hook ──────────────────────────────────────
function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

// ─── Main interactive VersionA ───────────────────────────────
// Viewport hook — KPI grid switches column counts responsively.
// ≥1400px  → 6 across (single row, the approved reference layout)
// 1100-1399 → 3 across (2 rows of 3, fallback for narrower desktop)
// 700-1099  → 2 across (3 rows of 2)
// <700     → 1 column (mobile)
function useKpiColumns(): string {
  const [cols, setCols] = useState("repeat(6, 1fr)");
  useEffect(() => {
    function compute() {
      const w = window.innerWidth;
      if (w < 700) setCols("repeat(1, 1fr)");
      else if (w < 1100) setCols("repeat(2, 1fr)");
      else if (w < 1400) setCols("repeat(3, 1fr)");
      else setCols("repeat(6, 1fr)");
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return cols;
}

export default function VersionAClient() {
  // ---- Date range ----
  const [dateRange, setDateRange] = useState<DateRangeState>({ key: "30d" });
  const [dateOpen, setDateOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustomInputs, setShowCustomInputs] = useState(false);

  // ---- Widgets ----
  const [widgets, setWidgets] = useState<Record<WidgetKey, boolean>>(DEFAULT_WIDGETS);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // ---- Notifications ----
  const [notifications, setNotifications] = useState<Notification[]>(DEFAULT_NOTIFS);
  const [notifOpen, setNotifOpen] = useState(false);

  // ---- AI panel ----
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Hi Hayk — I'm your AI Assistant. Ask me anything about your business, or pick a suggestion below." },
  ]);
  const [aiInput, setAiInput] = useState("");

  // ---- User menu ----
  const [userOpen, setUserOpen] = useState(false);

  // ---- Persist to localStorage ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bazaar.dashboardDateRange");
      if (raw) setDateRange(JSON.parse(raw));
      const rawW = localStorage.getItem("bazaar.dashboardWidgets");
      if (rawW) setWidgets({ ...DEFAULT_WIDGETS, ...JSON.parse(rawW) });
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("bazaar.dashboardDateRange", JSON.stringify(dateRange)); } catch {}
  }, [dateRange]);
  useEffect(() => {
    try { localStorage.setItem("bazaar.dashboardWidgets", JSON.stringify(widgets)); } catch {}
  }, [widgets]);

  // ---- Refs for click-outside ----
  const dateRef = useClickOutside<HTMLDivElement>(dateOpen, () => { setDateOpen(false); setShowCustomInputs(false); });
  const customizeRef = useClickOutside<HTMLDivElement>(customizeOpen, () => setCustomizeOpen(false));
  const notifRef = useClickOutside<HTMLDivElement>(notifOpen, () => setNotifOpen(false));
  const userRef = useClickOutside<HTMLDivElement>(userOpen, () => setUserOpen(false));

  const badgeCount = notifications.length;

  function dismissNotif(id: string) {
    setNotifications(n => n.filter(x => x.id !== id));
  }
  function markAllRead() { setNotifications([]); }

  function sendAi(text: string) {
    const q = text.trim();
    if (!q) return;
    setAiMessages(m => [...m, { role: "user", text: q }, { role: "ai", text: "I'd need real data access to answer that. This is a preview." }]);
    setAiInput("");
  }

  function signOut() {
    // Best-effort: hit session endpoint if present, otherwise route to /login.
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {}).finally(() => {
      window.location.href = "/login";
    });
  }

  function applyCustomRange() {
    if (customFrom && customTo) {
      setDateRange({ key: "custom", from: customFrom, to: customTo });
      setDateOpen(false);
      setShowCustomInputs(false);
    }
  }

  return (
    <div className="text-foreground" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .kpi-link { color: inherit; text-decoration: none; cursor: pointer; transition: filter 120ms ease; }
        .kpi-link:hover { filter: brightness(1.1); }
        .kpi-link-block { display: block; }
        .kpi-sub-row { color: inherit; text-decoration: none; cursor: pointer; transition: background 120ms ease; }
        .kpi-sub-row:hover { background: var(--preview-chip-bg); }
        .alert-row { color: inherit; text-decoration: none; padding: 9px 6px; border-top: 1px solid var(--preview-border); display: flex; align-items: center; gap: 10px; cursor: pointer; border-radius: 6px; transition: background 120ms ease, filter 120ms ease; }
        .alert-row:hover { background: var(--preview-surface-2); filter: brightness(1.05); }
        .alert-row-footer { color: inherit; text-decoration: none; margin-top: 8px; padding: 8px 6px 4px; border-top: 1px solid var(--preview-border); display: flex; justify-content: space-between; cursor: pointer; border-radius: 6px; transition: background 120ms ease; }
        .alert-row-footer:hover { background: var(--preview-surface-2); }
        .risk-callout { color: inherit; text-decoration: none; display: block; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; transition: filter 120ms ease; cursor: pointer; }
        .risk-callout:hover { filter: brightness(1.05); }
        .dropdown-item-hover:hover { background: var(--preview-chip-bg) !important; }
      `}</style>

      {/* ─── TOP BAR ────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", gap: "16px" }}>
        <div className="text-foreground" style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.5px" }}>Good morning, Hayk! 👋</h1>
          <div className="text-muted-foreground" style={{ fontSize: "13px", marginTop: "2px" }}>Here's what's happening with your business.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>

          {/* Date range */}
          <div ref={dateRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDateOpen(v => !v)}
              style={{ fontSize: "12px", color: "var(--preview-text)", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", cursor: "pointer" }}
            >
              📅 {rangeLabel(dateRange)} ▾
            </button>
            {dateOpen && (
              <div style={POPOVER_STYLE}>
                {([
                  ["today", "Today"],
                  ["7d", "Last 7 days"],
                  ["30d", "Last 30 days"],
                  ["90d", "Last 90 days"],
                ] as [DateRangeKey, string][]).map(([k, l]) => (
                  <div
                    key={k}
                    onClick={() => { setDateRange({ key: k }); setDateOpen(false); setShowCustomInputs(false); }}
                    className="dropdown-item-hover"
                    style={{ ...POPOVER_ITEM_STYLE, background: dateRange.key === k ? "var(--preview-surface-2)" : "transparent" }}
                  >{l}</div>
                ))}
                <div
                  onClick={() => setShowCustomInputs(v => !v)}
                  className="dropdown-item-hover"
                  style={{ ...POPOVER_ITEM_STYLE, background: dateRange.key === "custom" ? "var(--preview-surface-2)" : "transparent", borderTop: "1px solid var(--preview-border)", marginTop: "4px", borderRadius: 0 }}
                >Custom range…</div>
                {showCustomInputs && (
                  <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid var(--preview-border)", marginTop: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>From
                      <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: "100%", marginTop: "2px", padding: "5px 8px", border: "1px solid var(--preview-border)", borderRadius: "6px", background: "var(--preview-surface-2)", color: "var(--preview-text)", fontSize: "12px" }} />
                    </label>
                    <label style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>To
                      <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: "100%", marginTop: "2px", padding: "5px 8px", border: "1px solid var(--preview-border)", borderRadius: "6px", background: "var(--preview-surface-2)", color: "var(--preview-text)", fontSize: "12px" }} />
                    </label>
                    <button onClick={applyCustomRange} disabled={!customFrom || !customTo} style={{ marginTop: "4px", padding: "6px 10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: customFrom && customTo ? "pointer" : "not-allowed", opacity: customFrom && customTo ? 1 : 0.5 }}>Apply</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Customize */}
          <div ref={customizeRef} style={{ position: "relative" }}>
            <button
              onClick={() => setCustomizeOpen(v => !v)}
              style={{ fontSize: "12px", color: "#fff", background: "#0a0a0a", padding: "6px 12px", borderRadius: "8px", fontWeight: 500, whiteSpace: "nowrap", border: "none", cursor: "pointer" }}
            >⚙ Customize</button>
            {customizeOpen && (
              <div style={{ ...POPOVER_STYLE, minWidth: "260px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 14px 8px" }}>Show widgets</div>
                {(Object.keys(WIDGET_LABELS) as WidgetKey[]).map(k => (
                  <label key={k} className="dropdown-item-hover" style={{ ...POPOVER_ITEM_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>{WIDGET_LABELS[k]}</span>
                    <input type="checkbox" checked={widgets[k]} onChange={e => setWidgets(w => ({ ...w, [k]: e.target.checked }))} />
                  </label>
                ))}
                <div style={{ borderTop: "1px solid var(--preview-border)", marginTop: "6px", paddingTop: "6px", display: "flex", justifyContent: "space-between" }}>
                  <button onClick={() => setWidgets(DEFAULT_WIDGETS)} style={{ background: "transparent", border: "none", color: ACCENT, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Reset</button>
                  <button onClick={() => setCustomizeOpen(false)} style={{ background: "transparent", border: "none", color: "var(--preview-text-muted)", fontSize: "12px", cursor: "pointer" }}>Done</button>
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div ref={notifRef} style={{ position: "relative" }}>
            <button
              onClick={() => setNotifOpen(v => !v)}
              style={{ position: "relative", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px" }}
              aria-label="Notifications"
            >
              <span style={{ fontSize: "18px" }}>🔔</span>
              {badgeCount > 0 && (
                <span style={{ position: "absolute", top: "-4px", right: "-6px", background: "#dc2626", color: "#fff", fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "999px" }}>{badgeCount}</span>
              )}
            </button>
            {notifOpen && (
              <div style={{ ...POPOVER_STYLE, width: "340px", maxHeight: "440px", padding: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--preview-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700 }}>Notifications</span>
                  <span style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>{badgeCount} unread</span>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {notifications.length === 0 && (
                    <div style={{ padding: "24px", textAlign: "center", fontSize: "12px", color: "var(--preview-text-muted)" }}>You're all caught up.</div>
                  )}
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => dismissNotif(n.id)}
                      style={{ padding: "10px 12px", borderBottom: "1px solid var(--preview-border)", cursor: "pointer", fontSize: "12px", display: "flex", flexDirection: "column", gap: "3px" }}
                    >
                      <span style={{ color: "var(--preview-text)" }}>{n.text}</span>
                      <span style={{ fontSize: "10px", color: "var(--preview-text-muted)" }}>{n.ts} · click to dismiss</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "8px 12px", borderTop: "1px solid var(--preview-border)", display: "flex", justifyContent: "space-between" }}>
                  <button onClick={markAllRead} style={{ background: "transparent", border: "none", color: ACCENT, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Mark all as read</button>
                  <button onClick={() => setNotifOpen(false)} style={{ background: "transparent", border: "none", color: "var(--preview-text-muted)", fontSize: "12px", cursor: "pointer" }}>Close</button>
                </div>
              </div>
            )}
          </div>

          {/* AI button */}
          <button
            onClick={() => setAiOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "linear-gradient(90deg,#a78bfa,#f472b6)", color: "#fff", padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", border: "none", cursor: "pointer" }}
          >✨ AI</button>

          {/* User avatar menu */}
          <div ref={userRef} style={{ position: "relative" }}>
            <button
              onClick={() => setUserOpen(v => !v)}
              style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e5e5e5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", border: "none", cursor: "pointer" }}
            >H</button>
            {userOpen && (
              <div style={POPOVER_STYLE}>
                <a href="/profile" className="dropdown-item-hover" style={POPOVER_ITEM_STYLE}>Profile</a>
                <a href="/settings" className="dropdown-item-hover" style={POPOVER_ITEM_STYLE}>Settings</a>
                <a href="/team" className="dropdown-item-hover" style={POPOVER_ITEM_STYLE}>Team members</a>
                <div style={{ height: "1px", background: "var(--preview-border)", margin: "4px 0" }} />
                <button onClick={signOut} className="dropdown-item-hover" style={{ ...POPOVER_ITEM_STYLE, width: "100%", textAlign: "left", color: "#dc2626", background: "transparent", border: "none" }}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── AI SLIDE-IN PANEL ────────────────────────────── */}
      {aiOpen && (
        <>
          <div onClick={() => setAiOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1100 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)", background: "var(--preview-surface)", borderLeft: "1px solid var(--preview-border)", zIndex: 1101, display: "flex", flexDirection: "column", boxShadow: "-10px 0 40px rgba(0,0,0,0.18)", color: "var(--preview-text)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--preview-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ background: "linear-gradient(135deg,#a78bfa,#ec4899)", width: "28px", height: "28px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "13px" }}>✨</span>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>AI Assistant</div>
                  <div style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>Preview mode</div>
                </div>
              </div>
              <button onClick={() => setAiOpen(false)} style={{ background: "transparent", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--preview-text-muted)" }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {aiMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "user" ? ACCENT : "var(--preview-surface-2)", color: m.role === "user" ? "#fff" : "var(--preview-text)", padding: "8px 12px", borderRadius: "10px", fontSize: "13px", lineHeight: 1.4 }}>
                  {m.text}
                </div>
              ))}
              {aiMessages.length <= 1 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Try asking</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {AI_SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => sendAi(s)} style={{ textAlign: "left", padding: "8px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px", cursor: "pointer", color: "var(--preview-text)" }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--preview-border)", display: "flex", gap: "8px" }}>
              <input
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendAi(aiInput); }}
                placeholder="Ask anything…"
                style={{ flex: 1, padding: "8px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", color: "var(--preview-text)" }}
              />
              <button onClick={() => sendAi(aiInput)} style={{ background: ACCENT, color: "#fff", border: "none", padding: "0 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Send</button>
            </div>
          </div>
        </>
      )}

      {/* ─── DASHBOARD BODY (widgets, conditionally hidden) ── */}
      <VersionABody widgets={widgets} />
    </div>
  );
}

// ─── Body with conditional widget rendering ──────────────────
function VersionABody({ widgets }: { widgets: Record<WidgetKey, boolean> }) {
  const anyTopRow =
    widgets.moneyPosition ||
    widgets.outstandingBreakdown ||
    widgets.pipelineValue ||
    widgets.activeJobs ||
    widgets.totalLeads ||
    widgets.conversionRate;
  const anyMidRow = widgets.alertsActions || widgets.pipelineFunnel;
  const kpiCols = useKpiColumns();

  return (
    <>
      {anyTopRow && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: kpiCols,
            gap: "16px",
            marginBottom: "16px",
            alignItems: "stretch",
          }}
        >
          {widgets.moneyPosition && <MoneyPositionCardA />}
          {widgets.outstandingBreakdown && <OutstandingBreakdownCardA />}
          {widgets.pipelineValue && <PipelineValueCardA />}
          {widgets.activeJobs && <ActiveJobsCardA />}
          {widgets.totalLeads && <LeadsCardA />}
          {widgets.conversionRate && <ConversionCardA />}
        </div>
      )}

      {anyMidRow && (
        <div style={{ display: "grid", gridTemplateColumns: widgets.alertsActions && widgets.pipelineFunnel ? "1fr 1.4fr" : "1fr", gap: "14px", marginBottom: "22px" }}>
          {widgets.alertsActions && <AlertsPanelA />}
          {widgets.pipelineFunnel && <FunnelPanelA />}
        </div>
      )}

      {widgets.teamPerformance && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#666" }}>Team Performance</div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "#666", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "6px 12px", borderRadius: "8px" }}>Last 30 days ▾</div>
              <div style={{ fontSize: "12px", color: ACCENT, fontWeight: 600 }}>View full team →</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <ScoreCard initials="AA" name="Azat Aslanean" role="Sales Rep" score={92} label="Excellent" color="#16a34a" rank="Rank #1 of 6"
              top={[{ k: "Quotes Sent", v: "16", d: "↗ 22%", good: true }, { k: "Orders Won", v: "5", d: "↗ 25%", good: true }, { k: "Conversion", v: "31%", d: "↗ 5%", good: true }]}
              bottom={[{ k: "Response Time", v: "18m", s: "Great" }, { k: "Follow Ups", v: "42", s: "On Track" }, { k: "Revenue", v: "$12.4K", d: "↗ 18%", good: true }]} />
            <ScoreCard initials="MC" name="Manny Carlo" role="SDR" score={78} label="Good" color="#2563eb" rank="Rank #2 of 6"
              top={[{ k: "Leads Added", v: "27", d: "↗ 12%", good: true }, { k: "Qualified", v: "15", d: "↗ 25%", good: true }, { k: "Contact Rate", v: "56%", d: "↗ 10%", good: true }]}
              bottom={[{ k: "Response Time", v: "6m", s: "Great" }, { k: "Meetings Booked", v: "6", s: "On Track" }, { k: "SQL Rate", v: "28%", s: "Avg" }]} />
            <ScoreCard initials="MH" name="Maria Hakobyan" role="Sales Rep" score={64} label="Needs Attention" color="#f59e0b" rank="Rank #5 of 6"
              top={[{ k: "Quotes Sent", v: "11", d: "↘ 8%", good: false }, { k: "Orders Won", v: "2", d: "↘ 12%", good: false }, { k: "Conversion", v: "18%", d: "↘ 7%", good: false }]}
              bottom={[{ k: "Response Time", v: "32m", s: "High" }, { k: "Follow Ups", v: "28", s: "Behind" }, { k: "Revenue", v: "$4.3K", d: "↘ 12%", good: false }]} />
            <ScoreCard initials="GM" name="Gary Matevosyan" role="Sales Rep" score={48} label="Needs Review" color="#dc2626" rank="Rank #6 of 6"
              top={[{ k: "Quotes Sent", v: "9", d: "↘ 20%", good: false }, { k: "Orders Won", v: "1", d: "↘ 50%", good: false }, { k: "Conversion", v: "11%", d: "↘ 9%", good: false }]}
              bottom={[{ k: "Response Time", v: "1h 52m", s: "Very High" }, { k: "Follow Ups", v: "14", s: "Behind" }, { k: "Revenue", v: "$1.2K", d: "↘ 35%", good: false }]} />
          </div>
        </>
      )}

      {widgets.quickActions && (
        <div style={{ marginTop: "20px", background: "var(--preview-surface)", borderRadius: "14px", padding: "12px 18px", border: "1px solid var(--preview-border)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#666" }}>Quick Actions</span>
          {["👤 Add Lead", "🧾 Create Quote", "🛒 New Order", "📅 Schedule Follow Up"].map(a => (
            <div key={a} style={{ fontSize: "12px", padding: "6px 12px", background: "#f7f7f7", borderRadius: "8px", color: "#333", fontWeight: 500, cursor: "pointer" }}>{a}</div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Card components ────────────────────────────────────────
// Shared visual language for the top KPI row.
// All 6 boxes: var(--preview-surface) bg, 14px radius, 18/20px padding, 1px var(--preview-border).

const KPI_CARD_STYLE: React.CSSProperties = {
  background: "var(--preview-surface)",
  border: "1px solid var(--preview-border)",
  borderRadius: "14px",
  padding: "18px 18px",
  color: "var(--preview-text)",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  height: "100%",
};

const KPI_HEADER_STYLE: React.CSSProperties = {
  fontSize: "11.5px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--preview-text-muted)",
  lineHeight: 1.2,
  // Allow the header to wrap when the column is narrow (6-across layout).
  whiteSpace: "normal",
  overflowWrap: "break-word",
};

const KPI_BIG_NUMBER: React.CSSProperties = {
  // Scale down when the column is narrow (6-across ≈ 200-240px wide),
  // stay at 26px on wider columns.
  fontSize: "clamp(20px, 2vw, 26px)",
  fontWeight: 800,
  letterSpacing: "-0.5px",
  color: "var(--preview-text)",
  lineHeight: 1.1,
  marginTop: "8px",
};

function DeltaPill({ value, positive = true }: { value: string; positive?: boolean }) {
  const color = positive ? "#22c55e" : "#ef4444";
  const arrow = positive ? "↗" : "↘";
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, color, whiteSpace: "nowrap" }}>
      {arrow} {value}
    </span>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{ fontSize: "11px", color: "var(--preview-text-faint)", cursor: "help", marginLeft: "6px" }}
    >ⓘ</span>
  );
}

// UniformRow — single row shape used by every KPI box.
// Layout: label (+ optional muted descriptor below) on the left, bold value on the right.
// Rows stack; every row after the first gets a top border for a clean rhythm.
function UniformRow({
  label,
  value,
  detail,
  href,
  first,
  valueColor,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string | null;
  first?: boolean;
  valueColor?: string;
}) {
  const inner = (
    <>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "13px", color: "var(--preview-text)", fontWeight: 500, lineHeight: 1.25 }}>
          {label}
        </div>
        {detail && (
          <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", marginTop: "2px", lineHeight: 1.25 }}>
            {detail}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: valueColor ?? "var(--preview-text)",
          flexShrink: 0,
          marginLeft: "10px",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </>
  );
  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "10px 8px",
    margin: "0 -8px",
    borderTop: first ? "none" : "1px solid var(--preview-border)",
    borderRadius: "6px",
    textDecoration: "none",
  };
  if (href) {
    return (
      <Link href={href} className="kpi-sub-row" style={rowStyle}>
        {inner}
      </Link>
    );
  }
  return <div style={rowStyle}>{inner}</div>;
}

// Nested indented sub-row — smaller, used inside Outstanding Order Breakdown
// (Design/Proof/Production and paid/unpaid splits).
function NestedRow({
  label,
  value,
  href,
  labelColor,
  valueColor,
}: {
  label: string;
  value: string;
  href?: string | null;
  labelColor?: string;
  valueColor?: string;
}) {
  const inner = (
    <>
      <span style={{ fontSize: "12px", color: labelColor ?? "var(--preview-text-muted)", fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: valueColor ?? "var(--preview-text)",
          whiteSpace: "nowrap",
          marginLeft: "10px",
        }}
      >
        {value}
      </span>
    </>
  );
  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "5px 8px 5px 20px",
    margin: "0 -8px",
    borderRadius: "6px",
    textDecoration: "none",
  };
  if (href) {
    return (
      <Link href={href} className="kpi-sub-row" style={rowStyle}>
        {inner}
      </Link>
    );
  }
  return <div style={rowStyle}>{inner}</div>;
}

// Back-compat aliases (some cards still call these names).
function SubRow({ label, value, href, first }: { label: string; value: string; href?: string | null; first?: boolean }) {
  return <UniformRow label={label} value={value} href={href ?? null} first={first} />;
}
function StageRow({
  label,
  value,
  detail,
  href,
  first,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string | null;
  first?: boolean;
}) {
  return <UniformRow label={label} value={value} detail={detail} href={href ?? null} first={first} />;
}

// Box 3 — PIPELINE VALUE
export function PipelineValueCardA() {
  return (
    <div style={KPI_CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={KPI_HEADER_STYLE}>
          Pipeline Value
          <InfoTip text="Total open pipeline value across all Sales stages. Click any stage to see those deals." />
        </div>
        <DeltaPill value="12%" positive />
      </div>
      <Link href="/preview/sales-pipeline" className="kpi-link kpi-link-block">
        <div style={KPI_BIG_NUMBER}>$155.0K</div>
      </Link>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "4px" }}>vs last 30 days</div>
      <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ marginTop: "12px" }}>
        <polyline points="0,30 20,24 40,32 60,18 80,24 100,13 120,18 140,9 160,13 180,6 200,4" stroke="#a78bfa" strokeWidth={1.6} fill="none" />
      </svg>
      <div style={{ marginTop: "12px" }}>
        <StageRow
          first
          label="Quote Approval"
          value="$50,650"
          detail="3 deals · customer reviewing quote"
          href="/preview/sales-pipeline?stage=quote-approval"
        />
        <StageRow
          label="Quoting"
          value="$33,750"
          detail="3 deals · quote being built"
          href="/preview/sales-pipeline?stage=quoting"
        />
        <StageRow
          label="Qualifying"
          value="$16,600"
          detail="3 deals · confirming specs"
          href="/preview/sales-pipeline?stage=qualifying"
        />
        <StageRow
          label="Awaiting Payment"
          value="$15,300"
          detail="2 deals · becomes order when paid"
          href="/preview/sales-pipeline?stage=awaiting-payment"
        />
      </div>
    </div>
  );
}

// Box 4 — ACTIVE JOBS
export function ActiveJobsCardA() {
  return (
    <div style={KPI_CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={KPI_HEADER_STYLE}>
          Active Jobs
          <InfoTip text="Every job currently in production. Health = on-track / at-risk based on due date and priority. Click any row to see that group." />
        </div>
        <DeltaPill value="22%" positive />
      </div>
      <Link href="/preview/orders?status=active" className="kpi-link kpi-link-block">
        <div style={KPI_BIG_NUMBER}>71</div>
      </Link>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "4px" }}>vs last 30 days</div>
      <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ marginTop: "12px" }}>
        <polyline points="0,30 20,27 40,32 60,20 80,27 100,15 120,20 140,12 160,15 180,7 200,5" stroke="#22c55e" strokeWidth={1.6} fill="none" />
      </svg>
      <div style={{ marginTop: "12px" }}>
        <StageRow
          first
          label="On Track"
          value="59"
          detail="no issues"
          href="/preview/orders?status=active&health=on-track"
        />
        <StageRow
          label="At Risk"
          value="5"
          detail="past due · quality flag"
          href="/preview/orders?status=active&health=at-risk"
        />
        <StageRow
          label="Rush Orders"
          value="7"
          detail="priority tag"
          href="/preview/orders?priority=rush"
        />
      </div>
      <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "10px" }}>
        Based on due date + priority
      </div>
    </div>
  );
}

// Box 5 — TOTAL LEADS
export function LeadsCardA() {
  return (
    <div style={KPI_CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={KPI_HEADER_STYLE}>
          Total Leads
          <InfoTip text="Every lead in the pipeline right now. Click any row to see that group." />
        </div>
        <DeltaPill value="8%" positive />
      </div>
      <Link href="/preview/leads" className="kpi-link kpi-link-block">
        <div style={KPI_BIG_NUMBER}>42</div>
      </Link>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "4px" }}>vs last 30 days</div>
      <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ marginTop: "12px" }}>
        <polyline points="0,30 20,25 40,32 60,21 80,27 100,17 120,23 140,13 160,17 180,8 200,5" stroke="#3b82f6" strokeWidth={1.6} fill="none" />
      </svg>
      <div style={{ marginTop: "12px" }}>
        <StageRow
          first
          label="Needs Attention"
          value="8"
          detail="leads flagged"
          href="/preview/leads?tab=attention"
        />
        <StageRow
          label="New"
          value="7"
          detail="leads"
          href="/preview/leads?tab=new"
        />
        <StageRow
          label="Waiting on Customer"
          value="6"
          detail="leads"
          href="/preview/leads?tab=waiting"
        />
      </div>
    </div>
  );
}

// Box 5 — CONVERSION RATE (with donut)
export function ConversionCardA() {
  // Donut: 12.4% of ring filled. Circumference = 2 * PI * r; r=28 → C ≈ 175.93
  const C = 2 * Math.PI * 28;
  const pct = 12.4;
  const filled = (pct / 100) * C;
  const gap = C - filled;
  return (
    <div style={KPI_CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={KPI_HEADER_STYLE}>
            Conversion Rate
            <InfoTip text="Share of new leads that become paid orders in the last 30 days." />
          </div>
          <div style={KPI_BIG_NUMBER}>12.4%</div>
          <div style={{ fontSize: "12px", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
            <DeltaPill value="2.1%" positive />
            <span style={{ color: "var(--preview-text-muted)" }}>vs last 30 days</span>
          </div>
        </div>
        <svg width="44" height="44" viewBox="0 0 70 70" style={{ flexShrink: 0 }}>
          <circle cx="35" cy="35" r="28" stroke="var(--preview-chip-border)" strokeWidth={7} fill="none" />
          <circle
            cx="35" cy="35" r="28"
            stroke="#3b82f6" strokeWidth={7} fill="none"
            strokeDasharray={`${filled} ${gap}`}
            strokeLinecap="round"
            transform="rotate(-90 35 35)"
          />
          <text x="35" y="40" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--preview-text)">12.4%</text>
        </svg>
      </div>
      <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ marginTop: "12px" }}>
        <polyline points="0,30 20,28 40,32 60,22 80,26 100,20 120,22 140,15 160,17 180,10 200,7" stroke="#3b82f6" strokeWidth={1.6} fill="none" />
      </svg>
      <div style={{ marginTop: "12px" }}>
        <SubRow first label="Quotes Sent" value="23" href="/preview/quoted-requests" />
        <SubRow label="Orders Won" value="9" href="/preview/orders?status=won" />
        <SubRow label="Conversion Rate" value="12.4%" />
      </div>
    </div>
  );
}

// ─── MONEY POSITION (LAST 30 DAYS) ──────────────────────────
// Same outer container as the other 5 KPI boxes.
const MONEY_OUTER_STYLE: React.CSSProperties = KPI_CARD_STYLE;

export function MoneyPositionCardA() {
  return (
    <div style={MONEY_OUTER_STYLE}>
      <div style={{ minWidth: 0 }}>
        <div style={KPI_HEADER_STYLE}>
          Money Position
          <InfoTip text="Snapshot of all money flowing through your business in the last 30 days. Total Orders is everything sold. Completed & Shipped is finished work. In Production is what's being made. Payments Collected is cash actually in hand." />
        </div>
        <div
          style={{
            fontSize: "10.5px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--preview-text-muted)",
            marginTop: "3px",
          }}
        >
          Last 30 days
        </div>
      </div>
      <div style={{ marginTop: "14px" }}>
        <UniformRow
          first
          label="Total Orders"
          detail="119 orders"
          value="$394,600"
          href="/preview/orders"
        />
        <UniformRow
          label="Completed & Shipped"
          detail="Balance Due · $0 Paid"
          value="$151,380"
          href="/preview/orders?status=completed"
        />
        <UniformRow
          label="In Production"
          detail="48 active"
          value="$306,580"
          href="/preview/orders?status=in-production"
        />
        <UniformRow
          label="Payments Collected"
          detail="71 payments"
          value="$88,020"
          href="/preview/payments"
        />
      </div>
    </div>
  );
}

// ─── OUTSTANDING ORDER BREAKDOWN ────────────────────────────
export function OutstandingBreakdownCardA() {
  return (
    <div style={MONEY_OUTER_STYLE}>
      <div style={KPI_HEADER_STYLE}>
        Outstanding Order Breakdown
        <InfoTip text="Snapshot of every open order. In Production = still being made. Completed = finished but not yet shipped or picked up. Payment Risk = orders past the payment due date." />
      </div>
      <div style={{ marginTop: "14px" }}>
        {/* A. In Production */}
        <UniformRow
          first
          label="In Production · 32 orders"
          value="$155,200"
          href="/preview/orders?status=in-production"
        />
        <div style={{ marginTop: "-4px", marginBottom: "6px" }}>
          <NestedRow label="Design" value="6" href="/preview/orders?status=design" />
          <NestedRow label="Proof" value="4" href="/preview/orders?status=proof" />
          <NestedRow label="Production" value="22" href="/preview/orders?status=production" />
        </div>

        {/* B. Completed */}
        <UniformRow
          label="Completed · 16 orders"
          value="$151,380"
          href="/preview/orders?status=completed"
        />
        <div style={{ marginTop: "-4px", marginBottom: "6px" }}>
          <NestedRow
            label="Paid · Not pending shipping"
            value="$0 · 0 orders"
            href="/preview/orders?status=completed&payment=paid&shipping=none"
          />
          <NestedRow
            label="Not paid · Pending shipping"
            value="$151,380 · 16 orders"
            href="/preview/orders?status=completed&payment=unpaid&shipping=pending"
            valueColor="#f59e0b"
          />
        </div>

        {/* C. Payment Risk — kept as a distinct red-tinted callout. */}
        <Link
          href="/preview/orders?risk=payment"
          className="risk-callout"
          style={{ marginTop: "10px", padding: "10px 12px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "13px", color: "#ef4444", fontWeight: 600, lineHeight: 1.25 }}>
                Payment Risk · 3 orders
              </div>
              <div style={{ fontSize: "11.5px", color: "#ef4444", opacity: 0.8, marginTop: "2px", lineHeight: 1.25 }}>
                Oldest unpaid 42 days
              </div>
            </div>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#ef4444", flexShrink: 0, marginLeft: "10px", whiteSpace: "nowrap" }}>
              $28,900
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}

export function AlertsPanelA() {
  const alerts: [string, string, string, string][] = [
    ["red", "8", "Quotes waiting more than 48h", "/preview/quoted-requests?filter=waiting-48h"],
    ["amber", "14", "Leads not contacted", "/preview/leads?tab=attention"],
    ["amber", "6", "Orders past due date", "/preview/orders?filter=past-due"],
    ["amber", "5", "Customers waiting for callback", "/preview/crm?filter=awaiting-callback"],
    ["purple", "3", "Rush orders not started", "/preview/orders?priority=rush&status=not-started"],
  ];
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "14px", padding: "16px 18px", border: "1px solid var(--preview-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div style={{ background: "#fef2f2", color: "#dc2626", width: "26px", height: "26px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>⚠</div>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Alerts &amp; Actions</div>
        <span
          title="Time-sensitive items that need action today. Click any row to see the list."
          style={{ marginLeft: "6px", fontSize: "11px", color: "var(--preview-text-faint)", cursor: "help" }}
        >ⓘ</span>
        <div style={{ marginLeft: "auto", background: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>7</div>
      </div>
      {alerts.map((a) => {
        const bg = a[0] === "red" ? "#fef2f2" : a[0] === "amber" ? "#fffbeb" : "#f5f3ff";
        const c = a[0] === "red" ? "#dc2626" : a[0] === "amber" ? "#d97706" : "#7c3aed";
        return (
          <Link
            key={a[2]}
            href={a[3]}
            style={{
              color: "inherit", textDecoration: "none",
              padding: "10px 8px", borderTop: "1px solid var(--preview-border)",
              display: "flex", alignItems: "center", gap: "12px",
              cursor: "pointer", borderRadius: "6px",
            }}
          >
            <div style={{ background: bg, color: c, width: "26px", height: "26px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>⚠</div>
            <div style={{ background: bg, color: c, fontSize: "12px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", minWidth: "28px", textAlign: "center", flexShrink: 0 }}>{a[1]}</div>
            <div style={{ fontSize: "13px", color: "var(--preview-text)", flex: 1 }}>{a[2]}</div>
            <span style={{ fontSize: "14px", color: "var(--preview-text-faint)" }}>›</span>
          </Link>
        );
      })}
      <Link
        href="/preview/alerts"
        style={{
          color: "inherit", textDecoration: "none",
          marginTop: "8px", padding: "10px 8px", borderTop: "1px solid var(--preview-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", borderRadius: "6px",
        }}
      >
        <span style={{ fontSize: "12px", color: "var(--preview-text-muted)", fontWeight: 500 }}>View all alerts</span>
        <span style={{ fontSize: "14px", color: "var(--preview-text-faint)" }}>›</span>
      </Link>
    </div>
  );
}

export function FunnelPanelA() {
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "14px", padding: "16px 18px", border: "1px solid var(--preview-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div style={{ background: "#eff6ff", color: "#2563eb", width: "26px", height: "26px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>▽</div>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Pipeline Funnel</div>
        <span style={{ marginLeft: "auto", fontSize: "10px", color: "#bbb" }}>ⓘ</span>
      </div>
      {[
        ["New Leads", "57", "100%", "#3b82f6", 100],
        ["Contacted", "32", "56%", "#60a5fa", 78],
        ["Quotes Sent", "23", "40%", "#34d399", 55],
        ["Orders Won", "9", "16%", "#16a34a", 32],
      ].map((s: any) => (
        <div key={s[0]} style={{ marginBottom: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
            <span style={{ fontSize: "12px", color: "#333", fontWeight: 500 }}>{s[0]}</span>
            <span style={{ fontSize: "12px" }}><span style={{ fontWeight: 700, color: "#171717" }}>{s[1]}</span>{"  "}<span style={{ color: "#888" }}>{s[2]}</span></span>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ width: `${s[4]}%`, height: "20px", background: s[3], borderRadius: "4px", opacity: 0.9 }} />
          </div>
        </div>
      ))}
      <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid #f4f4f4" }}>
        <span style={{ fontSize: "12px", color: "#666" }}>Conversion Rate</span>
        <span style={{ fontSize: "13px", fontWeight: 700 }}>12.4%</span>
      </div>
    </div>
  );
}

export function ScoreCard({ initials, name, role, score, label, color, rank, top, bottom }: any) {
  const tint = color + "1A";
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "12px", padding: "14px 16px", border: "1px solid var(--preview-border)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "80px", background: `linear-gradient(180deg, ${color} 0%, ${color}00 100%)`, opacity: 0.18, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: color, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#f0f0f0", color: "#333", fontWeight: 700, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            {initials}
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", position: "absolute", right: "-1px", bottom: "-1px", border: "2px solid #fff" }} />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: "11px", color: "#888" }}>{role}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", background: tint, padding: "6px 12px", borderRadius: "10px", minWidth: "70px" }}>
          <div style={{ fontSize: "24px", fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: "9px", fontWeight: 700, color, marginTop: "2px" }}>{label}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "10px" }}>
        {top.map((m: any) => (
          <div key={m.k}>
            <div style={{ fontSize: "9px", color: "#999", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600 }}>{m.k}</div>
            <div style={{ fontSize: "15px", fontWeight: 700, marginTop: "1px" }}>{m.v}</div>
            {m.d && <div style={{ fontSize: "10px", fontWeight: 700, color: m.good ? "#16a34a" : "#dc2626" }}>{m.d}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "10px" }}>
        {bottom.map((m: any) => (
          <div key={m.k} style={{ background: "#f9f9f9", padding: "5px 8px", borderRadius: "6px" }}>
            <div style={{ fontSize: "9px", color: "#999", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600 }}>{m.k}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "1px" }}>{m.v}</div>
            {m.s ? (
              <div style={{ fontSize: "9px", fontWeight: 600, color: m.s === "Great" || m.s === "On Track" ? "#16a34a" : (m.s === "Avg" ? "#f59e0b" : "#dc2626") }}>● {m.s}</div>
            ) : (
              m.d && <div style={{ fontSize: "9px", fontWeight: 700, color: m.good ? "#16a34a" : "#dc2626" }}>{m.d}</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #f4f4f4", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", color: "#888" }}>{rank}</span>
        <span style={{ fontSize: "11px", color: ACCENT, fontWeight: 600 }}>View details →</span>
      </div>
    </div>
  );
}
