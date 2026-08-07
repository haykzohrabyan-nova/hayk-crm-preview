"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Trophy,
  ListTodo,
  CheckCircle2,
  PhoneCall,
  MailWarning,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { KpiCard, KpiCardSkeleton } from "@/components/dashboard/kpi-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types (mirror app/api/team/page-data/route.ts) ──────────────────────────
interface RepMetrics {
  owner_id: string;
  name: string;
  open_tasks: number;
  tasks_done_7d: number;
  open_deals: number;
  won_7d: number;
  calls_answered_7d: number;
  calls_missed_7d: number;
  unanswered_messages_7d: number;
}

interface TeamPayload {
  window_days: number;
  generated_at: string;
  reps: RepMetrics[];
  totals: RepMetrics;
}

type SortKey =
  | "name"
  | "open_deals"
  | "won_7d"
  | "open_tasks"
  | "tasks_done_7d"
  | "calls_answered_7d"
  | "unanswered_messages_7d";

const COLUMNS: { key: SortKey; label: string; help?: string }[] = [
  { key: "open_deals", label: "Open Deals" },
  { key: "won_7d", label: "Won" },
  { key: "open_tasks", label: "Open Tasks" },
  { key: "tasks_done_7d", label: "Done" },
  { key: "calls_answered_7d", label: "Calls (Answered / Missed)" },
  { key: "unanswered_messages_7d", label: "Unanswered Msgs" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic accent tint per rep for the avatar chip.
const AVATAR_TINTS = [
  "var(--color-info-text)",
  "var(--color-success)",
  "var(--color-in-progress-text)",
  "var(--color-accent-dark)",
  "var(--color-warning)",
  "var(--color-danger)",
];

function CallBar({ answered, missed }: { answered: number; missed: number }) {
  const total = answered + missed;
  const answeredPct = total > 0 ? (answered / total) * 100 : 0;
  const missedPct = total > 0 ? (missed / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[150px]">
      <div
        className="flex h-2 flex-1 overflow-hidden rounded-full"
        style={{ background: "color-mix(in srgb, var(--color-border) 60%, transparent)" }}
        title={`${answered} answered · ${missed} missed`}
      >
        {total > 0 && (
          <>
            <div style={{ width: `${answeredPct}%`, background: "var(--color-success)" }} />
            <div style={{ width: `${missedPct}%`, background: "var(--color-danger)" }} />
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[12px] tabular-nums whitespace-nowrap">
        <span style={{ color: "var(--color-success)" }} className="font-semibold">
          {answered}
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>/</span>
        <span style={{ color: "var(--color-danger)" }} className="font-semibold">
          {missed}
        </span>
      </div>
    </div>
  );
}

function Stat({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <span
      className="tabular-nums font-medium text-[14px]"
      style={{ color: value === 0 && muted ? "var(--color-text-muted)" : "var(--color-text-primary)" }}
    >
      {value}
    </span>
  );
}

export function TeamDashboard() {
  const [data, setData] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("open_deals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/page-data", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load team data.");
      setData(body as TeamPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sortedReps = useMemo(() => {
    const reps = data?.reps ?? [];
    const sorted = [...reps].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
    if (sortDir === "asc") sorted.reverse();
    return sorted;
  }, [data, sortKey, sortDir]);

  const totals = data?.totals;

  function SortHeader({ column }: { column: { key: SortKey; label: string } }) {
    const active = sortKey === column.key;
    const Icon = active ? (sortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        onClick={() => toggleSort(column.key)}
        className="inline-flex items-center gap-1 transition-colors"
        style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
      >
        {column.label}
        <Icon className="h-3 w-3" style={{ opacity: active ? 1 : 0.5 }} />
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Team Dashboard
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Sales rep performance · last 7 days
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile sort control */}
          <div className="sm:hidden">
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-8 text-[13px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[13px] font-medium transition-all active:scale-[0.97] disabled:opacity-50"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Team summary KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {loading || !totals ? (
          Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard label="Open Deals" value={totals.open_deals} icon={<Briefcase className="h-4 w-4" />} accent />
            <KpiCard label="Won (7d)" value={totals.won_7d} icon={<Trophy className="h-4 w-4" />} />
            <KpiCard label="Open Tasks" value={totals.open_tasks} icon={<ListTodo className="h-4 w-4" />} />
            <KpiCard label="Tasks Done (7d)" value={totals.tasks_done_7d} icon={<CheckCircle2 className="h-4 w-4" />} />
            <KpiCard
              label="Calls Answered (7d)"
              value={totals.calls_answered_7d}
              sub={`${totals.calls_missed_7d} missed`}
              icon={<PhoneCall className="h-4 w-4" />}
            />
            <KpiCard
              label="Unanswered Msgs"
              value={totals.unanswered_messages_7d}
              icon={<MailWarning className="h-4 w-4" />}
              warning={totals.unanswered_messages_7d > 0}
            />
          </>
        )}
      </div>

      {error && (
        <div
          className="rounded-[10px] border px-4 py-3 text-sm"
          style={{
            background: "var(--color-danger-bg)",
            borderColor: "var(--color-danger-border)",
            color: "var(--color-danger-text-deep)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Desktop scoreboard table ── */}
      <div
        className="hidden lg:block rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--color-border)" }}
      >
        <table className="w-full text-sm">
          <thead
            style={{
              background: "color-mix(in srgb, var(--color-border) 30%, transparent)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                <SortHeader column={{ key: "name", label: "Rep" }} />
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <SortHeader column={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--color-border)" : undefined }}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-4 w-16 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              sortedReps.map((rep, idx) => (
                <tr
                  key={rep.owner_id}
                  className="transition-colors"
                  style={{
                    background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                    borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")
                  }
                >
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{
                          background: `color-mix(in srgb, ${AVATAR_TINTS[idx % AVATAR_TINTS.length]} 15%, transparent)`,
                          color: AVATAR_TINTS[idx % AVATAR_TINTS.length],
                        }}
                      >
                        {initials(rep.name)}
                      </span>
                      <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {rep.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><Stat value={rep.open_deals} /></td>
                  <td className="px-4 py-3.5"><Stat value={rep.won_7d} muted /></td>
                  <td className="px-4 py-3.5"><Stat value={rep.open_tasks} /></td>
                  <td className="px-4 py-3.5"><Stat value={rep.tasks_done_7d} muted /></td>
                  <td className="px-4 py-3.5">
                    <CallBar answered={rep.calls_answered_7d} missed={rep.calls_missed_7d} />
                  </td>
                  <td className="px-4 py-3.5">
                    {rep.unanswered_messages_7d > 0 ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
                        style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)" }}
                      >
                        {rep.unanswered_messages_7d}
                      </span>
                    ) : (
                      <Stat value={0} muted />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && totals && (
            <tfoot>
              <tr
                style={{
                  borderTop: "2px solid var(--color-border)",
                  background: "color-mix(in srgb, var(--color-border) 20%, transparent)",
                }}
              >
                <td className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                  Team total
                </td>
                <td className="px-4 py-3.5"><Stat value={totals.open_deals} /></td>
                <td className="px-4 py-3.5"><Stat value={totals.won_7d} /></td>
                <td className="px-4 py-3.5"><Stat value={totals.open_tasks} /></td>
                <td className="px-4 py-3.5"><Stat value={totals.tasks_done_7d} /></td>
                <td className="px-4 py-3.5">
                  <CallBar answered={totals.calls_answered_7d} missed={totals.calls_missed_7d} />
                </td>
                <td className="px-4 py-3.5"><Stat value={totals.unanswered_messages_7d} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Mobile / tablet rep cards ── */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[10px] border p-4 space-y-3 animate-pulse"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="h-4 w-28 rounded" style={{ background: "var(--color-border)" }} />
              <div className="h-3 w-40 rounded" style={{ background: "var(--color-border)" }} />
            </div>
          ))
        ) : (
          sortedReps.map((rep, idx) => (
            <div
              key={rep.owner_id}
              className="rounded-[10px] border p-4 space-y-3"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${AVATAR_TINTS[idx % AVATAR_TINTS.length]} 15%, transparent)`,
                    color: AVATAR_TINTS[idx % AVATAR_TINTS.length],
                  }}
                >
                  {initials(rep.name)}
                </span>
                <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {rep.name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>Open Deals</span>
                  <Stat value={rep.open_deals} />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>Won</span>
                  <Stat value={rep.won_7d} muted />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>Open Tasks</span>
                  <Stat value={rep.open_tasks} />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>Done</span>
                  <Stat value={rep.tasks_done_7d} muted />
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>Unanswered</span>
                  {rep.unanswered_messages_7d > 0 ? (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
                      style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)" }}
                    >
                      {rep.unanswered_messages_7d}
                    </span>
                  ) : (
                    <Stat value={0} muted />
                  )}
                </div>
              </div>
              <div className="pt-1">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                  Calls (answered / missed)
                </p>
                <CallBar answered={rep.calls_answered_7d} missed={rep.calls_missed_7d} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
