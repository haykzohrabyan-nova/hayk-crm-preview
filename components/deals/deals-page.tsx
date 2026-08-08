"use client";

// Deals board — a kanban of every azat.deals row, grouped into six stage buckets
// (Specs · Quote · Approval · Payment · Won · Lost). Mirrors the deal side of the
// Pipeline board (components/pipeline/lifecycle-board.tsx): same card style, same
// Owner + date filters, same responsive horizontal-scroll column strip.
// Bucketing happens server-side in /api/deals-list; this component filters
// (Owner + date), groups by the returned `bucket`, and draws the cards.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  User2,
  Building2,
  CalendarClock,
  RotateCcw,
  LayoutGrid,
  Table2,
} from "lucide-react";
import { REPS } from "@/lib/azat/reps";
import { relativeTime } from "@/lib/utils/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types (mirror app/api/deals-list/route.ts) ──────────────────────────────────
type DealBucket = "specs" | "quote" | "approval" | "payment" | "won" | "lost";

type DealItem = {
  id: string;
  bucket: DealBucket;
  stage: string;
  title: string;
  value_cents: number;
  owner_id: string | null;
  owner_name: string | null;
  contact_id: string | null;
  who: string;
  company: string | null;
  created_at: string | null;
  last_activity_at: string | null;
};

// ── Columns (left → right) ───────────────────────────────────────────────────────
const COLUMNS: { id: DealBucket; label: string; accent: string }[] = [
  { id: "specs", label: "Specs", accent: "var(--color-in-progress-text)" },
  { id: "quote", label: "Quote", accent: "var(--color-warning-text-deep)" },
  { id: "approval", label: "Approval", accent: "var(--color-info-text-deep)" },
  { id: "payment", label: "Payment", accent: "var(--color-accent-dark)" },
  { id: "won", label: "Won", accent: "var(--color-success)" },
  { id: "lost", label: "Lost", accent: "var(--color-danger)" },
];

const money = (c: number) => `$${((c ?? 0) / 100).toLocaleString()}`;

type DateFilter = "all" | "7d" | "30d";
const DATE_LABEL: Record<DateFilter, string> = { all: "All", "7d": "Last 7 days", "30d": "Last 30" };

function withinDate(when: string | null, filter: DateFilter): boolean {
  if (filter === "all") return true;
  if (!when) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (filter === "7d" ? 6 : 29));
  return new Date(when).getTime() >= start.getTime();
}

type View = "board" | "table";

// ── Component ────────────────────────────────────────────────────────────────
export function DealsPage() {
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [owner, setOwner] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [view, setView] = useState<View>("board");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/deals-list", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load deals");
      setDeals(Array.isArray(data.deals) ? data.deals : []);
    } catch (e) {
      setErr((e as Error).message);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = useCallback(
    (d: DealItem) => {
      if (owner !== "all" && d.owner_id !== owner) return false;
      return withinDate(d.created_at, dateFilter);
    },
    [owner, dateFilter],
  );

  const filtered = useMemo(() => deals.filter(matches), [deals, matches]);

  const grouped = useMemo(() => {
    const g: Record<DealBucket, DealItem[]> = {
      specs: [], quote: [], approval: [], payment: [], won: [], lost: [],
    };
    for (const d of filtered) g[d.bucket].push(d);
    return g;
  }, [filtered]);

  const total = filtered.length;
  const totalValue = filtered.reduce((a, d) => a + d.value_cents, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Deals
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{total}</span> deals
            {" · "}
            <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{money(totalValue)}</span> in pipeline
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle — board / table */}
          <div
            className="inline-flex items-center gap-0.5 rounded-[8px] border p-0.5"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            role="group"
            aria-label="View"
          >
            {([
              { id: "board" as View, label: "Board", Icon: LayoutGrid },
              { id: "table" as View, label: "Table", Icon: Table2 },
            ]).map(({ id, label, Icon }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  aria-pressed={active}
                  title={label}
                  className="inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[13px] font-medium transition-all"
                  style={{
                    background: active ? "var(--color-btn-verify-bg)" : "transparent",
                    color: active ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Date filter — segmented All / Last 7 days / Last 30 */}
          <div
            className="inline-flex items-center gap-0.5 rounded-[8px] border p-0.5 text-[13px] font-medium"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            role="group"
            aria-label="Filter by date"
          >
            {(["all", "7d", "30d"] as DateFilter[]).map((f) => {
              const active = dateFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDateFilter(f)}
                  aria-pressed={active}
                  className="rounded-[6px] px-3 py-1 transition-all"
                  style={{
                    background: active ? "var(--color-btn-verify-bg)" : "transparent",
                    color: active ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                  }}
                >
                  {DATE_LABEL[f]}
                </button>
              );
            })}
          </div>

          <span className="ml-1 text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
            Owner
          </span>
          <Select value={owner} onValueChange={(v) => setOwner(v ?? "all")}>
            <SelectTrigger
              size="sm"
              className="h-8 min-w-[150px] text-[13px]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)" }}
            >
              <SelectValue placeholder="All reps">
                {owner === "all" ? "All reps" : REPS.find((r) => r.id === owner)?.name ?? "All reps"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {REPS.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {err && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px]"
          style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
        >
          <span>{err}</span>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium"
            style={{ borderColor: "currentColor" }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      )}

      {view === "board" ? (
        /* Kanban — columns scroll horizontally on narrow screens; each column body
           scrolls vertically. On 2xl+ the six columns share the width evenly. */
        <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {COLUMNS.map((c) => {
            const items = grouped[c.id];
            const sum = items.reduce((a, i) => a + i.value_cents, 0);
            return (
              <div
                key={c.id}
                className="flex w-[260px] shrink-0 flex-col 2xl:w-auto 2xl:min-w-0 2xl:flex-1"
              >
                {/* Column header — accent dot, label, count (+ value sum) */}
                <div className="mb-2.5 flex items-center gap-2 px-0.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.accent }} />
                  <span
                    className="truncate text-[12px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {c.label}
                  </span>
                  <span
                    className="ml-auto inline-flex h-5 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold"
                    style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                  >
                    {items.length}
                    {sum > 0 && (
                      <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>· {money(sum)}</span>
                    )}
                  </span>
                </div>

                {/* Column body */}
                <div
                  className="flex min-h-[120px] max-h-[calc(100vh-230px)] flex-1 flex-col gap-2.5 overflow-y-auto rounded-xl border p-2.5"
                  style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
                >
                  {loading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-[86px] animate-pulse rounded-[10px]" style={{ background: "var(--color-border)" }} />
                    ))
                  ) : items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      Nothing here
                    </p>
                  ) : (
                    items.map((i) => <DealCard key={i.id} item={i} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DealTable items={filtered} loading={loading} />
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function WhoLine({ who, contactId }: { who: string; contactId: string | null }) {
  if (contactId) {
    return (
      <Link
        href={`/contact/${contactId}`}
        className="block truncate text-[13px] font-semibold leading-snug hover:underline"
        style={{ color: "var(--color-text-primary)" }}
      >
        {who}
      </Link>
    );
  }
  return (
    <p className="truncate text-[13px] font-semibold leading-snug" style={{ color: "var(--color-text-primary)" }}>
      {who}
    </p>
  );
}

function DealCard({ item }: { item: DealItem }) {
  return (
    <div
      className="rounded-[10px] border p-3 shadow-sm transition-shadow hover:shadow-md"
      style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
    >
      <div className="min-w-0">
        <WhoLine who={item.title} contactId={item.contact_id} />
        {item.company && item.company !== item.title && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            <Building2 className="h-3 w-3 shrink-0" />
            {item.company}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
        <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {money(item.value_cents)}
        </span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
          style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
        >
          {item.stage}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" />
          {relativeTime(item.last_activity_at)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <User2 className="h-3 w-3" />
          {item.owner_name ?? "Unassigned"}
        </span>
      </div>
    </div>
  );
}

// ── Table view (nice-to-have) ──────────────────────────────────────────────────
function DealTable({ items, loading }: { items: DealItem[]; loading: boolean }) {
  return (
    <div
      className="overflow-x-auto rounded-xl border [scrollbar-width:thin]"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr style={{ color: "var(--color-text-muted)" }}>
            {["Deal", "Company", "Stage", "Value", "Owner", "Updated"].map((h) => (
              <th
                key={h}
                className="border-b px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                style={{ borderColor: "var(--color-border)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                Loading…
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                No deals match these filters
              </td>
            </tr>
          ) : (
            items.map((d) => (
              <tr key={d.id} className="transition-colors hover:bg-[var(--color-surface-hover,transparent)]">
                <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
                  {d.contact_id ? (
                    <Link
                      href={`/contact/${d.contact_id}`}
                      className="font-medium hover:underline"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {d.title}
                    </Link>
                  ) : (
                    <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{d.title}</span>
                  )}
                </td>
                <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                  {d.company ?? "—"}
                </td>
                <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                    style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
                  >
                    {d.stage}
                  </span>
                </td>
                <td className="border-b px-3 py-2 font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                  {money(d.value_cents)}
                </td>
                <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                  {d.owner_name ?? "Unassigned"}
                </td>
                <td className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                  {relativeTime(d.last_activity_at)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
