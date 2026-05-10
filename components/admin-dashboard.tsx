"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  DollarSign,
  LayoutDashboard,
  Settings,
  ArrowRight,
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

// ─── Team Section ─────────────────────────────────────────────────────────────

function TeamSection() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/team")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {});
  }, []);

  if (!members || members.length === 0) return null;

  return (
    <section>
      <h2
        className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Team
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => {
          const initial = m.full_name?.trim()[0]?.toUpperCase() ?? "?";
          const online = isOnline(m.last_sign_in_at);
          const isSales = m.role_name === "sales";

          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-[10px] border p-4"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="relative shrink-0">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-semibold"
                  style={{
                    background: "var(--color-btn-verify-bg)",
                    color: "var(--color-btn-verify-text)",
                  }}
                >
                  {initial}
                </div>
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full"
                  style={{
                    background: online ? "var(--color-success)" : "var(--color-border)",
                    outline: "2px solid var(--color-surface)",
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {m.full_name ?? "—"}
                </p>
                <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  {m.role_display_name}
                </p>
                {isSales && (
                  <p className="mt-0.5 text-[11px] font-medium" style={{ color: "var(--color-accent)" }}>
                    {m.claimed_leads} active deal{m.claimed_leads !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
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
              href="/admin/settings/users"
              label="Manage Users"
              description="Add, edit, and deactivate users"
              icon={<Users className="h-5 w-5" />}
              primary
            />
            <QuickAction
              href="/admin/settings"
              label="System Settings"
              description="Roles, dropdowns, and notifications"
              icon={<Settings className="h-5 w-5" />}
            />
            <QuickAction
              href="/leads"
              label="SDR Workspace"
              description="View all leads across all SDRs"
              icon={<LayoutDashboard className="h-5 w-5" />}
            />
            <QuickAction
              href="/sales"
              label="Sales Pipeline"
              description="View all deals across all Sales reps"
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>
        </section>
      )}

    </div>
  );
}
