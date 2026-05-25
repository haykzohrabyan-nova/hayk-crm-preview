"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  Clock,
  CheckCircle,
  Briefcase,
  DollarSign,
} from "lucide-react";
import { formatCurrency as formatMoney } from "@/lib/utils/format";
import { KPI_HELP } from "@/lib/utils/kpi-help-text";
import { KpiHelpLine } from "@/components/ui/kpi-help-line";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "quarter";

interface SalesKpis {
  new_in_pipeline: number;
  active_deals: number;
  on_hold: number;
  won: number;
  won_value: number;
  cash_collected: number;
  pipeline_value: number;
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

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtext,
  help,
  icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  subtext: string;
  help?: string;
  icon: React.ReactNode;
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

// ─── Sales Dashboard ─────────────────────────────────────────────────────────

export function SalesDashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<SalesKpis | null>(null);
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
              label="Cash Collected"
              value={formatMoney(data.cash_collected)}
              subtext={periodLabel.toLowerCase()}
              help={KPI_HELP.cash_collected}
              icon={<DollarSign className="h-4 w-4" />}
              accent
            />
            <KpiCard
              label="Released Order Value"
              value={formatCurrency(data.won_value)}
              subtext={periodLabel.toLowerCase()}
              help={KPI_HELP.released_order_value}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="New in Pipeline"
              value={data.new_in_pipeline}
              subtext="waiting to be claimed"
              help={KPI_HELP.new_in_pipeline}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Active Deals"
              value={data.active_deals}
              subtext="ongoing"
              help={KPI_HELP.active_deals}
              icon={<Briefcase className="h-4 w-4" />}
            />
            <KpiCard
              label="Won"
              value={data.won}
              subtext={periodLabel.toLowerCase()}
              help={KPI_HELP.won}
              icon={<CheckCircle className="h-4 w-4" />}
            />
            <KpiCard
              label="On Hold"
              value={data.on_hold}
              subtext="paused deals"
              help={KPI_HELP.on_hold_sales}
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              label="Pipeline Value"
              value={formatCurrency(data.pipeline_value)}
              subtext="your quotes · current total"
              help={KPI_HELP.pipeline_value_sales}
              icon={<DollarSign className="h-4 w-4" />}
            />
          </>
        ) : null}
      </div>

      {/* end KPI grid */}

    </div>
  );
}
