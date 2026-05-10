"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Briefcase,
  DollarSign,
  LayoutDashboard,
  Settings,
  ArrowRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "quarter";

interface SdrKpis {
  role: "sdr";
  inbox_count: number;
  handled: number;
  routed: number;
  on_hold: number;
  rejected: number;
}

interface SalesKpis {
  role: "sales";
  new_in_pipeline: number;
  active_deals: number;
  on_hold: number;
  won: number;
  won_value: number;
  pipeline_value: number;
}

interface AdminKpis {
  role: "admin";
  total_leads: number;
  inbox_leads: number;
  routed_leads: number;
  won_leads: number;
  total_revenue: number;
  pipeline_value: number;
}

type KpiData = SdrKpis | SalesKpis | AdminKpis;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  accent?: boolean;
}

function KpiCard({ label, value, subtext, icon, accent = false }: KpiCardProps) {
  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-3 transition-all"
      style={{
        background: accent ? "var(--color-btn-verify-bg)" : "var(--color-surface)",
        borderColor: accent ? "transparent" : "var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-muted)", opacity: accent ? 0.75 : 1 }}
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
          style={{ color: accent ? "var(--color-btn-verify-text)" : "var(--color-text-muted)", opacity: accent ? 0.7 : 1 }}
        >
          {subtext}
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton Card ───────────────────────────────────────────────────────────

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

interface QuickActionProps {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  primary?: boolean;
}

function QuickAction({ label, description, href, icon, primary = false }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[10px] border p-4 transition-all hover:shadow-sm"
      style={{
        background: primary ? "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))" : "var(--color-surface)",
        borderColor: primary ? "color-mix(in srgb, var(--color-accent) 30%, var(--color-border))" : "var(--color-border)",
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] transition-colors"
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

// ─── Team Section (admin only) ────────────────────────────────────────────────

interface TeamMember {
  id: string;
  full_name: string | null;
  role_name: string;
  role_display_name: string;
  claimed_leads: number;
  last_sign_in_at: string | null;
}

function isOnline(lastSignIn: string | null): boolean {
  if (!lastSignIn) return false;
  return Date.now() - new Date(lastSignIn).getTime() < 8 * 60 * 60 * 1000; // 8 hours
}

function TeamSection() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/team")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {});
  }, []);

  if (!members) return null;
  if (members.length === 0) return null;

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
              {/* Avatar with online indicator */}
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
                {/* Online dot */}
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full"
                  style={{
                    background: online ? "var(--color-success)" : "var(--color-border)",
                    outline: "2px solid var(--color-surface)",
                  }}
                />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    const [res] = await Promise.all([
      fetch(`/api/dashboard/kpis?period=${period}`),
      // Enforce minimum 300ms skeleton to avoid flash
      new Promise((r) => setTimeout(r, 300)),
    ]);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  const periodLabel = PERIOD_LABELS[period];

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Dashboard
        </h1>

        {/* Period selector */}
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
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)}
        </div>
      ) : data?.role === "sdr" ? (
        <SdrCards data={data} periodLabel={periodLabel} />
      ) : data?.role === "sales" ? (
        <SalesCards data={data} periodLabel={periodLabel} />
      ) : data?.role === "admin" ? (
        <AdminCards data={data} periodLabel={periodLabel} />
      ) : null}

      {/* Team section — admin only */}
      {!loading && data?.role === "admin" && <TeamSection />}

      {/* Quick Actions */}
      {!loading && data && (
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.role === "sdr" && (
              <>
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
              </>
            )}
            {data.role === "sales" && (
              <>
                <QuickAction
                  href="/sales"
                  label="Go to Pipeline"
                  description="Claim and work routed leads"
                  icon={<TrendingUp className="h-5 w-5" />}
                  primary
                />
                <QuickAction
                  href="/tickets"
                  label="Quotes & Orders"
                  description="View and manage job tickets"
                  icon={<Briefcase className="h-5 w-5" />}
                />
              </>
            )}
            {data.role === "admin" && (
              <>
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
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── SDR Cards ────────────────────────────────────────────────────────────────

function SdrCards({ data, periodLabel }: { data: SdrKpis; periodLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <KpiCard
        label="Inbox"
        value={data.inbox_count}
        subtext="leads waiting"
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
    </div>
  );
}

// ─── Sales Cards ─────────────────────────────────────────────────────────────

function SalesCards({ data, periodLabel }: { data: SalesKpis; periodLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <KpiCard
        label="Won Value"
        value={formatCurrency(data.won_value)}
        subtext={periodLabel.toLowerCase()}
        icon={<DollarSign className="h-4 w-4" />}
        accent
      />
      <KpiCard
        label="New in Pipeline"
        value={data.new_in_pipeline}
        subtext="waiting to be claimed"
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <KpiCard
        label="Active Deals"
        value={data.active_deals}
        subtext="ongoing"
        icon={<Briefcase className="h-4 w-4" />}
      />
      <KpiCard
        label="Won"
        value={data.won}
        subtext={periodLabel.toLowerCase()}
        icon={<CheckCircle className="h-4 w-4" />}
      />
      <KpiCard
        label="On Hold"
        value={data.on_hold}
        subtext="paused deals"
        icon={<Clock className="h-4 w-4" />}
      />
      <KpiCard
        label="Pipeline Value"
        value={formatCurrency(data.pipeline_value)}
        subtext="current total"
        icon={<DollarSign className="h-4 w-4" />}
      />
    </div>
  );
}

// ─── Admin Cards ─────────────────────────────────────────────────────────────

function AdminCards({ data, periodLabel }: { data: AdminKpis; periodLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
    </div>
  );
}
