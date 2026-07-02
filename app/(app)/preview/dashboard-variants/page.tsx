// Hayk 2026-07-01 — Dashboard mockup, 3 variants.
// A = ChatGPT screenshot copy 1:1
// B = A but tightened (better hierarchy, cleaner alerts, real sparklines)
// C = Alt layout (denser, more like Linear/Attio)
// Real dashboard NOT touched.

import Link from "next/link";
import VersionAClient from "./_VersionAClient";
import VersionDClient from "./_VersionDClient";
import { DashboardRoleGate } from "./_RoleGateClient";

const ACCENT = "#FF5D2E";

export default async function DashboardPreview({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const sp = await searchParams;
  const v = (sp?.v ?? "d").toLowerCase();

  return (
    <DashboardRoleGate>
    <div>
      {/* Version switcher */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text-muted)" }}>Pick a version →</span>
        {[
          { key: "a", label: "A · ChatGPT copy" },
          { key: "b", label: "B · Tightened" },
          { key: "c", label: "C · Attio-style dense" },
          { key: "d", label: "D · Layered" },
        ].map(t => (
          <Link key={t.key} href={`?v=${t.key}`} style={{
            fontSize: "12px",
            padding: "6px 12px",
            borderRadius: "6px",
            background: v === t.key ? "#fff" : "transparent",
            color: v === t.key ? "#0a0a0a" : "var(--preview-text)",
            fontWeight: v === t.key ? 700 : 500,
            border: "1px solid var(--preview-border-strong)",
            textDecoration: "none",
          }}>{t.label}</Link>
        ))}
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>Real dashboard untouched</span>
      </div>

      {v === "a" && <VersionAClient />}
      {v === "b" && <VersionB />}
      {v === "c" && <VersionC />}
      {(v === "d" || (v !== "a" && v !== "b" && v !== "c")) && <VersionDClient />}
    </div>
    </DashboardRoleGate>
  );
}

// ────────────────────────────────────────────────────────────
// VERSION A — ChatGPT screenshot copy 1:1
// ────────────────────────────────────────────────────────────
function VersionA() {
  return (
    <div className="text-foreground" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Unified header — greeting + tools all on one row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", gap: "16px" }}>
        <div className="text-foreground" style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.5px" }}>Good morning, Hayk! 👋</h1>
          <div className="text-muted-foreground" style={{ fontSize: "13px", marginTop: "2px" }}>Here's what's happening with your business.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ position: "relative", width: "240px" }}>
            <input placeholder="Search leads, orders, customers…" style={{ width: "100%", padding: "7px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px" }} />
            <span style={{ position: "absolute", right: "8px", top: "7px", fontSize: "10px", color: "#999", background: "#f5f5f5", padding: "1px 5px", borderRadius: "4px" }}>⌘K</span>
          </div>
          <div style={{ fontSize: "12px", color: "#666", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap" }}>📅 Jun 1 – Jun 30, 2026</div>
          <div style={{ fontSize: "12px", color: "#fff", background: "#0a0a0a", padding: "6px 12px", borderRadius: "8px", fontWeight: 500, whiteSpace: "nowrap" }}>⚙ Customize</div>
          <div style={{ position: "relative" }}>
            <span style={{ fontSize: "18px" }}>🔔</span>
            <span style={{ position: "absolute", top: "-4px", right: "-6px", background: "#dc2626", color: "#fff", fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "999px" }}>12</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "linear-gradient(90deg,#a78bfa,#f472b6)", color: "#fff", padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>✨ AI</div>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e5e5e5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px" }}>H</div>
        </div>
      </div>

      {/* All 6 in ONE row · dark widgets keep full detail, stacked vertically */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <MoneyPositionCardA />
        <OutstandingBreakdownCard />
        <SubMetricCard label="Pipeline Value" value="$48.7K" delta="↗ 12%" period="vs last 30 days" hint="Every quote before it becomes a paid order. When customer approves + pays, it auto-moves to Orders." sub={[
          { label: "Unassigned", value: "7 requests", note: "no rep claimed · value TBD" },
          { label: "In progress", value: "$15.2K", note: "rep drafting quote" },
          { label: "Sent, waiting reply", value: "$23.5K", note: "with customer" },
          { label: "Approved, unpaid", value: "$10.0K", note: "→ becomes order when paid" },
        ]} sparkline="purple" />
        <SubMetricCard label="Active Jobs" value="71" delta="↗ 22%" period="vs last 30 days" hint="Paid orders currently in the shop." sub={[
          { label: "On Track", value: "59", note: "no issues" },
          { label: "At Risk", value: "5", note: "past due · quality flag" },
          { label: "Rush Orders", value: "7", note: "priority tag" },
        ]} sparkline="green" />
        <LeadsCardA />
        <ConversionCardA />
      </div>

      {/* Row 2 — Alerts · Funnel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "14px", marginBottom: "22px" }}>
        <AlertsPanelA />
        <FunnelPanelA />
      </div>

      {/* Team performance */}
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

      {/* Quick actions */}
      <div style={{ marginTop: "20px", background: "var(--preview-surface)", borderRadius: "14px", padding: "12px 18px", border: "1px solid var(--preview-border)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#666" }}>Quick Actions</span>
        {["👤 Add Lead", "🧾 Create Quote", "🛒 New Order", "📅 Schedule Follow Up"].map(a => (
          <div key={a} style={{ fontSize: "12px", padding: "6px 12px", background: "#f7f7f7", borderRadius: "8px", color: "#333", fontWeight: 500, cursor: "pointer" }}>{a}</div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// VERSION B — tightened (bigger numbers, cleaner alerts, real sparklines)
// ────────────────────────────────────────────────────────────
function VersionB() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Business overview</h1>
        <div style={{ fontSize: "13px", color: "#666" }}>Jun 1 – Jun 30 · vs previous 30 days</div>
      </div>

      {/* Bigger, breathier KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "16px", marginBottom: "18px" }}>
        <BigDarkKpi label="Cash Collected" value="$88,020" delta="+18%" sub="of $75K target · 117%" />
        <ThreeLineKpi label="Pipeline" value="$48.7K" tag="83 open deals" sub={[["Draft", "$15.2K"], ["Sent", "$23.5K"], ["Awaiting", "$10.0K"]]} />
        <ThreeLineKpi label="Orders Released" value="71" tag="+22% MoM" sub={[["In production", "46"], ["Ready to ship", "18"], ["Shipped", "7"]]} />
        <ThreeLineKpi label="Awaiting Collection" value="$78.6K" tag="38 open orders" health warn sub={[["0–30d", "$41.2K"], ["30–60d", "$26.4K"], ["60d+", "$11.0K · flagged"]]} />
      </div>

      {/* Combined alerts + funnel in a single wider row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "16px", marginBottom: "22px" }}>
        <div style={{ background: "var(--preview-surface)", borderRadius: "14px", padding: "20px", border: "1px solid var(--preview-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>Needs your attention</div>
            <div style={{ fontSize: "11px", color: "#888" }}>Rules · <span style={{ color: ACCENT, fontWeight: 600 }}>Configure</span></div>
          </div>
          {[
            { count: "8", text: "Quotes waiting >48h", severity: "high" },
            { count: "14", text: "Leads not contacted in 24h", severity: "med" },
            { count: "6", text: "Orders past due date", severity: "med" },
            { count: "5", text: "Customers waiting for callback", severity: "med" },
            { count: "3", text: "Rush orders not started", severity: "high" },
          ].map(a => <TightAlertRow key={a.text} {...a} />)}
        </div>
        <div style={{ background: "var(--preview-surface)", borderRadius: "14px", padding: "20px", border: "1px solid var(--preview-border)" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px" }}>Revenue funnel · last 30 days</div>
          <FunnelStepB label="Lead Value" value="$2.4M" percent={100} />
          <FunnelStepB label="Quoted" value="$1.8M" percent={75} sub="75% conversion" />
          <FunnelStepB label="Released to production" value="$820K" percent={34} sub="46% of quoted" />
          <FunnelStepB label="Cash collected" value="$88K" percent={4} sub="10% of released — rest in AR" last />
        </div>
      </div>

      {/* Team as compact table */}
      <div style={{ background: "var(--preview-surface)", borderRadius: "14px", padding: "20px", border: "1px solid var(--preview-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>Team performance · sorted by score</div>
          <div style={{ fontSize: "12px", color: ACCENT, fontWeight: 600 }}>View full team →</div>
        </div>
        <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#888", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Rep</th>
              <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Score</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600 }}>Quotes</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600 }}>Won</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600 }}>Conv</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600 }}>Response</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600 }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Azat Aslanean", "Sales", 92, "Excellent", "#16a34a", 16, 5, "31%", "18m", "$12.4K"],
              ["Manny Carlo", "SDR", 78, "Good", "#2563eb", 27, 15, "56%", "6m", "—"],
              ["Ernesto", "Sales", 71, "Good", "#2563eb", 18, 4, "22%", "12m", "$26.4K"],
              ["Maria Hakobyan", "Sales", 64, "Needs Attention", "#f59e0b", 11, 2, "18%", "32m", "$4.3K"],
              ["Davit Zargaryan", "Sales", 58, "Needs Attention", "#f59e0b", 5, 1, "20%", "45m", "$92"],
              ["Gary Matevosyan", "Sales", 48, "Needs Review", "#dc2626", 9, 1, "11%", "1h 52m", "$1.2K"],
            ].map((r: any) => (
              <tr key={r[0]} style={{ borderTop: "1px solid #f4f4f4" }}>
                <td style={{ padding: "12px 0" }}>
                  <div style={{ fontWeight: 700, color: "#171717" }}>{r[0]}</div>
                  <div style={{ fontSize: "11px", color: "#888" }}>{r[1]}</div>
                </td>
                <td style={{ padding: "12px 0" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "20px", fontWeight: 800, color: r[4] }}>{r[2]}</span>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: r[4] }}>{r[3]}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 600 }}>{r[5]}</td>
                <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 600 }}>{r[6]}</td>
                <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 600 }}>{r[7]}</td>
                <td style={{ padding: "12px 0", textAlign: "right" }}>{r[8]}</td>
                <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 600 }}>{r[9]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// VERSION C — Attio/Linear-style dense
// ────────────────────────────────────────────────────────────
function VersionC() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#888", letterSpacing: "0.06em", textTransform: "uppercase" }}>BazaarPrinting · Admin</div>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>Overview</h1>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {["Today", "Yesterday", "7d", "30d", "90d", "Custom"].map((p, i) => (
            <div key={p} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", background: i === 3 ? "#171717" : "transparent", color: i === 3 ? "#fff" : "#666", fontWeight: i === 3 ? 600 : 400, cursor: "pointer", border: i === 3 ? "1px solid #171717" : "1px solid transparent" }}>{p}</div>
          ))}
        </div>
      </div>

      {/* 8 tiny metric tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", background: "#e5e5e5", border: "1px solid var(--preview-border)", borderRadius: "12px", overflow: "hidden", marginBottom: "24px" }}>
        <DenseTile label="Cash Collected" value="$88,020" delta="+18%" good />
        <DenseTile label="Pipeline Value" value="$48.7K" delta="+12%" good />
        <DenseTile label="Orders Released" value="71" delta="+22%" good />
        <DenseTile label="Total Leads" value="57" delta="+8%" good />
        <DenseTile label="Conversion Rate" value="12.4%" delta="+2.1%" good />
        <DenseTile label="Avg Response Time" value="14m" delta="-32%" good />
        <DenseTile label="Awaiting Collection" value="$78.6K" delta="3 flagged" warn />
        <DenseTile label="Active Reps" value="4/6" delta="2 idle" warn />
      </div>

      {/* Two column: attention list + funnel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>Attention queue</div>
            <div style={{ fontSize: "11px", color: "#888" }}>7 items · <span style={{ color: ACCENT, fontWeight: 600 }}>Rules</span></div>
          </div>
          {[
            ["Q", "8", "Quotes >48h no reply", "#dc2626"],
            ["L", "14", "Leads uncontacted", "#f59e0b"],
            ["O", "6", "Orders past due", "#f59e0b"],
            ["C", "5", "Callback owed", "#f59e0b"],
            ["R", "3", "Rush not started", "#7c3aed"],
          ].map((a: any) => (
            <div key={a[2]} style={{ padding: "10px 16px", borderTop: "1px solid #f4f4f4", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <span style={{ width: "20px", height: "20px", borderRadius: "4px", background: a[3] + "22", color: a[3], fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{a[0]}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: a[3], minWidth: "24px" }}>{a[1]}</span>
              <span style={{ fontSize: "12px", color: "#333", flex: 1 }}>{a[2]}</span>
              <span style={{ fontSize: "12px", color: "#bbb" }}>›</span>
            </div>
          ))}
        </div>
        <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", padding: "12px 16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px" }}>Funnel · last 30 days</div>
          {[
            ["New Leads", "57", 100, "#0a0a0a"],
            ["Contacted", "32", 56, "#333"],
            ["Qualified", "20", 35, "#555"],
            ["Quoted", "23", 40, "#777"],
            ["Won", "9", 16, "#999"],
          ].map((s: any, i) => (
            <div key={s[0]} style={{ marginBottom: i === 4 ? 0 : "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontSize: "12px", color: "#666" }}>{s[0]}</span>
                <span style={{ fontSize: "12px", fontWeight: 700 }}>{s[1]}</span>
              </div>
              <div style={{ height: "4px", background: "#f4f4f4", borderRadius: "999px", overflow: "hidden" }}>
                <div style={{ width: `${s[2]}%`, height: "100%", background: s[3] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team leaderboard, single line per person */}
      <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", fontSize: "13px", fontWeight: 700 }}>Team leaderboard</div>
        {[
          ["Azat Aslanean", "Sales", 92, "#16a34a"],
          ["Manny Carlo", "SDR", 78, "#2563eb"],
          ["Ernesto", "Sales", 71, "#2563eb"],
          ["Maria Hakobyan", "Sales", 64, "#f59e0b"],
          ["Davit Zargaryan", "Sales", 58, "#f59e0b"],
          ["Gary Matevosyan", "Sales", 48, "#dc2626"],
        ].map((r: any, i) => (
          <div key={r[0]} style={{ padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #f4f4f4", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "11px", color: "#888", minWidth: "20px" }}>#{i + 1}</span>
            <span style={{ fontSize: "13px", fontWeight: 700, flex: 1 }}>{r[0]}</span>
            <span style={{ fontSize: "11px", color: "#888", minWidth: "50px" }}>{r[1]}</span>
            <div style={{ flex: 2, height: "6px", background: "#f4f4f4", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{ width: `${r[2]}%`, height: "100%", background: r[3] }} />
            </div>
            <span style={{ fontSize: "14px", fontWeight: 800, color: r[3], minWidth: "40px", textAlign: "right" }}>{r[2]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Shared card components
// ────────────────────────────────────────────────────────────

function MoneyPositionCardA() {
  // Narrow column · all rows stack vertically · every piece of info preserved
  return (
    <div style={{ background: "var(--preview-surface)", color: "var(--preview-text)", borderRadius: "14px", padding: "18px 20px", border: "1px solid var(--preview-border)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)", lineHeight: 1.2 }}>Money Position<br/>Last 30 days</div>
        <span style={{ fontSize: "10px", color: "var(--preview-text-faint)", cursor: "help" }} title="Money movement across all orders in the last 30 days. Total Orders = total value of all orders created. Payments Collected = money received. Completed & Shipped = shipped orders with balance status. In Production = orders currently in progress.">ⓘ</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <MoneyStackRow icon="🛒" tint="#38bdf8" label="Total Orders"       value="$394,600" sub="119 orders" />
        <MoneyStackRow icon="🚚" tint="#a78bfa" label="Completed & Shipped" value="$151,380" sub="Balance Due · $0 Paid" />
        <MoneyStackRow icon="🏭" tint="#fb923c" label="In Production"      value="$306,580" sub="48 active" />
        <MoneyStackRow icon="💵" tint="#4ade80" label="Payments Collected" value="$88,020"  sub="71 payments" />
      </div>
    </div>
  );
}

function MoneyStackRow({ icon, tint, label, value, sub }: any) {
  return (
    <div style={{ background: "var(--preview-chip-bg)", padding: "8px", borderRadius: "8px", border: "1px solid var(--preview-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
        <div style={{ width: "22px", height: "22px", borderRadius: "5px", background: tint + "22", border: `1px solid ${tint}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>{icon}</div>
        <div style={{ fontSize: "9px", color: tint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.15 }}>{label}</div>
      </div>
      <div style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "9.5px", color: "var(--preview-text-muted)", marginTop: "2px", fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function MoneyRow({ icon, tint, label, value, sub }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--preview-chip-bg)", padding: "5px 7px", borderRadius: "6px", border: "1px solid var(--preview-border)" }}>
      <div style={{ width: "22px", height: "22px", borderRadius: "5px", background: tint + "22", border: `1px solid ${tint}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "8px", color: tint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "-0.4px", lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: "8.5px", color: "var(--preview-text-muted)", marginTop: "1px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
    </div>
  );
}

function OutstandingBreakdownCard() {
  return (
    <div style={{ background: "var(--preview-surface)", color: "var(--preview-text)", borderRadius: "14px", padding: "18px 20px", border: "1px solid var(--preview-border)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)", lineHeight: 1.2 }}>Outstanding<br/>Order Breakdown</div>
        <span style={{ fontSize: "10px", color: "var(--preview-text-faint)" }} title="Where the unpaid $306K sits: in the shop, done from our side, or at risk.">ⓘ</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* In Production */}
        <div style={{ background: "var(--preview-chip-bg)", padding: "8px", borderRadius: "8px", border: "1px solid var(--preview-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "5px", background: "#38bdf822", border: "1px solid #38bdf844", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>⚙️</div>
            <div style={{ fontSize: "9px", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.15 }}>In Production · 32 orders</div>
          </div>
          <div style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1 }}>$155,200</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginTop: "4px", fontSize: "10px", color: "var(--preview-text-muted)" }}>
            <span>Design <b style={{ color: "var(--preview-text)" }}>6</b></span>
            <span>Proof <b style={{ color: "var(--preview-text)" }}>4</b></span>
            <span>Production <b style={{ color: "var(--preview-text)" }}>22</b></span>
          </div>
        </div>

        {/* Completed */}
        <div style={{ background: "var(--preview-chip-bg)", padding: "8px", borderRadius: "8px", border: "1px solid var(--preview-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "5px", background: "#4ade8022", border: "1px solid #4ade8044", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>✅</div>
            <div style={{ fontSize: "9px", color: "#4ade80", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.15 }}>Completed · 16 orders</div>
          </div>
          <div style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1 }}>$151,380</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginTop: "4px", fontSize: "10px", color: "var(--preview-text-muted)" }}>
            <span style={{ color: "#fbbf24" }}>Not Paid <b>$151,380</b> · 16</span>
            <span>Paid/Pending <b style={{ color: "var(--preview-text)" }}>$0</b> · 0</span>
          </div>
        </div>

        {/* Payment Risk */}
        <div style={{ background: "rgba(248,113,113,0.08)", padding: "8px", borderRadius: "8px", border: "1px solid rgba(248,113,113,0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "5px", background: "#f8717122", border: "1px solid #f8717144", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>⚠️</div>
            <div style={{ fontSize: "9px", color: "#f87171", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.15 }}>Payment Risk · 3 orders</div>
          </div>
          <div style={{ fontSize: "17px", fontWeight: 800, color: "#f87171", letterSpacing: "-0.5px", lineHeight: 1 }}>$28,900</div>
          <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--preview-text-muted)" }}>
            Oldest unpaid <b style={{ color: "#f87171" }}>42 days</b>
          </div>
        </div>
      </div>
    </div>
  );
}

function _MoneyPositionCardA_v2_unused() {
  const withUs = [
    { key: "design", label: "In Design",        count: 6,  value: "$18.2K",  color: "#a78bfa" },
    { key: "wait",   label: "Waiting Customer", count: 4,  value: "$12.4K",  color: "#f472b6" },
    { key: "prod",   label: "In Production",    count: 22, value: "$124.6K", color: "#38bdf8" },
  ];
  const doneFromUs = [
    { key: "done",   label: "Completed",        count: 8,  value: "$28.4K",  color: "#818cf8" },
    { key: "ship",   label: "Shipped",          count: 8,  value: "$123.0K", color: "#fbbf24" },
  ];
  return (
    <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: "14px", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)" }}>Money Position · Last 30 days</div>
        <span style={{ fontSize: "10px", color: "var(--preview-text-faint)" }} title="Total sold this month vs cash actually collected, plus where the unpaid balance sits.">ⓘ</span>
      </div>

      {/* Two hero numbers */}
      <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Booked</div>
          <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-1px", marginTop: "2px" }}>$394.6K</div>
          <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "2px" }}>
            <span style={{ color: "#38bdf8", fontWeight: 700 }}>119 orders</span> · <span style={{ color: "#4ade80", fontWeight: 700 }}>↗ 22%</span> vs May
          </div>
        </div>
        <div style={{ paddingLeft: "12px", borderLeft: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.06em" }}>Cash Collected</div>
          <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-1px", marginTop: "2px" }}>$88,020</div>
          <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "2px" }}>
            <span style={{ color: "#4ade80", fontWeight: 700 }}>71 paid</span> · target 117%
          </div>
        </div>
      </div>

      {/* Cash Collected breakdown: closed vs deposits on ongoing */}
      <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "10.5px" }}>
        <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "6px", padding: "6px 8px" }}>
          <span style={{ color: "var(--preview-text-muted)" }}>From closed orders</span> <span style={{ fontWeight: 800, color: "#4ade80" }}>$62.4K</span>
        </div>
        <div style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: "6px", padding: "6px 8px" }}>
          <span style={{ color: "var(--preview-text-muted)" }}>Deposits on ongoing</span> <span style={{ fontWeight: 800, color: "#38bdf8" }}>$25.6K</span>
        </div>
      </div>

      <div style={{ marginTop: "8px", fontSize: "10px", color: "var(--preview-text-muted)" }}>
        <span style={{ color: "#fbbf24", fontWeight: 600 }}>$306.6K</span> still owed · <span style={{ color: "var(--preview-text)", fontWeight: 600 }}>48 active orders</span>
      </div>

      <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "12px" }}>
        <div style={{ fontSize: "10px", color: "var(--preview-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "10px" }}>Workflow · where the $306.6K unpaid sits</div>

        {/* STILL WITH US supersection */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: "6px", padding: "6px 10px" }}>
            <span style={{ fontSize: "10px", fontWeight: 800, color: "#38bdf8", letterSpacing: "0.04em", textTransform: "uppercase" }}>▶ Still with us · in the shop</span>
            <span style={{ fontSize: "11px", fontWeight: 700 }}>32 orders · <span style={{ color: "#38bdf8" }}>$155.2K</span></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
            {withUs.map((s, i) => (
              <div key={s.key} style={{ position: "relative", background: "var(--preview-chip-bg)", borderRadius: "6px", padding: "6px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <div style={{ fontSize: "8px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "5px", marginTop: "3px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--preview-text)" }}>{s.value}</span>
                </div>
                {i < withUs.length - 1 && (
                  <span style={{ position: "absolute", right: "-4px", top: "12px", color: "rgba(255,255,255,0.22)", fontSize: "11px" }}>›</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* DONE FROM OUR SIDE supersection */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "6px", padding: "6px 10px" }}>
            <span style={{ fontSize: "10px", fontWeight: 800, color: "#fbbf24", letterSpacing: "0.04em", textTransform: "uppercase" }}>✓ Done from our side · awaiting delivery / final payment</span>
            <span style={{ fontSize: "11px", fontWeight: 700 }}>16 orders · <span style={{ color: "#fbbf24" }}>$151.4K</span></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px" }}>
            {doneFromUs.map((s, i) => (
              <div key={s.key} style={{ position: "relative", background: "var(--preview-chip-bg)", borderRadius: "6px", padding: "6px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <div style={{ fontSize: "8px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "5px", marginTop: "3px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--preview-text)" }}>{s.value}</span>
                </div>
                {i < doneFromUs.length - 1 && (
                  <span style={{ position: "absolute", right: "-4px", top: "12px", color: "rgba(255,255,255,0.22)", fontSize: "11px" }}>›</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "10px", fontSize: "10px", color: "var(--preview-text-muted)" }}>
          <span style={{ color: "#fbbf24", fontWeight: 600 }}>3 shipped orders flagged for late payment</span>
        </div>
      </div>
    </div>
  );
}

function LeadsCardA() {
  return (
    <div style={{ background: "var(--preview-surface)", color: "var(--preview-text)", borderRadius: "14px", padding: "18px 20px", border: "1px solid var(--preview-border)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)", lineHeight: 1.2 }}>Total Leads</div>
        <span style={{ fontSize: "10px", color: "var(--preview-text-faint)" }} title="Full stage breakdown lives in the funnel below">ⓘ</span>
      </div>
      <div style={{ fontSize: "22px", fontWeight: 800, marginTop: "6px", letterSpacing: "-0.5px" }}>57</div>
      <div style={{ fontSize: "10px", marginTop: "2px", color: "var(--preview-text-muted)" }}>
        <span style={{ color: "#4ade80", fontWeight: 700 }}>↗ 8%</span>
        <span style={{ marginLeft: "6px" }}>vs last 30 days</span>
      </div>
      <svg width="100%" height="24" viewBox="0 0 200 24" style={{ marginTop: "8px" }}>
        <polyline points="0,17 20,15 40,19 60,13 80,16 100,11 120,14 140,9 160,11 180,6 200,4" stroke="#3b82f6" strokeWidth={1.4} fill="none" />
      </svg>
      <div style={{ marginTop: "10px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "8px", padding: "8px 10px", cursor: "pointer" }}>
        <div style={{ fontSize: "9px", color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Needs action</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "3px" }}>
          <span style={{ fontSize: "20px", fontWeight: 800, color: "#fbbf24" }}>14</span>
          <span style={{ fontSize: "10px", color: "#fbbf24", fontWeight: 600 }}>uncontacted &gt; 24h</span>
        </div>
        <div style={{ fontSize: "9.5px", color: "#fbbf24", marginTop: "3px", fontWeight: 600 }}>Assign now →</div>
      </div>
    </div>
  );
}

function SubMetricCard({ label, value, delta, period, sub, sparkline, hint }: any) {
  const sparkColor = sparkline === "purple" ? "#a78bfa" : sparkline === "green" ? "#22c55e" : "#3b82f6";
  return (
    <div style={{ background: "var(--preview-surface)", color: "var(--preview-text)", borderRadius: "14px", padding: "18px 20px", border: "1px solid var(--preview-border)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)", lineHeight: 1.2 }}>{label}</div>
        <span style={{ fontSize: "10px", color: "var(--preview-text-faint)" }} title={hint}>ⓘ</span>
      </div>
      <div style={{ fontSize: "22px", fontWeight: 800, marginTop: "6px", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ fontSize: "10px", marginTop: "2px", color: "var(--preview-text-muted)" }}>
        <span style={{ color: "#4ade80", fontWeight: 700 }}>{delta}</span>
        <span style={{ marginLeft: "6px" }}>{period}</span>
      </div>
      <svg width="100%" height="24" viewBox="0 0 200 24" style={{ marginTop: "8px" }}>
        <polyline points="0,17 20,15 40,19 60,13 80,16 100,11 120,14 140,9 160,11 180,6 200,4" stroke={sparkColor} strokeWidth={1.4} fill="none" />
      </svg>
      <div style={{ marginTop: "8px", borderTop: "1px solid var(--preview-border)", paddingTop: "8px" }}>
        {sub.map((s: any) => (
          <div key={s.label} style={{ padding: "3px 0", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ color: "var(--preview-text)", fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontWeight: 700 }}>{s.value}</span>
            </div>
            {s.note && <div style={{ fontSize: "9.5px", color: "var(--preview-text-muted)", marginTop: "1px" }}>{s.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversionCardA() {
  return (
    <div style={{ background: "var(--preview-surface)", color: "var(--preview-text)", borderRadius: "14px", padding: "18px 20px", border: "1px solid var(--preview-border)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--preview-text-muted)", lineHeight: 1.2 }}>Conversion Rate</div>
        <span style={{ fontSize: "10px", color: "var(--preview-text-faint)" }}>ⓘ</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
        <svg width="58" height="58" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r="28" stroke="var(--preview-chip-border)" strokeWidth={8} fill="none" />
          <circle cx="35" cy="35" r="28" stroke="#a78bfa" strokeWidth={8} fill="none" strokeDasharray="176" strokeDashoffset="154" strokeLinecap="round" transform="rotate(-90 35 35)" />
          <text x="35" y="40" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--preview-text)">12.4%</text>
        </svg>
        <div>
          <div style={{ fontSize: "11px", color: "#4ade80", fontWeight: 700 }}>↗ 2.1%</div>
          <div style={{ fontSize: "9.5px", color: "var(--preview-text-muted)" }}>vs last 30 days</div>
        </div>
      </div>
      <div style={{ marginTop: "10px", borderTop: "1px solid var(--preview-border)", paddingTop: "8px" }}>
        {[["Quotes Sent", "23"], ["Orders Won", "9"], ["Conversion Rate", "12.4%"]].map(r => (
          <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "11px" }}>
            <span style={{ color: "var(--preview-text)" }}>{r[0]}</span>
            <span style={{ fontWeight: 700 }}>{r[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsPanelA() {
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "14px", padding: "16px 18px", border: "1px solid var(--preview-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div style={{ background: "#fef2f2", color: "#dc2626", width: "26px", height: "26px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>⚠</div>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Alerts &amp; Actions</div>
        <div style={{ marginLeft: "auto", background: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>7</div>
      </div>
      {[
        ["red", "8", "Quotes waiting more than 48h"],
        ["amber", "14", "Leads not contacted"],
        ["amber", "6", "Orders past due date"],
        ["amber", "5", "Customers waiting for callback"],
        ["purple", "3", "Rush orders not started"],
      ].map((a: any) => {
        const bg = a[0] === "red" ? "#fef2f2" : a[0] === "amber" ? "#fffbeb" : "#f5f3ff";
        const c = a[0] === "red" ? "#dc2626" : a[0] === "amber" ? "#d97706" : "#7c3aed";
        return (
          <div key={a[2]} style={{ padding: "9px 4px", borderTop: "1px solid #f4f4f4", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <div style={{ background: bg, color: c, width: "22px", height: "22px", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px" }}>⚠</div>
            <div style={{ background: bg, color: c, fontSize: "11px", fontWeight: 700, padding: "2px 6px", borderRadius: "5px", minWidth: "24px", textAlign: "center" }}>{a[1]}</div>
            <div style={{ fontSize: "12px", color: "#333", flex: 1 }}>{a[2]}</div>
            <span style={{ fontSize: "12px", color: "#bbb" }}>›</span>
          </div>
        );
      })}
      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #f4f4f4", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
        <span style={{ fontSize: "12px", color: "#666", fontWeight: 500 }}>View all alerts</span>
        <span style={{ fontSize: "13px", color: "#bbb" }}>›</span>
      </div>
    </div>
  );
}

function FunnelPanelA() {
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

function AiPanelA() {
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "14px", padding: "16px 18px", border: "1px solid var(--preview-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div style={{ background: "linear-gradient(135deg, #a78bfa, #ec4899)", color: "#fff", width: "26px", height: "26px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>✨</div>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Nova AI Insights</div>
        <div style={{ marginLeft: "auto", background: "linear-gradient(135deg, #ede9fe, #fce7f3)", color: "#7c3aed", fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px" }}>BETA</div>
      </div>
      {[
        ["#dc2626", "Gary has 14 leads waiting more than 48h", "View leads"],
        ["#2563eb", "4 quotes have high chance to close this week", "View quotes"],
        ["#16a34a", "Maria's response time improved by 32%", "View details"],
        ["#f59e0b", "8 quotes worth $47,000 not followed up", "View quotes"],
        ["#7c3aed", "Production capacity will reach 92% Thursday", "View forecast"],
      ].map((r: any) => (
        <div key={r[1]} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 2px", borderTop: "1px solid #f4f4f4", cursor: "pointer" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: r[0], flexShrink: 0 }} />
          <div style={{ fontSize: "12px", color: "#333", flex: 1, lineHeight: 1.4 }}>{r[1]}</div>
          <span style={{ fontSize: "11px", color: ACCENT, fontWeight: 600 }}>{r[2]} →</span>
        </div>
      ))}
      <div style={{ marginTop: "8px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", color: "#888" }}>Ask Nova anything…</span>
        <span style={{ fontSize: "12px", color: ACCENT }}>➤</span>
      </div>
    </div>
  );
}

function ScoreCard({ initials, name, role, score, label, color, rank, top, bottom }: any) {
  // Tier tint for score chip. Card border stays neutral;
  // the colored accent is a fading top glow (ChatGPT style).
  const tint = color + "1A"; // hex + 10% alpha
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

// ─── Version B helpers ─────────────────────────────
function BigDarkKpi({ label, value, delta, sub }: any) {
  return (
    <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: "16px", padding: "24px 26px" }}>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "44px", fontWeight: 800, letterSpacing: "-1.5px", marginTop: "10px" }}>{value}</div>
      <div style={{ marginTop: "4px" }}>
        <span style={{ fontSize: "14px", color: "#4ade80", fontWeight: 700 }}>{delta}</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginLeft: "8px" }}>{sub}</span>
      </div>
      <svg width="100%" height="46" viewBox="0 0 260 46" style={{ marginTop: "16px" }}>
        <path d="M0,38 L26,34 L52,36 L78,28 L104,30 L130,22 L156,24 L182,16 L208,18 L234,12 L260,8" stroke="#4ade80" strokeWidth={1.8} fill="none" />
      </svg>
    </div>
  );
}

function ThreeLineKpi({ label, value, tag, sub, health, warn }: any) {
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "16px", padding: "18px 20px", border: "1px solid " + (warn ? "#fed7aa" : "var(--preview-border)"), position: "relative" }}>
      {health && <div style={{ position: "absolute", top: "12px", right: "12px", width: "8px", height: "8px", borderRadius: "50%", background: warn ? "#dc2626" : "#16a34a" }} />}
      <div style={{ fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "32px", fontWeight: 800, marginTop: "6px", letterSpacing: "-1px" }}>{value}</div>
      <div style={{ fontSize: "11px", color: warn ? "#c2410c" : "#888", marginTop: "2px", fontWeight: 500 }}>{tag}</div>
      <div style={{ marginTop: "12px", borderTop: "1px solid #f4f4f4", paddingTop: "10px" }}>
        {sub.map((row: any) => (
          <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
            <span style={{ color: "#666" }}>{row[0]}</span>
            <span style={{ fontWeight: 700 }}>{row[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TightAlertRow({ count, text, severity }: any) {
  const bg = severity === "high" ? "#fef2f2" : "#fffbeb";
  const c = severity === "high" ? "#dc2626" : "#d97706";
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid #f4f4f4", display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ background: bg, color: c, minWidth: "34px", textAlign: "center", padding: "4px 8px", borderRadius: "6px", fontSize: "13px", fontWeight: 800 }}>{count}</div>
      <div style={{ fontSize: "13px", color: "#333", flex: 1 }}>{text}</div>
      <span style={{ fontSize: "13px", color: ACCENT, fontWeight: 600, whiteSpace: "nowrap" }}>Review →</span>
    </div>
  );
}

function FunnelStepB({ label, value, percent, sub, last }: any) {
  return (
    <div style={{ marginBottom: last ? 0 : "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
        <div style={{ fontSize: "13px", fontWeight: 500 }}>{label}</div>
        <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
          <span style={{ fontSize: "15px", fontWeight: 800 }}>{value}</span>
          {sub && <span style={{ fontSize: "11px", color: "#888" }}>{sub}</span>}
        </div>
      </div>
      <div style={{ height: "8px", background: "#f1f1f1", borderRadius: "999px", overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: ACCENT, borderRadius: "999px" }} />
      </div>
    </div>
  );
}

// ─── Version C helpers ─────────────────────────────
function DenseTile({ label, value, delta, good, warn }: any) {
  const c = warn ? "#c2410c" : good ? "#16a34a" : "#dc2626";
  return (
    <div style={{ background: "var(--preview-surface)", padding: "12px 14px" }}>
      <div style={{ fontSize: "10px", color: "#999", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 800, marginTop: "4px", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ fontSize: "11px", color: c, fontWeight: 700, marginTop: "2px" }}>{delta}</div>
    </div>
  );
}
