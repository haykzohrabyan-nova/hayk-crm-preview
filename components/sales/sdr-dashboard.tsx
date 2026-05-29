"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserCheck,
  UserPlus,
  Banknote,
  Scale,
  ShoppingCart,
  Inbox,
  XCircle,
  Clock,
  TrendingUp,
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
import {
  DashboardHiddenValue,
  DashboardValuesPrivacyToggle,
  useDashboardPrivacy,
} from "@/components/dashboard/dashboard-privacy";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MetricTrend {
  value: number;
  prior: number;
  pct_change: number | null;
}

interface SdrKpis {
  values_hidden?: boolean;
  role: "sdr";
  range: {
    preset: SdrDashboardPreset;
    label: string;
    prior_label: string;
    start_iso: string;
    end_iso: string;
  };
  lead_claimed?: MetricTrend;
  lead_created?: MetricTrend;
  order_value?: MetricTrend;
  order_value_breakdown?: { total: number; received: number; balance: number };
  order_created?: MetricTrend;
  inbox?: { value: number };
  rejected?: MetricTrend;
  on_hold?: MetricTrend;
  routed_to_sales?: MetricTrend;
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

function leadCountPhrase(count: number): string {
  return count === 1 ? "1 lead" : `${count} leads`;
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
  valuesHidden = false,
  valueKind = "count",
}: {
  label: string;
  value: string | number;
  subtext?: string;
  help?: string;
  icon: React.ReactNode;
  pctChange?: number | null;
  priorLabel?: string;
  accent?: boolean;
  valuesHidden?: boolean;
  valueKind?: "currency" | "count";
}) {
  const showTrend = !valuesHidden && pctChange !== undefined;
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
          {valuesHidden ? (
            <DashboardHiddenValue kind={valueKind} accent={accent} />
          ) : (
            <p
              className="text-[28px] font-semibold leading-none"
              style={{ color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-primary)" }}
            >
              {value}
            </p>
          )}
          {showTrend && (
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
        {priorLabel && showTrend && (
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
  const fetchKpisRef = useRef<() => Promise<void>>(async () => {});
  const privacy = useDashboardPrivacy(() => fetchKpisRef.current());

  const [filter, setFilter] = useState<SdrTimeFilter>(() =>
    defaultDashboardDateRangeFilterValue("last_month") as SdrTimeFilter,
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
    if (res.ok) {
      setData(json as SdrKpis);
      if (typeof json.values_hidden === "boolean") {
        privacy.syncFromApi(json.values_hidden);
      }
    }
    setLoading(false);
  }, [filter, buildQuery, privacy.syncFromApi]);

  fetchKpisRef.current = fetchKpis;

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  const metricsHidden = privacy.valuesHidden;
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

        <div className="flex flex-wrap items-center gap-2">
          <DashboardValuesPrivacyToggle
            valuesHidden={privacy.valuesHidden}
            onRequestToggle={privacy.requestToggle}
            confirmOpen={privacy.confirmOpen}
            onConfirmOpenChange={privacy.setConfirmOpen}
            pendingHidden={privacy.pendingHidden}
            saving={privacy.saving}
            onConfirm={privacy.confirmToggle}
          />
          <DashboardDateRangeFilter
            value={filter}
            onChange={(next) => setFilter(next as SdrTimeFilter)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 9 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : data ? (
          <>
            <KpiCard
              label="Closed Order Value"
              valuesHidden={metricsHidden}
              valueKind="currency"
              value={formatCurrency(data.order_value_breakdown?.total ?? 0)}
              pctChange={metricsHidden ? undefined : data.order_value?.pct_change}
              priorLabel={priorLabel}
              help={KPI_HELP.order_total_with_count_sdr}
              icon={<ShoppingCart className="h-4 w-4" />}
              accent
            />
            <KpiCard
              label="Paid From Closed Orders"
              valuesHidden={metricsHidden}
              valueKind="currency"
              value={formatCurrency(data.order_value_breakdown?.received ?? 0)}
              help={KPI_HELP.order_received_sdr}
              icon={<Banknote className="h-4 w-4" />}
            />
            <KpiCard
              label="Remaining Balance for Closed Orders"
              valuesHidden={metricsHidden}
              valueKind="currency"
              value={formatCurrency(data.order_value_breakdown?.balance ?? 0)}
              help={KPI_HELP.order_balance_sdr}
              icon={<Scale className="h-4 w-4" />}
            />
            <KpiCard
              label="Qty of Claimed Leads"
              valuesHidden={metricsHidden}
              value={leadCountPhrase(data.lead_claimed?.value ?? 0)}
              pctChange={metricsHidden ? undefined : data.lead_claimed?.pct_change}
              priorLabel={priorLabel}
              help={KPI_HELP.lead_claimed_sdr}
              icon={<UserCheck className="h-4 w-4" />}
            />
            <KpiCard
              label="Manually Created Leads"
              valuesHidden={metricsHidden}
              value={leadCountPhrase(data.lead_created?.value ?? 0)}
              pctChange={metricsHidden ? undefined : data.lead_created?.pct_change}
              priorLabel={priorLabel}
              help={KPI_HELP.lead_created_sdr}
              icon={<UserPlus className="h-4 w-4" />}
            />
            <KpiCard
              label="Unclaimed/Pending Leads"
              valuesHidden={metricsHidden}
              value={leadCountPhrase(data.inbox?.value ?? 0)}
              help={KPI_HELP.unclaimed_pending_leads_sdr}
              icon={<Inbox className="h-4 w-4" />}
            />
            <KpiCard
              label="Rejected / Not Qualified"
              valuesHidden={metricsHidden}
              value={leadCountPhrase(data.rejected?.value ?? 0)}
              pctChange={metricsHidden ? undefined : data.rejected?.pct_change}
              priorLabel={priorLabel}
              help={KPI_HELP.rejected_not_qualified_sdr}
              icon={<XCircle className="h-4 w-4" />}
            />
            <KpiCard
              label="Pending Follow-Up"
              valuesHidden={metricsHidden}
              value={leadCountPhrase(data.on_hold?.value ?? 0)}
              pctChange={metricsHidden ? undefined : data.on_hold?.pct_change}
              priorLabel={priorLabel}
              help={KPI_HELP.on_hold_sdr_period}
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              label="Qty of Leads Routed to Sales Team"
              valuesHidden={metricsHidden}
              value={leadCountPhrase(data.routed_to_sales?.value ?? 0)}
              pctChange={metricsHidden ? undefined : data.routed_to_sales?.pct_change}
              priorLabel={priorLabel}
              help={KPI_HELP.qty_routed_to_sales_sdr}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
