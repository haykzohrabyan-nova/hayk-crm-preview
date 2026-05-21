"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  DollarSign,
  AlertTriangle,
  Circle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "quarter";

interface SdrPerformanceRow {
  id: string;
  full_name: string;
  handled: number;
  routed: number;
  rejected: number;
  quote_value: number;
  share_pct: number;
}

interface BreakdownItem {
  reason?: string;
  source?: string;
  count: number;
}

interface AdminKpis {
  total_leads: number;
  open_leads: number;
  claimed_leads: number;
  pipeline_leads: number;
  quoted_leads: number;
  ordered_leads: number;
  inbox_leads: number;
  routed_leads: number;
  won_leads: number;
  total_revenue: number;
  pipeline_value: number;
  sdr_performance: SdrPerformanceRow[];
  rejection_reasons: BreakdownItem[];
  source_breakdown: BreakdownItem[];
}

interface TeamMember {
  id: string;
  full_name: string | null;
  role_name: string;
  role_display_name: string;
  claimed_leads: number;
  last_sign_in_at: string | null;
}

interface SessionSummary {
  user_id: string;
  total_sessions: number;
  total_minutes: number;
  last_signed_in_at: string | null;
  currently_active: boolean;
  auto_signouts: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function isOnline(lastSignIn: string | null): boolean {
  if (!lastSignIn) return false;
  return Date.now() - new Date(lastSignIn).getTime() < 8 * 60 * 60 * 1000;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  admin: { bg: "var(--color-badge-bg)",   color: "var(--color-badge-text)" },
  sdr:   { bg: "var(--color-info-bg)",    color: "var(--color-info-text)" },
  sales: { bg: "var(--color-success-bg)", color: "var(--color-success)" },
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtext,
  icon,
  accent = false,
  subStats,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  accent?: boolean;
  subStats?: { label: string; value: number; color: string }[];
}) {
  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-3"
      style={{
        background: accent ? "var(--color-btn-verify-bg)" : "var(--color-surface)",
        borderColor: accent ? "transparent" : "var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{
            color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
            opacity: accent ? 0.75 : 1,
          }}
        >
          {label}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[8px]"
          style={{
            background: accent
              ? "rgba(255,255,255,0.15)"
              : "color-mix(in srgb, var(--color-accent) 12%, transparent)",
          }}
        >
          <span style={{ color: accent ? "var(--color-btn-verify-text)" : "var(--color-accent)" }}>
            {icon}
          </span>
        </div>
      </div>
      <div>
        <p
          className="text-[28px] font-semibold leading-none"
          style={{ color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-primary)" }}
        >
          {value}
        </p>
        <p
          className="mt-1 text-[12px]"
          style={{
            color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
            opacity: accent ? 0.7 : 1,
          }}
        >
          {subtext}
        </p>
        {subStats && subStats.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            {subStats.map((s) => (
              <span
                key={s.label}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: s.color }}
                />
                {s.label}: {s.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-3"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-8 w-8 animate-pulse rounded-[8px]" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="space-y-2">
        <div className="h-8 w-20 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-3 w-16 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
      </div>
    </div>
  );
}

// ─── Quick Action ─────────────────────────────────────────────────────────────

// ─── Team Section ─────────────────────────────────────────────────────────────

function TeamSection() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    // Fetch team roster and 7-day session summaries in parallel
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      fetch("/api/admin/team").then((r) => r.json()),
      fetch(`/api/admin/sessions?from=${sevenDaysAgo}&limit=500`).then((r) => r.json()),
    ])
      .then(([teamData, sessionData]) => {
        setMembers(teamData.members ?? []);
        setSessions(sessionData.summary ?? []);
      })
      .catch(() => {});
  }, []);

  if (!members || members.length === 0) return null;

  // Build a lookup map: user_id → session summary
  const sessionMap = new Map<string, SessionSummary>(
    sessions.map((s) => [s.user_id, s])
  );
  const activeNow = sessions.filter((s) => s.currently_active).length;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Team
        </h2>
        {activeNow > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
          >
            <Circle className="h-1.5 w-1.5 fill-current" />
            {activeNow} active now
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => {
          const initial = m.full_name?.trim()[0]?.toUpperCase() ?? "?";
          const sess = sessionMap.get(m.id);
          const active = sess?.currently_active ?? false;
          const roleStyle = ROLE_STYLES[m.role_name] ?? { bg: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" };

          return (
            <div
              key={m.id}
              className="rounded-[10px] border p-4 space-y-3"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              {/* Header: avatar + name + role + online */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold"
                      style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                    >
                      {initial}
                    </div>
                    <span
                      className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full"
                      style={{
                        background: active ? "var(--color-success)" : "var(--color-border)",
                        outline: "2px solid var(--color-surface)",
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {m.full_name ?? "—"}
                    </p>
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                      style={{ background: roleStyle.bg, color: roleStyle.color }}
                    >
                      {m.role_display_name}
                    </span>
                  </div>
                </div>

                {/* Auto sign-out warning */}
                {sess && sess.auto_signouts > 0 && (
                  <div
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                    style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {sess.auto_signouts} idle
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 pt-1" style={{ borderTop: "1px solid var(--color-border)" }}>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                    Sessions
                  </p>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {sess?.total_sessions ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                    Active time
                  </p>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {sess ? formatDuration(sess.total_minutes) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                    Last seen
                  </p>
                  <p className="text-[12px] font-medium" style={{ color: active ? "var(--color-success)" : "var(--color-text-muted)" }}>
                    {active
                      ? "Active now"
                      : sess?.last_signed_in_at
                        ? relativeTime(sess.last_signed_in_at)
                        : "—"}
                  </p>
                </div>
              </div>

              {/* Active deals — sales only */}
              {m.role_name === "sales" && m.claimed_leads > 0 && (
                <p className="text-[11px] font-medium" style={{ color: "var(--color-accent-dark)" }}>
                  {m.claimed_leads} active deal{m.claimed_leads !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export function AdminDashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<AdminKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchKpis = useCallback(async () => {
    setLoading(true);
    const [res] = await Promise.all([
      fetch(`/api/dashboard/kpis?period=${period}`),
      new Promise((r) => setTimeout(r, 300)),
    ]);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);


  // Silent re-fetch when any lead changes (Realtime → sidebar → bazaar:leads-changed).
  // Does NOT set loading=true so the cards don't flash skeleton.
  useEffect(() => {
    function onLeadsChanged() {
      fetch(`/api/dashboard/kpis?period=${period}`)
        .then((r) => r.json())
        .then((json) => setData(json))
        .catch(() => {});
    }
    window.addEventListener("bazaar:leads-changed", onLeadsChanged);
    return () => window.removeEventListener("bazaar:leads-changed", onLeadsChanged);
  }, [period]);

  const periodLabel = PERIOD_LABELS[period];

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Dashboard
        </h1>
        <div
          className="flex rounded-[8px] border p-0.5 text-[13px] font-medium"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          {(["week", "month", "quarter"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="rounded-[6px] px-3 py-1.5 transition-all"
              style={{
                background: period === p ? "var(--color-btn-verify-bg)" : "transparent",
                color: period === p ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : data ? (
          <>
            <KpiCard
              label="Total Revenue"
              value={formatCurrency(data.total_revenue)}
              subtext={periodLabel.toLowerCase()}
              icon={<DollarSign className="h-4 w-4" />}
              accent
            />
            <KpiCard
              label="Total Leads"
              value={data.total_leads}
              subtext={periodLabel.toLowerCase()}
              icon={<Users className="h-4 w-4" />}
              subStats={[
                { label: "Open",       value: data.open_leads,      color: "var(--color-success)" },
                { label: "Claimed",    value: data.claimed_leads,    color: "var(--color-accent-dark)" },
                ...(data.pipeline_leads > 0 ? [{ label: "In Pipeline", value: data.pipeline_leads, color: "var(--color-warning)" }] : []),
                ...(data.quoted_leads   > 0 ? [{ label: "Quoted",      value: data.quoted_leads,   color: "var(--color-info-text)" }] : []),
                ...(data.ordered_leads  > 0 ? [{ label: "Ordered",     value: data.ordered_leads,  color: "var(--color-btn-verify-bg)" }] : []),
              ]}
            />
            <KpiCard
              label="In Inbox"
              value={data.inbox_leads}
              subtext="waiting for SDR"
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              label="Routed to Sales"
              value={data.routed_leads}
              subtext="active pipeline"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Won"
              value={data.won_leads}
              subtext={periodLabel.toLowerCase()}
              icon={<CheckCircle className="h-4 w-4" />}
            />
            <KpiCard
              label="Pipeline Value"
              value={formatCurrency(data.pipeline_value)}
              subtext="current total"
              icon={<DollarSign className="h-4 w-4" />}
            />
          </>
        ) : null}
      </div>

      {/* Team */}
      <TeamSection />

      {/* SDR Performance Table */}
      {!loading && data && data.sdr_performance.length > 0 && (
        <section>
          <h2
            className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            SDR Performance — {PERIOD_LABELS[period]}
          </h2>
          <div
            className="rounded-[10px] border overflow-hidden"
            style={{ borderColor: "var(--color-border)" }}
          >
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ background: "var(--color-row-alt)", borderBottom: "1px solid var(--color-border)" }}>
                  {["Name", "Handled", "Routed", "Rejected", "Quote Value", "Share"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left font-medium uppercase tracking-[0.06em] text-[11px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sdr_performance.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{
                      background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                      borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {row.full_name}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>{row.handled}</td>
                    <td className="px-4 py-3" style={{ color: "var(--color-success)" }}>{row.routed}</td>
                    <td className="px-4 py-3" style={{ color: "var(--color-danger)" }}>{row.rejected}</td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                      {formatCurrency(row.quote_value)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${row.share_pct}%`,
                            minWidth: row.share_pct > 0 ? "4px" : "0",
                            maxWidth: "80px",
                            background: "var(--color-accent)",
                          }}
                        />
                        <span style={{ color: "var(--color-text-muted)" }}>{row.share_pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Rejection Reasons + Source Breakdown — 2 col grid */}
      {!loading && data && (data.rejection_reasons.length > 0 || data.source_breakdown.length > 0) && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

          {/* Rejection Reasons */}
          {data.rejection_reasons.length > 0 && (
            <section>
              <h2
                className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Rejection Reasons
              </h2>
              <div
                className="rounded-[10px] border p-4 space-y-3"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                {(() => {
                  const max = data.rejection_reasons[0]?.count ?? 1;
                  return data.rejection_reasons.map((item) => (
                    <div key={item.reason}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] truncate pr-2" style={{ color: "var(--color-text-primary)" }}>
                          {item.reason?.replace(/_/g, " ")}
                        </span>
                        <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--color-text-muted)" }}>
                          {item.count}
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full overflow-hidden"
                        style={{ background: "var(--color-border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round((item.count / max) * 100)}%`,
                            background: "var(--color-danger)",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </section>
          )}

          {/* Source Breakdown */}
          {data.source_breakdown.length > 0 && (
            <section>
              <h2
                className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Lead Sources
              </h2>
              <div
                className="rounded-[10px] border p-4 space-y-3"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                {(() => {
                  const max = data.source_breakdown[0]?.count ?? 1;
                  return data.source_breakdown.map((item) => (
                    <div key={item.source}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] truncate pr-2" style={{ color: "var(--color-text-primary)" }}>
                          {item.source}
                        </span>
                        <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--color-text-muted)" }}>
                          {item.count}
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full overflow-hidden"
                        style={{ background: "var(--color-border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round((item.count / max) * 100)}%`,
                            background: "var(--color-accent)",
                          }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </section>
          )}

        </div>
      )}

    </div>
  );
}
