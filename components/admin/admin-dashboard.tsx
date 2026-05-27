"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency as formatMoney } from "@/lib/utils/format";
import { KPI_HELP } from "@/lib/utils/kpi-help-text";
import type { TeamMemberMetrics } from "@/lib/utils/team-dashboard-metrics";
import { KpiHelpLine } from "@/components/ui/kpi-help-line";
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  DollarSign,
  AlertTriangle,
  Circle,
} from "lucide-react";
import { DashboardDateRangeFilter } from "@/components/ui/dashboard-date-range-filter";
import {
  defaultDashboardDateRangeFilterValue,
  type DashboardDateRangeFilterValue,
} from "@/lib/utils/dashboard-date-range-filter";
import type { SdrDashboardPreset } from "@/lib/utils/sdr-dashboard-date-range";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminKpis {
  range?: {
    preset: SdrDashboardPreset;
    label: string;
    start_iso: string;
    end_iso: string;
  };
  total_leads: number;
  open_leads: number;
  claimed_leads: number;
  pipeline_leads: number;
  quoted_leads: number;
  ordered_leads: number;
  inbox_leads: number;
  routed_leads: number;
  won_leads: number;
  cash_collected: number;
  pipeline_value: number;
  team_member_metrics: Record<string, TeamMemberMetrics>;
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
  help,
  icon,
  accent = false,
  subStats,
}: {
  label: string;
  value: string | number;
  subtext: string;
  help?: string;
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
        {help && <KpiHelpLine text={help} variant={accent ? "accent" : "default"} />}
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

// ─── Team member work metrics (below session row) ────────────────────────────

function MetricCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-[13px] font-semibold tabular-nums"
        style={{ color: valueColor ?? "var(--color-text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

function TeamMemberWorkMetrics({
  role,
  metrics,
  periodLabel,
}: {
  role: string;
  metrics: TeamMemberMetrics | undefined;
  periodLabel: string;
}) {
  if (!metrics) return null;

  const hasSdr =
    role === "sdr" &&
    (metrics.handled > 0 ||
      metrics.routed > 0 ||
      metrics.rejected > 0 ||
      metrics.sourced_cash > 0);
  const hasSales =
    role === "sales" &&
    (metrics.cash_collected > 0 ||
      metrics.released_order_value > 0 ||
      metrics.awaiting_collection > 0 ||
      metrics.pipeline_value > 0);

  if (!hasSdr && !hasSales) return null;

  return (
    <div className="space-y-1.5 pt-1" style={{ borderTop: "1px solid var(--color-border)" }}>
      {role === "sdr" && hasSdr && (
        <div className="grid grid-cols-3 gap-2">
          <MetricCell label="Handled" value={metrics.handled} />
          <MetricCell label="Routed" value={metrics.routed} valueColor="var(--color-success)" />
          <MetricCell label="Sourced" value={formatMoney(metrics.sourced_cash)} />
        </div>
      )}
      {role === "sales" && hasSales && (
        <div className="grid grid-cols-3 gap-2">
          <MetricCell label="Collected" value={formatMoney(metrics.cash_collected)} />
          <MetricCell label="Released" value={formatMoney(metrics.released_order_value)} />
          <MetricCell
            label="Balance due"
            value={formatMoney(metrics.awaiting_collection)}
            valueColor={
              metrics.awaiting_collection > 0 ? "var(--color-warning)" : undefined
            }
          />
        </div>
      )}
      <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
        {role === "sales" && metrics.awaiting_collection > 0
          ? `${periodLabel.toLowerCase()} · balance due is live snapshot`
          : periodLabel.toLowerCase()}
      </p>
    </div>
  );
}

function TeamSection({
  periodLabel,
  teamMetrics,
}: {
  periodLabel: string;
  teamMetrics: Record<string, TeamMemberMetrics>;
}) {
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
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Team
        </h2>
        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          Sessions · last 7 days · work metrics · {periodLabel.toLowerCase()}
        </span>
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

              <TeamMemberWorkMetrics
                role={m.role_name}
                metrics={teamMetrics[m.id]}
                periodLabel={periodLabel}
              />

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
  const [filter, setFilter] = useState<DashboardDateRangeFilterValue>(() =>
    defaultDashboardDateRangeFilterValue("last_week"),
  );
  const [data, setData] = useState<AdminKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const buildQuery = useCallback((f: DashboardDateRangeFilterValue) => {
    const params = new URLSearchParams();
    if (f.preset === "custom") {
      params.set("admin_preset", "custom");
      params.set("date_from", f.dateFrom);
      params.set("date_to", f.dateTo);
    } else {
      params.set("admin_preset", f.preset);
    }
    return params.toString();
  }, []);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    const [res] = await Promise.all([
      fetch(`/api/dashboard/kpis?${buildQuery(filter)}`),
      new Promise((r) => setTimeout(r, 300)),
    ]);
    const json = await res.json();
    if (res.ok) setData(json as AdminKpis);
    setLoading(false);
  }, [filter, buildQuery]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  // Silent re-fetch when any lead changes (Realtime → sidebar → bazaar:leads-changed).
  // Does NOT set loading=true so the cards don't flash skeleton.
  useEffect(() => {
    function onLeadsChanged() {
      fetch(`/api/dashboard/kpis?${buildQuery(filter)}`)
        .then((r) => r.json())
        .then((json) => setData(json as AdminKpis))
        .catch(() => {});
    }
    window.addEventListener("bazaar:leads-changed", onLeadsChanged);
    return () => window.removeEventListener("bazaar:leads-changed", onLeadsChanged);
  }, [filter, buildQuery]);

  const periodLabel = data?.range?.label ?? "Last 7 Days";

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Dashboard
        </h1>
        <DashboardDateRangeFilter value={filter} onChange={setFilter} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : data ? (
          <>
            <KpiCard
              label="Cash Collected"
              value={formatMoney(data.cash_collected)}
              subtext={periodLabel.toLowerCase()}
              help={KPI_HELP.cash_collected}
              icon={<DollarSign className="h-4 w-4" />}
              accent
            />
            <KpiCard
              label="Pipeline Value"
              value={formatCurrency(data.pipeline_value)}
              subtext="current total"
              help={KPI_HELP.pipeline_value}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <KpiCard
              label="Total Leads"
              value={data.total_leads}
              subtext={periodLabel.toLowerCase()}
              help={KPI_HELP.total_leads}
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
              help={KPI_HELP.inbox_leads}
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              label="Routed to Sales"
              value={data.routed_leads}
              subtext="active pipeline"
              help={KPI_HELP.routed_to_sales}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Won"
              value={data.won_leads}
              subtext={periodLabel.toLowerCase()}
              help={KPI_HELP.won}
              icon={<CheckCircle className="h-4 w-4" />}
            />
          </>
        ) : null}
      </div>

      {!loading && data && (
        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          Cash collected matches Reports for the same period. Order value, balances due, and payment
          ledger are on{" "}
          <Link
            href="/reports"
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--color-accent-dark)" }}
          >
            Reports
          </Link>
          .
        </p>
      )}

      {/* Team */}
      {!loading && data && (
        <TeamSection periodLabel={periodLabel} teamMetrics={data.team_member_metrics ?? {}} />
      )}

    </div>
  );
}
