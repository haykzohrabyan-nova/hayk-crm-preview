"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Award,
  Clock,
  ArrowRight,
  AlertCircle,
  Users,
  X,
  Receipt,
  Hourglass,
  Target,
  RotateCcw,
  Filter,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PERIOD_LABELS } from "@/lib/utils/get-period-start";
import { formatCurrency, formatCompact } from "@/lib/utils/format";
import { RoleSessionPill } from "@/components/admin/user-session-card";
import { KPI_HELP } from "@/lib/utils/kpi-help-text";
import { KpiHelpLine } from "@/components/ui/kpi-help-line";
import { formatReportDateRange } from "@/lib/utils/reports-date-range";
import { RepScorecardTable, type RepScorecardRow } from "@/components/reports/rep-scorecard-table";
import { PaymentLedgerSection, type LedgerRow } from "@/components/reports/payment-ledger-section";
import { AwaitingCollectionSection } from "@/components/reports/awaiting-collection-section";
import {
  ReportsFiltersModal,
  reportsTimeFilterLabel,
  type ReportsTimeFilter,
} from "@/components/reports/reports-filters-modal";
import { memberOptionLabel } from "@/lib/utils/parse-embedded-role";

type Period = "week" | "month" | "quarter";

/** Shared height for Reports header filter button + team select (36px). */
const REPORTS_TOOLBAR_CONTROL_CLASS =
  "h-9 shrink-0 rounded-[8px] border text-[13px] font-medium outline-none transition-opacity hover:opacity-80";
const REPORTS_TOOLBAR_CONTROL_STYLE = {
  background: "var(--color-surface)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
} as const;

interface TeamMember {
  id: string;
  full_name: string;
  role_name: string;
  role_display_name: string;
}

interface ReportsSummary {
  period: string;
  period_label: string;
  date_mode: "preset" | "custom";
  period_start: string;
  period_end: string;
  filter_user: { id: string; full_name: string; role_name: string } | null;
  team_members: TeamMember[];
  cash_collected: {
    total: number;
    payment_events: number;
    by_method: { method: string; label: string; amount: number; count: number }[];
    timeline: { label: string; amount: number }[];
  };
  released_order_value: {
    total: number;
    order_count: number;
  };
  sales_scorecard: RepScorecardRow[];
  sdr_scorecard: RepScorecardRow[];
  payment_ledger: LedgerRow[];
  awaiting_collection: {
    total: number;
    order_count: number;
    collected_so_far: number;
    booked_value: number;
    pending_evidence_count: number;
    by_status: { status: string; label: string; count: number; amount: number }[];
    orders: import("@/lib/utils/reports-awaiting-collection").OutstandingOrderRow[];
  };
  win_rate: {
    leads_routed: number;
    leads_won: number;
    lead_win_rate_pct: number | null;
    quotes_sent: number;
    quotes_won: number;
    quote_win_rate_pct: number | null;
    avg_days_to_production: number | null;
    production_releases: number;
  };
  funnel: {
    quotes_created: number;
    quotes_sent: number;
    client_confirmed: number;
    payment_received: number;
    in_production: number;
    completed: number;
  };
}



function KpiCard({
  label,
  value,
  sub,
  help,
  icon,
  accent,
  warning,
}: {
  label: string;
  value: string | number;
  sub?: string;
  help?: string;
  icon: React.ReactNode;
  accent?: boolean;
  warning?: boolean;
}) {
  const bg = accent
    ? "var(--color-btn-verify-bg)"
    : "var(--color-surface)";
  const border = accent
    ? "transparent"
    : warning
      ? "var(--color-warning-border)"
      : "var(--color-border)";
  const labelColor = accent
    ? "var(--color-btn-verify-text)"
    : warning
      ? "var(--color-warning-text-deep)"
      : "var(--color-text-muted)";
  const valueColor = accent
    ? "var(--color-btn-verify-text)"
    : warning
      ? "var(--color-warning)"
      : "var(--color-text-primary)";
  const iconBg = accent
    ? "color-mix(in srgb, white 15%, transparent)"
    : warning
      ? "var(--color-warning-bg)"
      : "color-mix(in srgb, var(--color-accent) 12%, transparent)";
  const iconColor = accent
    ? "var(--color-btn-verify-text)"
    : warning
      ? "var(--color-warning)"
      : "var(--color-accent)";
  const helpVariant = accent ? "accent" : warning ? "warning" : "default";

  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-3"
      style={{
        background: bg,
        borderColor: border,
        ...(warning ? { borderLeftWidth: "3px", borderLeftColor: "var(--color-warning)" } : {}),
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: labelColor, opacity: accent || warning ? 0.85 : 1 }}
        >
          {label}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[8px]"
          style={{ background: iconBg }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: valueColor }}>
          {value}
        </p>
        {sub && (
          <p
            className="mt-2 text-[12px]"
            style={{
              color: warning ? "var(--color-text-primary)" : labelColor,
              opacity: accent ? 0.75 : 1,
            }}
          >
            {sub}
          </p>
        )}
        {help && <KpiHelpLine text={help} variant={helpVariant} />}
      </div>
    </div>
  );
}

function BreakdownBars({
  items,
  valueKey,
  labelKey,
  barColor,
  formatValue,
}: {
  items: Record<string, unknown>[];
  valueKey: string;
  labelKey: string;
  barColor: string;
  formatValue?: (v: number) => string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        No data for this period.
      </p>
    );
  }
  const max = Math.max(...items.map((i) => Number(i[valueKey] ?? 0)), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const val = Number(item[valueKey] ?? 0);
        const label = String(item[labelKey] ?? "");
        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                {label}
              </span>
              <span className="shrink-0 text-[12px] font-medium tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                {formatValue ? formatValue(val) : val}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--color-border)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round((val / max) * 100)}%`, background: barColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelStep({
  label,
  count,
  max,
  isLast,
}: {
  label: string;
  count: number;
  max: number;
  isLast?: boolean;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className={isLast ? "" : "mb-4 border-b pb-4"} style={{ borderColor: "var(--color-border)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
          {label}
        </span>
        <span className="text-[13px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {count.toLocaleString()}
          {max > 0 && count < max && <span className="ml-1.5 text-[11px]">({pct}%)</span>}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-border)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: "var(--color-btn-verify-bg)",
            minWidth: count > 0 ? "4px" : "0",
          }}
        />
      </div>
    </div>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] border p-5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {children}
    </div>
  );
}

export function ReportsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(async ({ data: auth }) => {
        if (!auth.user) return;
        const { data: profile } = await createClient()
          .from("user_profiles")
          .select("roles(name)")
          .eq("id", auth.user.id)
          .single();
        setRole((profile?.roles as unknown as { name: string } | null)?.name ?? null);
      });
  }, []);

  const fetchReports = useCallback(async () => {
    if (role !== "admin") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (useCustomRange && dateFrom && dateTo) {
        params.set("date_from", dateFrom);
        params.set("date_to", dateTo);
      } else {
        params.set("period", period);
      }
      if (userId) params.set("user_id", userId);
      const res = await fetch(`/api/reports/summary?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load reports.");
        setData(null);
      } else {
        setData(json as ReportsSummary);
      }
    } catch {
      setError("Network error — please try again.");
      setData(null);
    }
    setLoading(false);
  }, [period, role, userId, useCustomRange, dateFrom, dateTo]);

  useEffect(() => {
    if (role !== null) fetchReports();
  }, [fetchReports, role]);

  useEffect(() => {
    function onRefresh() {
      fetchReports();
    }
    window.addEventListener("bazaar:refresh-counts", onRefresh);
    return () => window.removeEventListener("bazaar:refresh-counts", onRefresh);
  }, [fetchReports]);

  const periodLabel = data?.period_label ?? PERIOD_LABELS[period];
  const periodRange =
    data?.period_start && data?.period_end
      ? formatReportDateRange(data.period_start, data.period_end)
      : null;

  const appliedTimeFilter: ReportsTimeFilter = {
    period,
    useCustomRange,
    dateFrom,
    dateTo,
  };
  const timeFilterLabel = reportsTimeFilterLabel(appliedTimeFilter);

  const hasActiveFilters = !!userId || useCustomRange || period !== "month";

  function applyTimeFilter(filter: ReportsTimeFilter) {
    setPeriod(filter.period);
    setUseCustomRange(filter.useCustomRange);
    setDateFrom(filter.dateFrom);
    setDateTo(filter.dateTo);
  }

  function resetAllFilters() {
    setPeriod("month");
    setUseCustomRange(false);
    setDateFrom("");
    setDateTo("");
    setUserId(null);
  }

  const filteredRepStats = useMemo(() => {
    if (!data || !userId) return null;
    const sales = data.sales_scorecard.find((r) => r.id === userId);
    const sdr = data.sdr_scorecard.find((r) => r.id === userId);
    return sales ?? sdr ?? null;
  }, [data, userId]);

  if (role !== null && role !== "admin") {
    return (
      <div className="space-y-5">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Reports
        </h1>
        <div
          className="flex items-start gap-3 rounded-[10px] border p-6"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <AlertCircle className="h-5 w-5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <div>
            <p className="mb-1 text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Admin access required
            </p>
            <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              Reports are available to administrators only. Use the Dashboard for your role-specific KPIs.
            </p>
            <a
              href="/dashboard"
              className="mt-4 inline-flex items-center gap-2 rounded-[6px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
            >
              Go to Dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Reports
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            Cash collected, rep performance, and quote funnel — built for bonus tracking on payments actually received.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            title="Open report filters"
            aria-label="Open report filters"
            className={`inline-flex items-center gap-2 px-3 ${REPORTS_TOOLBAR_CONTROL_CLASS}`}
            style={REPORTS_TOOLBAR_CONTROL_STYLE}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]"
              style={{
                background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                color: "var(--color-accent-dark)",
              }}
            >
              <Filter className="h-3.5 w-3.5" />
            </span>
            <span className="max-w-[220px] truncate">{timeFilterLabel}</span>
          </button>

          <select
            value={userId ?? ""}
            onChange={(e) => setUserId(e.target.value || null)}
            aria-label="Filter by team member"
            className={`px-3 ${REPORTS_TOOLBAR_CONTROL_CLASS}`}
            style={{ ...REPORTS_TOOLBAR_CONTROL_STYLE, minWidth: "180px" }}
          >
            <option value="">All team members</option>
            {(data?.team_members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {memberOptionLabel(m.full_name, {
                  name: m.role_name,
                  display_name: m.role_display_name,
                })}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className={`inline-flex items-center gap-1.5 px-3 ${REPORTS_TOOLBAR_CONTROL_CLASS}`}
              style={{
                ...REPORTS_TOOLBAR_CONTROL_STYLE,
                color: "var(--color-text-muted)",
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      <ReportsFiltersModal
        open={filtersOpen}
        applied={appliedTimeFilter}
        onClose={() => setFiltersOpen(false)}
        onApply={applyTimeFilter}
      />

      {data && (
        <div
          className="rounded-[10px] border px-4 py-3 text-[12px] leading-relaxed"
          style={{
            background: "var(--color-info-bg)",
            borderColor: "var(--color-info-border)",
            color: "var(--color-info-text-deep)",
          }}
        >
          <span className="font-medium">{periodLabel}</span>
          {periodRange && <> ({periodRange})</>} filters cash collected, released order value, rep
          scorecards, payment ledger, funnel, and win rate
          {userId && data.filter_user ? (
            <> for <span className="font-medium">{data.filter_user.full_name}</span></>
          ) : (
            <> for the whole team</>
          )}
          .{" "}
          <span style={{ color: "var(--color-info-text)" }}>
            Awaiting Collection is a live snapshot of balance still due — not limited to this date
            range.
          </span>
        </div>
      )}

      {data?.filter_user && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))",
            borderColor: "color-mix(in srgb, var(--color-accent) 30%, var(--color-border))",
          }}
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: "var(--color-accent-dark)" }} />
            <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
              Showing{" "}
              <span className="font-semibold">{data.filter_user.full_name}</span>
              {filteredRepStats && (
                <>
                  {" "}
                  — {formatCurrency(filteredRepStats.cash_collected)} collected ·{" "}
                  {filteredRepStats.payment_count} payment
                  {filteredRepStats.payment_count !== 1 ? "s" : ""}
                </>
              )}
            </span>
            {data.filter_user.role_name && (
              <RoleSessionPill roleName={data.filter_user.role_name} />
            )}
          </div>
          <button
            type="button"
            onClick={() => setUserId(null)}
            className="inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-80"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X className="h-3.5 w-3.5" />
            Clear member
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border px-4 py-3 text-[13px] font-medium"
          style={{
            background: "var(--color-danger-bg)",
            borderColor: "var(--color-danger-border)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-[10px] border"
                style={{ background: "var(--color-border)", borderColor: "var(--color-border)" }}
              />
            ))}
          </div>
          <div
            className="h-64 animate-pulse rounded-[10px] border"
            style={{ background: "var(--color-border)", borderColor: "var(--color-border)" }}
          />
        </div>
      ) : data ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {userId && filteredRepStats ? (
              <>
                <KpiCard
                  label="Cash Collected"
                  value={formatCurrency(filteredRepStats.cash_collected)}
                  sub={`${data.filter_user?.full_name} · ${periodLabel.toLowerCase()}`}
                  help={KPI_HELP.cash_collected}
                  icon={<DollarSign className="h-4 w-4" />}
                  accent
                />
                {data.filter_user?.role_name === "sales" && (
                  <KpiCard
                    label="Released Order Value"
                    value={formatCurrency(data.released_order_value.total)}
                    sub={`${data.released_order_value.order_count} order${data.released_order_value.order_count !== 1 ? "s" : ""} · ${periodLabel.toLowerCase()}`}
                    help={KPI_HELP.released_order_value}
                    icon={<Award className="h-4 w-4" />}
                  />
                )}
                <KpiCard
                  label="Awaiting Collection"
                  value={formatCompact(data.awaiting_collection.total)}
                  sub={`${data.awaiting_collection.order_count} orders still owe`}
                  help={KPI_HELP.awaiting_collection}
                  icon={<Hourglass className="h-4 w-4" />}
                  warning
                />
                <KpiCard
                  label="Payment Events"
                  value={filteredRepStats.payment_count}
                  sub={`${filteredRepStats.orders_paid} orders · ${periodLabel.toLowerCase()}`}
                  help={KPI_HELP.payments_recorded}
                  icon={<Receipt className="h-4 w-4" />}
                />
                <KpiCard
                  label="Collection Rate"
                  value={filteredRepStats.collection_pct != null ? `${filteredRepStats.collection_pct}%` : "—"}
                  sub="Cash vs booked on their orders"
                  help={KPI_HELP.collection_rate}
                  icon={<TrendingUp className="h-4 w-4" />}
                />
              </>
            ) : (
              <>
                <KpiCard
                  label="Total Cash Collected"
                  value={formatCurrency(data.cash_collected.total)}
                  sub={periodLabel.toLowerCase()}
                  help={KPI_HELP.cash_collected}
                  icon={<DollarSign className="h-4 w-4" />}
                  accent
                />
                <KpiCard
                  label="Released Order Value"
                  value={formatCurrency(data.released_order_value.total)}
                  sub={`${data.released_order_value.order_count} order${data.released_order_value.order_count !== 1 ? "s" : ""} · ${periodLabel.toLowerCase()}`}
                  help={KPI_HELP.released_order_value}
                  icon={<Award className="h-4 w-4" />}
                />
                <KpiCard
                  label="Awaiting Collection"
                  value={formatCompact(data.awaiting_collection.total)}
                  sub={`${data.awaiting_collection.order_count} open orders · live snapshot`}
                  help={KPI_HELP.awaiting_collection}
                  icon={<Hourglass className="h-4 w-4" />}
                  warning
                />
                <KpiCard
                  label="Payments Recorded"
                  value={data.cash_collected.payment_events}
                  sub={`${data.payment_ledger.length} orders · ${periodLabel.toLowerCase()}`}
                  help={KPI_HELP.payments_recorded}
                  icon={<Receipt className="h-4 w-4" />}
                />
                <KpiCard
                  label="Quote Win Rate"
                  value={data.win_rate.quote_win_rate_pct != null ? `${data.win_rate.quote_win_rate_pct}%` : "—"}
                  sub={`${data.win_rate.quotes_won} of ${data.win_rate.quotes_sent} → production`}
                  help={KPI_HELP.quote_win_rate}
                  icon={<Target className="h-4 w-4" />}
                />
              </>
            )}
          </div>

          {/* Team performance — bonus core (display only; filter via team member dropdown) */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <RepScorecardTable
              title="Sales — Cash by Rep"
              subtitle={`Payments recorded ${periodLabel.toLowerCase()} · sales owner or quote creator`}
              rows={data.sales_scorecard}
              variant="sales"
            />
            {data.sdr_scorecard.length > 0 && (
              <RepScorecardTable
                title="SDR — Sourced Cash"
                subtitle={`Payments on sourced leads ${periodLabel.toLowerCase()} · plus leads routed in period`}
                rows={data.sdr_scorecard}
                variant="sdr"
                showRouted
              />
            )}
          </div>

          {/* Payment ledger */}
          <PaymentLedgerSection rows={data.payment_ledger} periodLabel={periodLabel} />

          {/* Outstanding balances */}
          <AwaitingCollectionSection
            total={data.awaiting_collection.total}
            orderCount={data.awaiting_collection.order_count}
            collectedSoFar={data.awaiting_collection.collected_so_far}
            bookedValue={data.awaiting_collection.booked_value}
            pendingEvidenceCount={data.awaiting_collection.pending_evidence_count}
            byStatus={data.awaiting_collection.by_status}
            orders={data.awaiting_collection.orders}
            filtered={!!userId}
          />

          {/* Company analytics */}
          <div>
            <h2
              className="mb-4 text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Company Overview — {periodLabel}
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section>
                <h3
                  className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.06em]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Cash by Payment Method
                </h3>
                <SectionShell>
                  <BreakdownBars
                    items={data.cash_collected.by_method}
                    valueKey="amount"
                    labelKey="label"
                    barColor="var(--color-accent)"
                    formatValue={(v) => formatCompact(v)}
                  />
                </SectionShell>
              </section>

              <section>
                <h3
                  className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.06em]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Cash Over Time
                </h3>
                <SectionShell>
                  <BreakdownBars
                    items={data.cash_collected.timeline}
                    valueKey="amount"
                    labelKey="label"
                    barColor="var(--color-btn-verify-bg)"
                    formatValue={(v) => formatCompact(v)}
                  />
                </SectionShell>
              </section>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section>
              <h2
                className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Quote-to-Production Funnel
              </h2>
              <SectionShell>
                <FunnelStep label="Quotes created" count={data.funnel.quotes_created} max={data.funnel.quotes_created} />
                <FunnelStep label="Quote sent to customer" count={data.funnel.quotes_sent} max={data.funnel.quotes_created} />
                <FunnelStep label="Customer confirmed" count={data.funnel.client_confirmed} max={data.funnel.quotes_created} />
                <FunnelStep label="Payment received (any amount)" count={data.funnel.payment_received} max={data.funnel.quotes_created} />
                <FunnelStep label="Released to production" count={data.funnel.in_production} max={data.funnel.quotes_created} />
                <FunnelStep label="Completed" count={data.funnel.completed} max={data.funnel.quotes_created} isLast />
              </SectionShell>
            </section>

            <section>
              <h2
                className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Award className="h-3.5 w-3.5" />
                Win Rate & Close Time
              </h2>
              <SectionShell>
                <div className="space-y-4 text-[13px]">
                  <div>
                    <p className="mb-1 font-medium" style={{ color: "var(--color-text-primary)" }}>
                      Lead conversion
                    </p>
                    <p style={{ color: "var(--color-text-muted)" }}>
                      {data.win_rate.leads_routed > 0
                        ? `${data.win_rate.leads_won} of ${data.win_rate.leads_routed} leads routed to Sales are now Won (${data.win_rate.lead_win_rate_pct}%).`
                        : "No leads were routed to Sales in this period."}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 font-medium" style={{ color: "var(--color-text-primary)" }}>
                      Quote conversion
                    </p>
                    <p style={{ color: "var(--color-text-muted)" }}>
                      {data.win_rate.quotes_sent > 0
                        ? `${data.win_rate.quotes_won} of ${data.win_rate.quotes_sent} quotes created this period reached production (${data.win_rate.quote_win_rate_pct}%).`
                        : "No quotes were sent in this period's cohort."}
                    </p>
                  </div>
                  <div
                    className="flex items-start gap-2 border-t pt-4"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-text-muted)" }} />
                    <p style={{ color: "var(--color-text-muted)" }}>
                      {data.win_rate.avg_days_to_production != null
                        ? `Average ${data.win_rate.avg_days_to_production} days from quote creation to production release (${data.win_rate.production_releases} orders).`
                        : "No production releases in this period."}
                    </p>
                  </div>
                </div>
              </SectionShell>
            </section>
          </div>
        </>
      ) : null}

      <div
        className="rounded-[10px] border p-4 text-[12px] leading-relaxed"
        style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
      >
        Cash collected sums payments recorded in the selected period. Awaiting collection is a live snapshot of
        balance still due on open orders. Sales credit goes to the lead&apos;s sales owner; SDR credit goes to the
        lead&apos;s SDR. Dashboard &quot;Total Revenue&quot; uses order value at production.
      </div>
    </div>
  );
}
