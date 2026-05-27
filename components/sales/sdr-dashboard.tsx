"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserCheck,
  UserPlus,
  DollarSign,
  Banknote,
  Scale,
  ShoppingCart,
  Inbox,
  XCircle,
  Clock,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { DashboardDateRangeFilter } from "@/components/ui/dashboard-date-range-filter";
import { formatCurrency as formatMoneyFull } from "@/lib/utils/format";
import { KPI_HELP } from "@/lib/utils/kpi-help-text";
import { KpiHelpLine } from "@/components/ui/kpi-help-line";
import {
  SDR_DASHBOARD_PRESET_LABELS,
  type SdrDashboardPreset,
} from "@/lib/utils/sdr-dashboard-date-range";
import { defaultDashboardDateRangeFilterValue } from "@/lib/utils/dashboard-date-range-filter";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MetricTrend {
  value: number;
  prior: number;
  pct_change: number | null;
}

interface SdrKpis {
  role: "sdr";
  range: {
    preset: SdrDashboardPreset;
    label: string;
    prior_label: string;
    start_iso: string;
    end_iso: string;
  };
  lead_claimed: MetricTrend;
  lead_created: MetricTrend;
  order_value: MetricTrend;
  order_value_breakdown: { total: number; received: number; balance: number };
  order_created: MetricTrend;
  inbox: { value: number };
  rejected: MetricTrend;
  on_hold: MetricTrend;
  routed_to_sales: MetricTrend;
  sales_win: MetricTrend;
}

export interface SdrTimeFilter {
  preset: SdrDashboardPreset;
  dateFrom: string;
  dateTo: string;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatMoneyFull(n);
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

function pctColor(pct: number | null): string {
  if (pct === null || pct === 0) return "var(--color-text-muted)";
  return pct > 0 ? "var(--color-success)" : "var(--color-danger)";
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtext,
  help,
  icon,
  pctChange,
  priorLabel,
  accent = false,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  help?: string;
  icon: React.ReactNode;
  pctChange?: number | null;
  priorLabel?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-3"
      style={{
        background: accent ? "var(--color-btn-verify-bg)" : "var(--color-surface)",
        borderColor: accent ? "transparent" : "var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
          style={{
            background: accent
              ? "color-mix(in srgb, var(--color-btn-verify-text) 15%, transparent)"
              : "var(--color-badge-bg)",
          }}
        >
          <span style={{ color: accent ? "var(--color-btn-verify-text)" : "var(--color-tab-active)" }}>
            {icon}
          </span>
        </div>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p
            className="text-[28px] font-semibold leading-none"
            style={{ color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-primary)" }}
          >
            {value}
          </p>
          {pctChange !== undefined && (
            <span
              className="text-[13px] font-medium"
              style={{
                color: accent ? "var(--color-btn-verify-text)" : pctColor(pctChange),
                opacity: accent ? 0.85 : 1,
              }}
            >
              {formatPct(pctChange)}
            </span>
          )}
        </div>
        {subtext && (
          <p
            className="mt-1 text-[12px]"
            style={{
              color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
              opacity: accent ? 0.7 : 1,
            }}
          >
            {subtext}
          </p>
        )}
        {priorLabel && pctChange !== undefined && (
          <p
            className="mt-0.5 text-[11px]"
            style={{
              color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
              opacity: accent ? 0.65 : 1,
            }}
          >
            {priorLabel}
          </p>
        )}
        {help && <KpiHelpLine text={help} variant={accent ? "accent" : "default"} />}
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


// ─── SDR Dashboard ───────────────────────────────────────────────────────────

export function SdrDashboard() {
  const [filter, setFilter] = useState<SdrTimeFilter>(() =>
    defaultDashboardDateRangeFilterValue("today") as SdrTimeFilter,
  );
  const [data, setData] = useState<SdrKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const buildQuery = useCallback((f: SdrTimeFilter) => {
    const params = new URLSearchParams();
    if (f.preset === "custom") {
      params.set("sdr_preset", "custom");
      params.set("date_from", f.dateFrom);
      params.set("date_to", f.dateTo);
    } else {
      params.set("sdr_preset", f.preset);
    }
    return params.toString();
  }, []);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    const [res] = await Promise.all([
      fetch(`/api/dashboard/kpis?${buildQuery(filter)}`),
      new Promise((r) => setTimeout(r, 200)),
    ]);
    const json = await res.json();
    if (res.ok) setData(json as SdrKpis);
    setLoading(false);
  }, [filter, buildQuery]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  const priorLabel = data?.range.prior_label ?? "vs prior period";
  const rangeLabel = data?.range.label ?? SDR_DASHBOARD_PRESET_LABELS.today;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Dashboard
          </h1>
          {data && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              {rangeLabel}
              {data.range.preset === "custom" &&
                ` · ${new Date(data.range.start_iso).toLocaleDateString()} – ${new Date(data.range.end_iso).toLocaleDateString()}`}
            </p>
          )}
        </div>

        <DashboardDateRangeFilter
          value={filter}
          onChange={(next) => setFilter(next as SdrTimeFilter)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 11 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : data ? (
          <>
            <KpiCard
              label="Total"
              value={formatCurrency(data.order_value_breakdown.total)}
              pctChange={data.order_value.pct_change}
              priorLabel={priorLabel}
              subtext="routed leads → production"
              help={KPI_HELP.order_total_sdr}
              icon={<DollarSign className="h-4 w-4" />}
              accent
            />
            <KpiCard
              label="Received"
              value={formatCurrency(data.order_value_breakdown.received)}
              subtext="routed leads → production"
              help={KPI_HELP.order_received_sdr}
              icon={<Banknote className="h-4 w-4" />}
            />
            <KpiCard
              label="Balance"
              value={formatCurrency(data.order_value_breakdown.balance)}
              subtext="routed leads → production"
              help={KPI_HELP.order_balance_sdr}
              icon={<Scale className="h-4 w-4" />}
            />
            <KpiCard
              label="Lead Claimed"
              value={data.lead_claimed.value}
              pctChange={data.lead_claimed.pct_change}
              priorLabel={priorLabel}
              subtext={rangeLabel.toLowerCase()}
              help={KPI_HELP.lead_claimed_sdr}
              icon={<UserCheck className="h-4 w-4" />}
            />
            <KpiCard
              label="Lead Created"
              value={data.lead_created.value}
              pctChange={data.lead_created.pct_change}
              priorLabel={priorLabel}
              subtext={rangeLabel.toLowerCase()}
              help={KPI_HELP.lead_created_sdr}
              icon={<UserPlus className="h-4 w-4" />}
            />
            <KpiCard
              label="Order Created"
              value={data.order_created.value}
              pctChange={data.order_created.pct_change}
              priorLabel={priorLabel}
              subtext="converted to order"
              help={KPI_HELP.order_created_sdr}
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <KpiCard
              label="Inbox"
              value={data.inbox.value}
              subtext="unclaimed now"
              help={KPI_HELP.inbox_leads}
              icon={<Inbox className="h-4 w-4" />}
            />
            <KpiCard
              label="Rejected"
              value={data.rejected.value}
              pctChange={data.rejected.pct_change}
              priorLabel={priorLabel}
              subtext={rangeLabel.toLowerCase()}
              help={KPI_HELP.rejected}
              icon={<XCircle className="h-4 w-4" />}
            />
            <KpiCard
              label="On Hold"
              value={data.on_hold.value}
              pctChange={data.on_hold.pct_change}
              priorLabel={priorLabel}
              subtext={rangeLabel.toLowerCase()}
              help={KPI_HELP.on_hold_sdr_period}
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              label="Routed to Sales"
              value={data.routed_to_sales.value}
              pctChange={data.routed_to_sales.pct_change}
              priorLabel={priorLabel}
              subtext={rangeLabel.toLowerCase()}
              help={KPI_HELP.routed}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Sales Win"
              value={data.sales_win.value}
              pctChange={data.sales_win.pct_change}
              priorLabel={priorLabel}
              subtext="routed → in production"
              help={KPI_HELP.sales_win_sdr}
              icon={<Trophy className="h-4 w-4" />}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
