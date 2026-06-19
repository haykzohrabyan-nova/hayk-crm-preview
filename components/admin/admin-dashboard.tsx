"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { formatCurrency as formatMoney, formatCompact } from "@/lib/utils/format";
import { KPI_HELP } from "@/lib/utils/kpi-help-text";
import type { TeamMemberMetrics } from "@/lib/utils/team-dashboard-metrics";
import { KpiCard, KpiCardSkeleton } from "@/components/dashboard/kpi-card";
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  DollarSign,
  Circle,
} from "lucide-react";
import { UserSessionCard } from "@/components/admin/user-session-card";
import { DashboardDateRangeFilter } from "@/components/ui/dashboard-date-range-filter";
import {
  defaultDashboardDateRangeFilterValue,
  type DashboardDateRangeFilterValue,
} from "@/lib/utils/dashboard-date-range-filter";
import type { SdrDashboardPreset } from "@/lib/utils/sdr-dashboard-date-range";
import {
  DashboardHiddenValue,
  DashboardValuesPrivacyToggle,
  useDashboardPrivacy,
} from "@/components/dashboard/dashboard-privacy";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminKpis {
  values_hidden?: boolean;
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
  rejected_leads: number;
  cancelled_leads: number;
  refunded_leads: number;
  inbox_leads_period?: number;
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

const TOTAL_LEADS_SUBSTAT_COLORS = {
  open: "var(--color-success)",
  claimed: "var(--color-accent-dark)",
  pipeline: "var(--color-warning)",
  quoted: "var(--color-info-text)",
  ordered: "var(--color-btn-verify-bg)",
  rejected: "var(--color-danger)",
  cancelled: "var(--color-text-muted)",
  refunded: "var(--color-warning-text-deep)",
  inbox: "var(--color-info-text-deep)",
} as const;

function buildTotalLeadsSubStats(data: AdminKpis): { label: string; value: number; color: string }[] {
  const stats: { label: string; value: number; color: string }[] = [
    { label: "Open", value: data.open_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.open },
    { label: "Claimed", value: data.claimed_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.claimed },
    { label: "In Pipeline", value: data.pipeline_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.pipeline },
    { label: "Quoted", value: data.quoted_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.quoted },
    { label: "Ordered", value: data.ordered_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.ordered },
    { label: "Rejected", value: data.rejected_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.rejected },
    { label: "Cancelled", value: data.cancelled_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.cancelled },
    { label: "Refunded", value: data.refunded_leads ?? 0, color: TOTAL_LEADS_SUBSTAT_COLORS.refunded },
  ];

  const inboxInPeriod = data.inbox_leads_period;
  if (inboxInPeriod && inboxInPeriod > 0) {
    stats.unshift({
      label: "Inbox",
      value: inboxInPeriod,
      color: TOTAL_LEADS_SUBSTAT_COLORS.inbox,
    });
  }

  return stats;
}

function isOnline(lastSignIn: string | null): boolean {
  if (!lastSignIn) return false;
  return Date.now() - new Date(lastSignIn).getTime() < 8 * 60 * 60 * 1000;
}


// ─── KPI Card ────────────────────────────────────────────────────────────────


// ─── Quick Action ─────────────────────────────────────────────────────────────

// ─── Team Section ─────────────────────────────────────────────────────────────

// ─── Team member work metrics (below session row) ────────────────────────────

function MetricCell({
  label,
  value,
  valueColor,
  valuesHidden = false,
  valueKind = "count",
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  valuesHidden?: boolean;
  valueKind?: "currency" | "count";
}) {
  return (
    <div>
      <p
        className="text-[10px] font-medium uppercase tracking-wide mb-0.5"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </p>
      {valuesHidden ? (
        <DashboardHiddenValue size="sm" kind={valueKind} />
      ) : (
        <p
          className="text-[13px] font-semibold tabular-nums"
          style={{ color: valueColor ?? "var(--color-text-primary)" }}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function TeamMemberWorkMetrics({
  role,
  metrics,
  periodLabel,
  valuesHidden = false,
}: {
  role: string;
  metrics: TeamMemberMetrics | undefined;
  periodLabel: string;
  valuesHidden?: boolean;
}) {
  if (!valuesHidden && !metrics) return null;

  const hasSdr =
    role === "sdr" &&
    (valuesHidden ||
      (metrics &&
        (metrics.handled > 0 ||
          metrics.routed > 0 ||
          metrics.rejected > 0 ||
          metrics.sourced_cash > 0)));
  const hasSales =
    role === "sales" &&
    (valuesHidden ||
      (metrics &&
        (metrics.cash_collected > 0 ||
          metrics.released_order_value > 0 ||
          metrics.awaiting_collection > 0 ||
          metrics.pipeline_value > 0)));

  if (!hasSdr && !hasSales) return null;

  return (
    <div className="space-y-1.5 pt-1" style={{ borderTop: "1px solid var(--color-border)" }}>
      {role === "sdr" && hasSdr && (
        <div className="grid grid-cols-3 gap-2">
          <MetricCell label="Handled" value={metrics?.handled ?? 0} valuesHidden={valuesHidden} />
          <MetricCell
            label="Routed"
            value={metrics?.routed ?? 0}
            valueColor="var(--color-success)"
            valuesHidden={valuesHidden}
          />
          <MetricCell
            label="Sourced"
            value={formatMoney(metrics?.sourced_cash ?? 0)}
            valuesHidden={valuesHidden}
            valueKind="currency"
          />
        </div>
      )}
      {role === "sales" && hasSales && (
        <div className="grid grid-cols-3 gap-2">
          <MetricCell
            label="Collected"
            value={formatMoney(metrics?.cash_collected ?? 0)}
            valuesHidden={valuesHidden}
            valueKind="currency"
          />
          <MetricCell
            label="Released"
            value={formatMoney(metrics?.released_order_value ?? 0)}
            valuesHidden={valuesHidden}
            valueKind="currency"
          />
          <MetricCell
            label="Balance due"
            value={formatMoney(metrics?.awaiting_collection ?? 0)}
            valueColor={
              !valuesHidden && (metrics?.awaiting_collection ?? 0) > 0
                ? "var(--color-warning)"
                : undefined
            }
            valuesHidden={valuesHidden}
            valueKind="currency"
          />
        </div>
      )}
      <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
        {valuesHidden
          ? periodLabel.toLowerCase()
          : role === "sales" && (metrics?.awaiting_collection ?? 0) > 0
            ? `${periodLabel.toLowerCase()} · balance due is live snapshot`
            : periodLabel.toLowerCase()}
      </p>
    </div>
  );
}

function TeamSection({
  periodLabel,
  teamMetrics,
  valuesHidden = false,
}: {
  periodLabel: string;
  teamMetrics: Record<string, TeamMemberMetrics>;
  valuesHidden?: boolean;
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
  }, [valuesHidden]);

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
        {!valuesHidden && activeNow > 0 && (
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
          const sess = sessionMap.get(m.id);
          const active = sess?.currently_active ?? false;

          return (
            <UserSessionCard
              key={m.id}
              fullName={m.full_name}
              roleName={m.role_name}
              roleLabel={m.role_display_name}
              active={active}
              autoSignouts={sess?.auto_signouts ?? 0}
              totalSessions={sess?.total_sessions ?? 0}
              totalMinutes={sess?.total_minutes ?? 0}
              lastSignedInAt={sess?.last_signed_in_at ?? null}
              valuesHidden={valuesHidden}
            >
              <TeamMemberWorkMetrics
                role={m.role_name}
                metrics={teamMetrics[m.id]}
                periodLabel={periodLabel}
                valuesHidden={valuesHidden}
              />
              {m.role_name === "sales" && valuesHidden && (
                <MetricCell label="Active deals" value={0} valuesHidden />
              )}
              {m.role_name === "sales" && !valuesHidden && m.claimed_leads > 0 && (
                <p className="text-[11px] font-medium" style={{ color: "var(--color-accent-dark)" }}>
                  {m.claimed_leads} active deal{m.claimed_leads !== 1 ? "s" : ""}
                </p>
              )}
            </UserSessionCard>
          );
        })}
      </div>
    </section>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export function AdminDashboard() {
  const fetchKpisRef = useRef<() => Promise<void>>(async () => {});
  const privacy = useDashboardPrivacy(() => fetchKpisRef.current());

  const [filter, setFilter] = useState<DashboardDateRangeFilterValue>(() =>
    defaultDashboardDateRangeFilterValue("last_month"),
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
    if (res.ok) {
      setData(json as AdminKpis);
      if (typeof json.values_hidden === "boolean") {
        privacy.syncFromApi(json.values_hidden);
      }
    }
    setLoading(false);
  }, [filter, buildQuery, privacy.syncFromApi]);

  fetchKpisRef.current = fetchKpis;

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  // Silent re-fetch when leads or tickets change (cancel/refund updates breakdown).
  useEffect(() => {
    function onRefresh() {
      fetch(`/api/dashboard/kpis?${buildQuery(filter)}`)
        .then((r) => r.json())
        .then((json) => {
          setData(json as AdminKpis);
          if (typeof json.values_hidden === "boolean") {
            privacy.syncFromApi(json.values_hidden);
          }
        })
        .catch(() => {});
    }
    window.addEventListener("bazaar:leads-changed", onRefresh);
    window.addEventListener("bazaar:tickets-changed", onRefresh);
    return () => {
      window.removeEventListener("bazaar:leads-changed", onRefresh);
      window.removeEventListener("bazaar:tickets-changed", onRefresh);
    };
  }, [filter, buildQuery, privacy.syncFromApi]);

  const periodLabel = data?.range?.label ?? "Last 7 Days";
  const metricsHidden = privacy.valuesHidden;

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Dashboard
        </h1>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-2">
          <DashboardValuesPrivacyToggle
            valuesHidden={privacy.valuesHidden}
            onRequestToggle={privacy.requestToggle}
            confirmOpen={privacy.confirmOpen}
            onConfirmOpenChange={privacy.setConfirmOpen}
            pendingHidden={privacy.pendingHidden}
            saving={privacy.saving}
            onConfirm={privacy.confirmToggle}
          />
          <DashboardDateRangeFilter value={filter} onChange={setFilter} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : data ? (
          <>
            <KpiCard
              label="Cash Collected"
              valuesHidden={metricsHidden}
              valueKind="currency"
              value={formatMoney(data.cash_collected ?? 0)}
              sub={periodLabel.toLowerCase()}
              help={KPI_HELP.cash_collected}
              icon={<DollarSign className="h-4 w-4" />}
              accent
            />
            <KpiCard
              label="Pipeline Value"
              valuesHidden={metricsHidden}
              valueKind="currency"
              value={formatCompact(data.pipeline_value ?? 0)}
              sub="current total"
              help={KPI_HELP.pipeline_value}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <KpiCard
              label="Total Leads"
              valuesHidden={metricsHidden}
              value={data.total_leads ?? 0}
              sub={periodLabel.toLowerCase()}
              help={KPI_HELP.total_leads}
              icon={<Users className="h-4 w-4" />}
              subStats={metricsHidden ? undefined : buildTotalLeadsSubStats(data)}
            />
            <KpiCard
              label="In Inbox"
              valuesHidden={metricsHidden}
              value={data.inbox_leads ?? 0}
              sub="waiting for SDR"
              help={KPI_HELP.inbox_leads}
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              label="Routed to Sales"
              valuesHidden={metricsHidden}
              value={data.routed_leads ?? 0}
              sub="active pipeline"
              help={KPI_HELP.routed_to_sales}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Won"
              valuesHidden={metricsHidden}
              value={data.won_leads ?? 0}
              sub={periodLabel.toLowerCase()}
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
        <TeamSection
          periodLabel={periodLabel}
          teamMetrics={data.team_member_metrics ?? {}}
          valuesHidden={metricsHidden}
        />
      )}

    </div>
  );
}
