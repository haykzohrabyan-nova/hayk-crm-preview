"use client";

// Unified lifecycle Pipeline board — ONE kanban strip that follows a customer from
// first contact to won/lost. The first columns (New Lead · Claimed) are leads; the
// rest (Deal (Specs) · Quoted · Approved · Paid · Won) are deals; Lost merges both.
// A record is a lead row or a deal row underneath — different tables, one board.
// Bucketing + dedupe happen server-side in /api/pipeline; this component only
// filters (Owner + date), groups by the returned `col`, and draws the cards.
// Design mirrors components/tasks/tasks-board.tsx (same repo conventions).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  User2,
  Building2,
  CalendarClock,
  Tag,
  AlertTriangle,
  RotateCcw,
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

// ── Types (mirror app/api/pipeline/route.ts) ────────────────────────────────────
type LeadCol = "new_lead" | "claimed" | "lost";
type DealCol = "specs" | "quoted" | "approved" | "paid" | "won" | "lost";
type ColKey = "new_lead" | "claimed" | "specs" | "quoted" | "approved" | "paid" | "won" | "lost";

type LeadItem = {
  id: string;
  type: "lead";
  col: LeadCol;
  contact_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  who: string;
  company: string | null;
  source: string | null;
  product: string | null;
  status: string | null;
  when: string | null;
  last_activity_at: string | null;
};

type DealItem = {
  id: string;
  type: "deal";
  col: DealCol;
  contact_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  who: string;
  company: string | null;
  title: string;
  value_cents: number;
  stage: string;
  source: string | null;
  in_hands_date: string | null;
  blocked: boolean;
  when: string | null;
  last_activity_at: string | null;
};

type Item = LeadItem | DealItem;

// ── Columns (left → right lifecycle order) ──────────────────────────────────────
const COLUMNS: { id: ColKey; label: string; accent: string }[] = [
  { id: "new_lead", label: "New Lead", accent: "var(--color-info-text)" },
  { id: "claimed", label: "Claimed", accent: "var(--color-accent-dark)" },
  { id: "specs", label: "Deal (Specs)", accent: "var(--color-in-progress-text)" },
  { id: "quoted", label: "Quoted", accent: "var(--color-warning-text-deep)" },
  { id: "approved", label: "Approved", accent: "var(--color-info-text-deep)" },
  { id: "paid", label: "Paid", accent: "var(--color-success)" },
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

// ── Component ────────────────────────────────────────────────────────────────
export function LifecycleBoard() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [owner, setOwner] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/pipeline", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load pipeline");
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setDeals(Array.isArray(data.deals) ? data.deals : []);
    } catch (e) {
      setErr((e as Error).message);
      setLeads([]);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = useCallback(
    (i: Item) => {
      if (owner !== "all" && i.owner_id !== owner) return false;
      return withinDate(i.when, dateFilter);
    },
    [owner, dateFilter],
  );

  const grouped = useMemo(() => {
    const g: Record<ColKey, Item[]> = {
      new_lead: [], claimed: [], specs: [], quoted: [], approved: [], paid: [], won: [], lost: [],
    };
    for (const l of leads) if (matches(l)) g[l.col].push(l);
    for (const d of deals) if (matches(d)) g[d.col].push(d);
    return g;
  }, [leads, deals, matches]);

  const totalLeads = COLUMNS.reduce(
    (a, c) => a + grouped[c.id].filter((i) => i.type === "lead").length, 0,
  );
  const totalDeals = COLUMNS.reduce(
    (a, c) => a + grouped[c.id].filter((i) => i.type === "deal").length, 0,
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Pipeline
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalLeads}</span> leads
            {" · "}
            <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalDeals}</span> deals
            {" — first contact to close"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

      {/* Kanban — columns scroll horizontally on narrow screens; each column body
          scrolls vertically. On 2xl+ the eight columns share the width evenly. */}
      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {COLUMNS.map((c) => {
          const items = grouped[c.id];
          const sum = items.reduce((a, i) => a + (i.type === "deal" ? i.value_cents : 0), 0);
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
                  items.map((i) =>
                    i.type === "lead" ? (
                      <LeadCard key={`l-${i.id}`} item={i} />
                    ) : (
                      <DealCard key={`d-${i.id}`} item={i} />
                    ),
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────────
function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] border p-3 shadow-sm transition-shadow hover:shadow-md"
      style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
    >
      {children}
    </div>
  );
}

// Lead cards link to /contact/{id} (no /lead route in this app); plain text when
// there's no linked contact.
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

function LeadCard({ item }: { item: LeadItem }) {
  return (
    <CardShell>
      <div className="min-w-0">
        <WhoLine who={item.who} contactId={item.contact_id} />
        {item.company && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            <Building2 className="h-3 w-3 shrink-0" />
            {item.company}
          </span>
        )}
      </div>

      {item.product && (
        <p className="mt-1.5 line-clamp-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          {item.product}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {item.source ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
          >
            {item.source}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" />
            No source
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" />
          {relativeTime(item.last_activity_at)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <User2 className="h-3 w-3" />
          {item.owner_name ?? "Unclaimed"}
        </span>
      </div>
    </CardShell>
  );
}

function DealCard({ item }: { item: DealItem }) {
  return (
    <CardShell>
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
        {item.blocked ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
          >
            <AlertTriangle className="h-3 w-3" />
            Blocked
          </span>
        ) : item.in_hands_date ? (
          <span className="inline-flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
            <CalendarClock className="h-3 w-3" />
            Due {item.in_hands_date}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
          style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}>
          {item.stage}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" />
          {relativeTime(item.last_activity_at)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <User2 className="h-3 w-3" />
          {item.owner_name ?? "Unassigned"}
        </span>
      </div>
    </CardShell>
  );
}
