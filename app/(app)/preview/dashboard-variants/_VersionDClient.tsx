"use client";

// Hayk 2026-07-01 — Variant D: Layered dashboard rebuild.
// Layout (top to bottom, strictly per mockup):
//   1. Header row: greeting + top-bar controls (date, customize, bell, AI, avatar).
//   2. Five hero KPI tiles (Revenue, Pipeline, Active Jobs, Leads, Conversion).
//   3. Three-card row: Money Position · Outstanding Order Breakdown · Pipeline Value.
//   4. Three-card row: Active Jobs · Total Leads · Conversion Rate.
//   5. Two-card row: Alerts & Actions · Pipeline Funnel.
//   6. Team performance (4 rep cards).
//   7. Quick actions strip.
//
// Reuses AlertsPanelA, FunnelPanelA, ScoreCard from _VersionAClient for
// sections 5 and 6 verbatim.

import React from "react";
import Link from "next/link";
import { AlertsPanelA, FunnelPanelA, ScoreCard } from "./_VersionAClient";

const ACCENT = "#FF5D2E";

// ─── Small primitives ─────────────────────────────────────────
function DeltaPill({ value, positive = true }: { value: string; positive?: boolean }) {
  const color = positive ? "#22c55e" : "#ef4444";
  const arrow = positive ? "↗" : "↘";
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color,
        whiteSpace: "nowrap",
        background: positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        padding: "2px 8px",
        borderRadius: "999px",
      }}
    >
      {arrow} {value}
    </span>
  );
}

function InfoTip({ text }: { text?: string }) {
  return (
    <span
      title={text}
      style={{ fontSize: "11px", color: "var(--preview-text-faint)", cursor: "help", marginLeft: "6px" }}
    >ⓘ</span>
  );
}

function IconSquare({ emoji, tint, size = 48 }: { emoji: string; tint: string; size?: number }) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: size >= 40 ? "12px" : "10px",
        background: tint + "22",
        border: `1px solid ${tint}44`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size >= 40 ? "22px" : "16px",
        flexShrink: 0,
      }}
    >
      {emoji}
    </div>
  );
}

const CARD_STYLE: React.CSSProperties = {
  background: "var(--preview-surface)",
  border: "1px solid var(--preview-border)",
  borderRadius: "14px",
  padding: "20px",
  color: "var(--preview-text)",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const SECTION_HEADER: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--preview-text-muted)",
};

// ─── HERO KPI TILE ────────────────────────────────────────────
function HeroTile({
  emoji,
  tint,
  label,
  value,
  delta,
  href,
}: {
  emoji: string;
  tint: string;
  label: string;
  value: string;
  delta: string;
  href?: string;
}) {
  const inner = (
    <div style={{ ...CARD_STYLE, flexDirection: "row", gap: "14px", alignItems: "center", height: "100%" }}>
      <IconSquare emoji={emoji} tint={tint} />
      <div style={{ minWidth: 0 }}>
        <div style={SECTION_HEADER}>{label}</div>
        <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px", marginTop: "4px", lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
          <span style={{ color: "#22c55e", fontWeight: 700 }}>↗ {delta}</span>
          <span>vs last 30 days</span>
        </div>
      </div>
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link>;
  return inner;
}

// ─── SECTION 2A · MONEY POSITION ──────────────────────────────
function MoneyPositionD() {
  const rows: { emoji: string; tint: string; label: string; sub: string; value: string; href?: string }[] = [
    { emoji: "🛒", tint: "#3b82f6", label: "Total Orders", sub: "119 orders", value: "$394,600", href: "/preview/orders" },
    { emoji: "🚚", tint: "#a78bfa", label: "Completed & Shipped", sub: "Balance Due · $0 Paid", value: "$151,380", href: "/preview/orders?status=completed" },
    { emoji: "🏭", tint: "#fb923c", label: "In Production", sub: "48 active", value: "$306,580", href: "/preview/orders?status=in-production" },
    { emoji: "💵", tint: "#22c55e", label: "Payments Collected", sub: "71 payments", value: "$88,020", href: "/preview/payments" },
  ];
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={SECTION_HEADER}>
          Money Position
          <InfoTip text="Snapshot of money moving through the business in the last 30 days." />
        </div>
        <span style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>Last 30 days</span>
      </div>
      <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {rows.map(r => {
          const inner = (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <IconSquare emoji={r.emoji} tint={r.tint} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", marginTop: "2px" }}>{r.sub}</div>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap" }}>{r.value}</div>
            </div>
          );
          return r.href ? (
            <Link key={r.label} href={r.href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link>
          ) : (
            <div key={r.label}>{inner}</div>
          );
        })}
      </div>
      <Link
        href="/preview/reports/money"
        style={{
          marginTop: "14px",
          paddingTop: "12px",
          borderTop: "1px solid var(--preview-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: ACCENT,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <span>📊 View detailed report →</span>
        <span style={{ color: "var(--preview-text-faint)" }}>›</span>
      </Link>
    </div>
  );
}

// ─── SECTION 2B · OUTSTANDING ORDER BREAKDOWN ────────────────
function OutstandingBreakdownD() {
  return (
    <div style={CARD_STYLE}>
      <div style={SECTION_HEADER}>
        Outstanding Order Breakdown
        <InfoTip text="Every open order. In Production, Completed but unshipped/unpaid, and payment-risk callout." />
      </div>

      {/* In Production */}
      <div style={{ marginTop: "14px" }}>
        <Link href="/preview/orders?status=in-production" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "inherit" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", fontWeight: 600, flex: 1 }}>In Production · 32 orders</span>
          <span style={{ fontSize: "14px", fontWeight: 700 }}>$155,200</span>
        </Link>
        <div style={{ marginTop: "6px", marginLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <Link href="/preview/orders?status=design" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--preview-text-muted)", textDecoration: "none" }}>
            <span>Design</span><span style={{ color: "var(--preview-text)", fontWeight: 600 }}>6</span>
          </Link>
          <Link href="/preview/orders?status=proof" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--preview-text-muted)", textDecoration: "none" }}>
            <span>Proof</span><span style={{ color: "var(--preview-text)", fontWeight: 600 }}>4</span>
          </Link>
          <Link href="/preview/orders?status=production" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--preview-text-muted)", textDecoration: "none" }}>
            <span>Production</span><span style={{ color: "var(--preview-text)", fontWeight: 600 }}>22</span>
          </Link>
        </div>
      </div>

      {/* Completed */}
      <div style={{ marginTop: "14px" }}>
        <Link href="/preview/orders?status=completed" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "inherit" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", fontWeight: 600, flex: 1 }}>Completed · 16 orders</span>
          <span style={{ fontSize: "14px", fontWeight: 700 }}>$151,380</span>
        </Link>
        <div style={{ marginTop: "6px", marginLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <Link href="/preview/orders?status=completed&payment=paid&shipping=none" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--preview-text-muted)", textDecoration: "none" }}>
            <span>Paid · Not pending shipping</span>
            <span style={{ color: "var(--preview-text)", fontWeight: 600 }}>$0 · 0 orders</span>
          </Link>
          <Link href="/preview/orders?status=completed&payment=unpaid&shipping=pending" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--preview-text-muted)", textDecoration: "none" }}>
            <span>Not paid · Pending shipping</span>
            <span style={{ color: "#f59e0b", fontWeight: 700 }}>$151,380 · 16 orders</span>
          </Link>
        </div>
      </div>

      {/* Payment Risk */}
      <Link
        href="/preview/orders?risk=payment"
        style={{
          marginTop: "14px",
          padding: "12px",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <span style={{ fontSize: "16px" }}>⚠️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#ef4444" }}>Payment Risk · 3 orders</span>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#ef4444", whiteSpace: "nowrap" }}>$28,900</span>
          </div>
          <div style={{ fontSize: "11.5px", color: "#ef4444", opacity: 0.85, marginTop: "3px" }}>Oldest unpaid 42 days</div>
        </div>
        <span style={{ color: "#ef4444", opacity: 0.7, fontSize: "14px" }}>›</span>
      </Link>
    </div>
  );
}

// ─── SECTION 2C · PIPELINE VALUE ─────────────────────────────
function PipelineValueD() {
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={SECTION_HEADER}>
          Pipeline Value
          <InfoTip text="Total open pipeline value across sales stages." />
        </div>
        <DeltaPill value="12%" positive />
      </div>
      <Link href="/preview/sales-pipeline" style={{ textDecoration: "none", color: "inherit" }}>
        <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", marginTop: "8px", lineHeight: 1.1 }}>$155.0K</div>
      </Link>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "4px" }}>vs last 30 days</div>
      <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ marginTop: "12px" }}>
        <polyline points="0,30 20,24 40,32 60,18 80,24 100,13 120,18 140,9 160,13 180,6 200,4" stroke="#a78bfa" strokeWidth={1.8} fill="none" />
      </svg>
      <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {[
          { label: "Quote Approval", detail: "3 deals · customer reviewing quote", value: "$50,650", href: "/preview/sales-pipeline?stage=quote-approval" },
          { label: "Quoting", detail: "3 deals · quote being built", value: "$33,750", href: "/preview/sales-pipeline?stage=quoting" },
          { label: "Qualifying", detail: "3 deals · confirming specs", value: "$16,600", href: "/preview/sales-pipeline?stage=qualifying" },
          { label: "Awaiting Payment", detail: "2 deals · becomes order when paid", value: "$15,300", href: "/preview/sales-pipeline?stage=awaiting-payment" },
        ].map(r => (
          <Link key={r.label} href={r.href} style={{ textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", marginTop: "2px" }}>{r.detail}</div>
            </div>
            <span style={{ fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap" }}>{r.value}</span>
          </Link>
        ))}
      </div>
      <Link
        href="/preview/sales-pipeline"
        style={{
          marginTop: "14px",
          paddingTop: "12px",
          borderTop: "1px solid var(--preview-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: ACCENT,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <span>View all pipeline →</span>
        <span style={{ color: "var(--preview-text-faint)" }}>›</span>
      </Link>
    </div>
  );
}

// ─── SECTION 3A · ACTIVE JOBS ────────────────────────────────
function ActiveJobsD() {
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={SECTION_HEADER}>
          Active Jobs
          <InfoTip text="Jobs in production, grouped by health." />
        </div>
        <DeltaPill value="22%" positive />
      </div>
      <Link href="/preview/orders?status=active" style={{ textDecoration: "none", color: "inherit" }}>
        <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", marginTop: "8px", lineHeight: 1.1 }}>71</div>
      </Link>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "4px" }}>vs last 30 days</div>
      <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ marginTop: "12px" }}>
        <polyline points="0,30 20,27 40,32 60,20 80,27 100,15 120,20 140,12 160,15 180,7 200,5" stroke="#22c55e" strokeWidth={1.8} fill="none" />
      </svg>
      <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
        <Chip href="/preview/orders?status=active&health=on-track" tint="#22c55e" emoji="🟢" label="On Track" value="59" />
        <Chip href="/preview/orders?status=active&health=at-risk" tint="#f59e0b" emoji="⚠️" label="At Risk" value="5" />
        <Chip href="/preview/orders?priority=rush" tint="#ef4444" emoji="⚠️" label="Rush Orders" value="7" />
      </div>
      <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--preview-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>Based on due date + priority</span>
        <Link href="/preview/orders?status=active" style={{ fontSize: "12px", color: ACCENT, fontWeight: 600, textDecoration: "none" }}>View all jobs →</Link>
      </div>
    </div>
  );
}

function Chip({ href, tint, emoji, label, value }: { href: string; tint: string; emoji: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        background: tint + "1A",
        border: `1px solid ${tint}33`,
        color: tint,
        padding: "5px 6px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
      }}
      title={`${label} ${value}`}
    >
      <span style={{ fontSize: "10px" }}>{emoji}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ fontWeight: 800 }}>{value}</span>
    </Link>
  );
}

// ─── SECTION 3B · TOTAL LEADS ────────────────────────────────
function TotalLeadsD() {
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div style={SECTION_HEADER}>
          Total Leads
          <InfoTip text="Every open lead grouped by state." />
        </div>
        <DeltaPill value="8%" positive />
      </div>
      <Link href="/preview/leads" style={{ textDecoration: "none", color: "inherit" }}>
        <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", marginTop: "8px", lineHeight: 1.1 }}>42</div>
      </Link>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginTop: "4px" }}>vs last 30 days</div>
      <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" style={{ marginTop: "12px" }}>
        <polyline points="0,30 20,25 40,32 60,21 80,27 100,17 120,23 140,13 160,17 180,8 200,5" stroke="#3b82f6" strokeWidth={1.8} fill="none" />
      </svg>
      <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
        <Chip href="/preview/leads?tab=attention" tint="#ef4444" emoji="⚠️" label="Needs Attention" value="8" />
        <Chip href="/preview/leads?tab=new" tint="#3b82f6" emoji="▲" label="New Leads" value="7" />
        <Chip href="/preview/leads?tab=waiting" tint="#f59e0b" emoji="⚠️" label="Waiting" value="6" />
      </div>
      <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--preview-border)", display: "flex", justifyContent: "flex-end" }}>
        <Link href="/preview/leads" style={{ fontSize: "12px", color: ACCENT, fontWeight: 600, textDecoration: "none" }}>View all leads →</Link>
      </div>
    </div>
  );
}

// ─── SECTION 3C · CONVERSION RATE ────────────────────────────
function ConversionRateD() {
  const C = 2 * Math.PI * 28;
  const pct = 12.4;
  const filled = (pct / 100) * C;
  const gap = C - filled;
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={SECTION_HEADER}>
            Conversion Rate
            <InfoTip text="Share of new leads that became paid orders." />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", marginTop: "8px", lineHeight: 1.1 }}>12.4%</div>
          <div style={{ fontSize: "12px", marginTop: "4px", color: "var(--preview-text-muted)" }}>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>↗ 2.1%</span> vs last 30 days
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
        <polyline points="0,30 20,28 40,32 60,22 80,26 100,20 120,22 140,15 160,17 180,10 200,7" stroke="#3b82f6" strokeWidth={1.8} fill="none" />
      </svg>
      <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {[
          ["Quotes Sent", "23"],
          ["Orders Won", "9"],
          ["Conversion Rate", "12.4%"],
        ].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <span style={{ color: "var(--preview-text)" }}>{l}</span>
            <span style={{ fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--preview-border)", display: "flex", justifyContent: "flex-end" }}>
        <Link href="/preview/reports/conversion" style={{ fontSize: "12px", color: ACCENT, fontWeight: 600, textDecoration: "none" }}>View report →</Link>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────
export default function VersionDClient() {
  return (
    <div className="text-foreground" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .vd-hover:hover { filter: brightness(1.05); }
      `}</style>

      {/* ─── HEADER ROW ────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", gap: "16px" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.5px" }}>Good morning, Hayk! 👋</h1>
          <div className="text-muted-foreground" style={{ fontSize: "13px", marginTop: "2px" }}>Here's what's happening with your business.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ fontSize: "12px", color: "var(--preview-text)", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", cursor: "pointer" }}>
            📅 Last 30 days ▾
          </div>
          <div style={{ fontSize: "12px", color: "#fff", background: "#0a0a0a", padding: "6px 12px", borderRadius: "8px", fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer" }}>⚙ Customize</div>
          <div style={{ position: "relative", cursor: "pointer" }}>
            <span style={{ fontSize: "18px" }}>🔔</span>
            <span style={{ position: "absolute", top: "-4px", right: "-6px", background: "#dc2626", color: "#fff", fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "999px" }}>12</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "linear-gradient(90deg,#a78bfa,#f472b6)", color: "#fff", padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>✨ AI</div>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e5e5e5", color: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px" }}>H</div>
        </div>
      </div>

      {/* ─── SECTION 1 · 5 HERO KPI TILES ──────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "12px", marginBottom: "16px", alignItems: "stretch" }}>
        <HeroTile emoji="🛒" tint="#3b82f6" label="Total Revenue"   value="$394,600" delta="12%"  href="/preview/orders" />
        <HeroTile emoji="📈" tint="#22c55e" label="Pipeline Value"  value="$155,000" delta="12%"  href="/preview/sales-pipeline" />
        <HeroTile emoji="💼" tint="#a78bfa" label="Active Jobs"     value="71"       delta="22%"  href="/preview/orders?status=active" />
        <HeroTile emoji="👥" tint="#fb923c" label="Total Leads"     value="42"       delta="8%"   href="/preview/leads" />
        <HeroTile emoji="🎯" tint="#38bdf8" label="Conversion Rate" value="12.4%"    delta="2.1%" href="/preview/reports/conversion" />
      </div>

      {/* ─── SECTION 2 · 3-CARD ROW ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "16px", alignItems: "stretch" }}>
        <MoneyPositionD />
        <OutstandingBreakdownD />
        <PipelineValueD />
      </div>

      {/* ─── SECTION 3 · 3-CARD ROW ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "16px", alignItems: "stretch" }}>
        <ActiveJobsD />
        <TotalLeadsD />
        <ConversionRateD />
      </div>

      {/* ─── SECTION 4 · ALERTS + FUNNEL ───────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "14px", marginBottom: "22px", alignItems: "stretch" }}>
        <AlertsPanelA />
        <FunnelPanelA />
      </div>

      {/* ─── SECTION 5 · TEAM PERFORMANCE ──────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--preview-text-muted)" }}>Team Performance</div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ fontSize: "12px", color: "var(--preview-text)", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "6px 12px", borderRadius: "8px" }}>Last 30 days ▾</div>
          <Link href="/preview/team" style={{ fontSize: "12px", color: ACCENT, fontWeight: 600, textDecoration: "none" }}>View full team →</Link>
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

      {/* ─── SECTION 6 · QUICK ACTIONS ─────────────────────── */}
      <div style={{ marginTop: "20px", background: "var(--preview-surface)", borderRadius: "14px", padding: "12px 18px", border: "1px solid var(--preview-border)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--preview-text-muted)" }}>Quick Actions</span>
        {["👤 Add Lead", "📄 Create Quote", "🛒 New Order", "📅 Schedule Follow Up"].map(a => (
          <div key={a} style={{ fontSize: "12px", padding: "6px 12px", background: "var(--preview-surface-2)", borderRadius: "8px", color: "var(--preview-text)", fontWeight: 500, cursor: "pointer", border: "1px solid var(--preview-border)" }}>{a}</div>
        ))}
      </div>
    </div>
  );
}
