"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  LayoutDashboard,
  ArrowRight,
  DollarSign,
  PieChart,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "quarter";

interface SdrKpis {
  inbox_count: number;
  handled: number;
  routed: number;
  on_hold: number;
  rejected: number;
  quote_value: number;
  share_pct: number;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtext,
  icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  subtext: string;
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

function QuickAction({
  label,
  description,
  href,
  icon,
  primary = false,
}: {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[10px] border p-4 transition-all hover:shadow-sm"
      style={{
        background: primary
          ? "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))"
          : "var(--color-surface)",
        borderColor: primary
          ? "color-mix(in srgb, var(--color-accent) 30%, var(--color-border))"
          : "var(--color-border)",
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
      >
        <span style={{ color: "var(--color-accent)" }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{label}</p>
        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{description}</p>
      </div>
      <ArrowRight
        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        style={{ color: "var(--color-text-muted)" }}
      />
    </Link>
  );
}

// ─── SDR Dashboard ───────────────────────────────────────────────────────────

export function SdrDashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<SdrKpis | null>(null);
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
          Array.from({ length: 7 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : data ? (
          <>
            <KpiCard
              label="Inbox"
              value={data.inbox_count}
              subtext="leads waiting to be claimed"
              icon={<Clock className="h-4 w-4" />}
              accent
            />
            <KpiCard
              label="Handled"
              value={data.handled}
              subtext={periodLabel.toLowerCase()}
              icon={<CheckCircle className="h-4 w-4" />}
            />
            <KpiCard
              label="Routed to Sales"
              value={data.routed}
              subtext={periodLabel.toLowerCase()}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="On Hold"
              value={data.on_hold}
              subtext="currently paused"
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              label="Rejected"
              value={data.rejected}
              subtext={periodLabel.toLowerCase()}
              icon={<XCircle className="h-4 w-4" />}
            />
            <KpiCard
              label="Quote Value"
              value={formatCurrency(data.quote_value)}
              subtext={`${periodLabel.toLowerCase()}`}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <KpiCard
              label="My Share"
              value={`${data.share_pct}%`}
              subtext="of all SDR work this period"
              icon={<PieChart className="h-4 w-4" />}
            />
          </>
        ) : null}
      </div>

      {/* Quick Actions */}
      {!loading && (
        <section>
          <h2
            className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickAction
              href="/leads"
              label="Work Leads"
              description="Open the SDR leads workspace"
              icon={<Users className="h-5 w-5" />}
              primary
            />
            <QuickAction
              href="/crm"
              label="View CRM"
              description="Browse customer profiles"
              icon={<LayoutDashboard className="h-5 w-5" />}
            />
          </div>
        </section>
      )}

    </div>
  );
}
