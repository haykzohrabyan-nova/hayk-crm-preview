"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { REPS } from "@/lib/azat/reps";
import { NewTaskModal } from "@/components/tasks/new-task-modal";
import { ToastBanner } from "@/components/ui/toast-banner";
import {
  Phone,
  MessageSquare,
  Mail,
  Camera,
  Megaphone,
  Globe,
  Store,
  HelpCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  CheckSquare,
  Briefcase,
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Check,
  type LucideIcon,
} from "lucide-react";

// ── Types (mirror /api/communications-explorer response) ────────────────────
type Processing = "task" | "deal" | "task_deal" | "needs_action" | "done";

type MatrixEntry = {
  channel: string;
  inbound: number;
  outbound: number;
  internal: number;
  total: number;
  real: number;
  noise: number;
};

type Totals = {
  inbound: number;
  outbound: number;
  internal: number;
  total: number;
  real: number;
  noise: number;
};

type Row = {
  id: string;
  channel: string;
  direction: string;
  when: string;
  who: string;
  contact_id: string | null;
  snippet: string;
  intent: string;
  next_step: string;
  sentiment: string;
  is_noise: boolean;
  processing: Processing;
};

type ApiResponse = {
  range: string;
  matrix: MatrixEntry[];
  totals: Totals;
  channels: string[];
  directions: string[];
  reps: { id: string; name: string }[];
  total_rows_in_window: number;
  returned: number;
  row_limit: number;
  rows: Row[];
};

// ── Channel presentation ─────────────────────────────────────────────────────
const CHANNEL_META: Record<string, { label: string; icon: LucideIcon }> = {
  call: { label: "Phone Call", icon: Phone },
  sms: { label: "SMS", icon: MessageSquare },
  email: { label: "Email", icon: Mail },
  ig_dm: { label: "Instagram", icon: Camera },
  instagram: { label: "Instagram", icon: Camera },
  ad_lead: { label: "Ad Lead", icon: Megaphone },
  webform: { label: "Web Form", icon: Globe },
  walk_in: { label: "Walk-in", icon: Store },
  unknown: { label: "Unknown", icon: HelpCircle },
};

// Preferred display order for known channels; unknown/others appended after.
const CHANNEL_ORDER = ["call", "email", "sms", "ig_dm", "instagram", "ad_lead", "webform", "walk_in"];

function channelMeta(ch: string) {
  return CHANNEL_META[ch] ?? { label: ch.replace(/_/g, " "), icon: HelpCircle };
}

function orderChannels(channels: string[]): string[] {
  return [...channels].sort((a, b) => {
    const ia = CHANNEL_ORDER.indexOf(a);
    const ib = CHANNEL_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

// ── Small style helpers (light + dark via CSS vars) ──────────────────────────
type Tone = { bg: string; border: string; text: string };
const TONE = {
  inbound: {
    bg: "var(--color-success-bg)",
    border: "var(--color-success-border)",
    text: "var(--color-success)",
  } as Tone,
  outbound: {
    bg: "var(--color-info-bg)",
    border: "var(--color-info-border)",
    text: "var(--color-info-text-deep)",
  } as Tone,
  internal: {
    bg: "var(--color-neutral-bg)",
    border: "var(--color-neutral-border)",
    text: "var(--color-neutral-text)",
  } as Tone,
  channel: {
    bg: "var(--color-neutral-bg)",
    border: "var(--color-neutral-border)",
    text: "var(--color-neutral-text)",
  } as Tone,
  task: {
    bg: "var(--color-info-bg)",
    border: "var(--color-info-border)",
    text: "var(--color-info-text-deep)",
  } as Tone,
  deal: {
    bg: "var(--color-success-bg)",
    border: "var(--color-success-border)",
    text: "var(--color-success)",
  } as Tone,
  task_deal: {
    bg: "var(--color-in-progress-bg)",
    border: "var(--color-in-progress-border)",
    text: "var(--color-in-progress-text)",
  } as Tone,
  needs_action: {
    bg: "var(--color-warning-bg)",
    border: "var(--color-warning-border)",
    text: "var(--color-warning-text-deep)",
  } as Tone,
  done: {
    bg: "var(--color-neutral-bg)",
    border: "var(--color-neutral-border)",
    text: "var(--color-neutral-text)",
  } as Tone,
  nextstep: {
    bg: "var(--color-surface)",
    border: "var(--color-border)",
    text: "var(--color-text-primary)",
  } as Tone,
};

function directionTone(dir: string): Tone {
  if (dir === "inbound") return TONE.inbound;
  if (dir === "outbound") return TONE.outbound;
  return TONE.internal;
}

const PROCESSING_META: Record<Processing, { label: string; icon: LucideIcon; tone: Tone }> = {
  task: { label: "→ Task", icon: CheckSquare, tone: TONE.task },
  deal: { label: "→ Deal", icon: Briefcase, tone: TONE.deal },
  task_deal: { label: "→ Task + Deal", icon: CheckSquare, tone: TONE.task_deal },
  needs_action: { label: "Needs action", icon: AlertTriangle, tone: TONE.needs_action },
  done: { label: "No action needed", icon: Check, tone: TONE.done },
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Reusable bits ─────────────────────────────────────────────────────────────
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors"
      style={{
        background: active ? "var(--color-primary)" : "var(--color-surface)",
        color: active ? "var(--color-primary-foreground)" : "var(--color-text-primary)",
        border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ tone, icon: Icon, children }: { tone: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text }}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function CommunicationsExplorer() {
  const [range, setRange] = useState<"today" | "7d" | "all">("all");
  const [direction, setDirection] = useState<string>("all");
  const [channel, setChannel] = useState<string>("all");
  const [rep, setRep] = useState<string>("all");
  const [showNoise, setShowNoise] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-row actions (mirrors the Inbox): a Task modal target + a Deal-convert busy id.
  const [taskFor, setTaskFor] = useState<Row | null>(null);
  const [dealBusyId, setDealBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Convert this comm's contact into a deal — reuses the Inbox convert path
  // (POST /api/inbox/assign, action "convert"). Requires a linked contact.
  const convertToDeal = useCallback(async (row: Row) => {
    if (!row.contact_id) return;
    setDealBusyId(row.id);
    try {
      const res = await fetch("/api/inbox/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "convert",
          commId: row.id,
          contactId: row.contact_id,
          title: row.intent || row.snippet || `Deal — ${row.who}`,
          summary: row.intent || row.snippet || undefined,
          channel: row.channel,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setToast({
          message: `Converted to a deal${json.owner_name ? ` for ${json.owner_name}` : ""}.`,
          type: "success",
        });
      } else {
        setToast({ message: json.error ?? "Could not create the deal.", type: "error" });
      }
    } catch {
      setToast({ message: "Could not create the deal.", type: "error" });
    } finally {
      setDealBusyId(null);
    }
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ range, direction, channel, rep });
    fetch(`/api/communications-explorer?${qs.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || `Request failed (${r.status})`);
        return json as ApiResponse;
      })
      .then((json) => setData(json))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [range, direction, channel, rep]);

  useEffect(() => {
    load();
  }, [load]);

  const matrix = useMemo(() => (data ? orderChannels(data.channels).map((ch) => data.matrix.find((m) => m.channel === ch)!).filter(Boolean) : []), [data]);
  const channelOptions = useMemo(() => (data ? orderChannels(data.channels) : []), [data]);
  const directionOptions = useMemo(() => {
    const base = ["inbound", "outbound"];
    if (data?.directions.some((d) => d !== "inbound" && d !== "outbound")) base.push("internal");
    return base;
  }, [data]);

  const totals = useMemo<Totals>(
    () => data?.totals ?? { inbound: 0, outbound: 0, internal: 0, total: 0, real: 0, noise: 0 },
    [data],
  );

  // Rows split into real conversations vs internal/noise. Noise is hidden unless toggled.
  const realRows = useMemo(() => (data?.rows ?? []).filter((r) => !r.is_noise), [data]);
  const noiseRows = useMemo(() => (data?.rows ?? []).filter((r) => r.is_noise), [data]);
  const visibleRows = useMemo(
    () => (showNoise ? data?.rows ?? [] : realRows),
    [showNoise, data, realRows],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Communications
          </h1>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Every communication by channel and direction — and whether it was turned into a next-step.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
          style={{
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Matrix / counts strip */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            What&apos;s flowing in vs out
          </span>
          <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {totals.total} total · {totals.inbound} in · {totals.outbound} out
            {totals.internal ? ` · ${totals.internal} internal` : ""}
          </span>
        </div>

        {/* Signal vs junk: real conversations split out from internal/signature noise */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip tone={TONE.deal} icon={CheckSquare}>
            {totals.real} real conversation{totals.real === 1 ? "" : "s"}
          </Chip>
          <Chip tone={TONE.internal} icon={EyeOff}>
            {totals.noise} internal / noise
          </Chip>
        </div>

        {loading && !data ? (
          <div className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Loading counts…
          </div>
        ) : matrix.length === 0 ? (
          <div className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            No communications in this window.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {matrix.map((m) => {
              const meta = channelMeta(m.channel);
              const Icon = meta.icon;
              return (
                <button
                  key={m.channel}
                  onClick={() => setChannel((c) => (c === m.channel ? "all" : m.channel))}
                  className="rounded-lg p-3 text-left transition-colors"
                  style={{
                    background: "var(--color-surface)",
                    border: `1px solid ${channel === m.channel ? "var(--color-primary)" : "var(--color-border)"}`,
                  }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="size-4" style={{ color: "var(--color-text-primary)" }} />
                    <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {meta.label}
                    </span>
                    <span className="ml-auto text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      {m.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={TONE.inbound} icon={ArrowDownLeft}>
                      {m.inbound} in
                    </Chip>
                    <Chip tone={TONE.outbound} icon={ArrowUpRight}>
                      {m.outbound} out
                    </Chip>
                    {m.internal ? <Chip tone={TONE.internal}>{m.internal} internal</Chip> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Direction toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
            Direction
          </span>
          <Pill active={direction === "all"} onClick={() => setDirection("all")}>
            All
          </Pill>
          {directionOptions.map((d) => (
            <Pill key={d} active={direction === d} onClick={() => setDirection(d)}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </Pill>
          ))}
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
            When
          </span>
          <Pill active={range === "today"} onClick={() => setRange("today")}>
            Today
          </Pill>
          <Pill active={range === "7d"} onClick={() => setRange("7d")}>
            7 days
          </Pill>
          <Pill active={range === "all"} onClick={() => setRange("all")}>
            All
          </Pill>
        </div>

        {/* Rep filter — row list only; the matrix/counts strip stays global. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
            Rep
          </span>
          <Pill active={rep === "all"} onClick={() => setRep("all")}>
            All reps
          </Pill>
          {REPS.map((r) => (
            <Pill key={r.id} active={rep === r.id} onClick={() => setRep(r.id)}>
              {r.name}
            </Pill>
          ))}
        </div>
      </div>

      {/* Channel filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
          Channel
        </span>
        <Pill active={channel === "all"} onClick={() => setChannel("all")}>
          All
        </Pill>
        {channelOptions.map((ch) => {
          const meta = channelMeta(ch);
          const Icon = meta.icon;
          return (
            <Pill key={ch} active={channel === ch} onClick={() => setChannel(ch)}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {meta.label}
              </span>
            </Pill>
          );
        })}
      </div>

      {/* Noise toggle — internal rep-to-rep notes & bare signatures are hidden by default */}
      {data && noiseRows.length > 0 ? (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowNoise((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              background: showNoise ? "var(--color-primary)" : "var(--color-surface)",
              color: showNoise ? "var(--color-primary-foreground)" : "var(--color-text-primary)",
              border: `1px solid ${showNoise ? "var(--color-primary)" : "var(--color-border)"}`,
            }}
          >
            {showNoise ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {showNoise ? "Hide internal/noise" : `Show internal/noise (${noiseRows.length})`}
          </button>
        </div>
      ) : null}

      {/* List */}
      <div
        className="overflow-hidden rounded-xl"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
      >
        {error ? (
          <div className="p-6 text-[13px]" style={{ color: "var(--color-danger)" }}>
            {error}
          </div>
        ) : loading && !data ? (
          <div className="p-6 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Loading communications…
          </div>
        ) : !data || visibleRows.length === 0 ? (
          <div className="p-6 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            {data && realRows.length === 0 && noiseRows.length > 0 && !showNoise
              ? "No real conversations here — only internal/noise. Use the toggle above to see them."
              : "No communications match these filters."}
          </div>
        ) : (
          <ul>
            {visibleRows.map((row, i) => {
              const meta = channelMeta(row.channel);
              const Icon = meta.icon;
              const dirTone = directionTone(row.direction);
              const proc = PROCESSING_META[row.processing];
              // What it's about: clean intent → headline (both from comm_ai) → raw snippet fallback.
              const about = row.intent || row.snippet;
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--color-border)",
                    background: row.is_noise
                      ? "var(--color-neutral-bg)"
                      : i % 2 === 1
                        ? "var(--color-row-alt)"
                        : "transparent",
                  }}
                >
                  {/* Channel icon */}
                  <div
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                  >
                    <Icon className="size-4" style={{ color: "var(--color-text-primary)" }} />
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    {/* WHAT IT IS: who + channel + direction */}
                    <div className="flex flex-wrap items-center gap-2">
                      {row.contact_id ? (
                        <Link
                          href={`/contact/${row.contact_id}`}
                          className="truncate text-[14px] font-semibold hover:underline"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {row.who}
                        </Link>
                      ) : (
                        <span className="truncate text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                          {row.who}
                        </span>
                      )}
                      <Chip tone={TONE.channel} icon={Icon}>
                        {meta.label}
                      </Chip>
                      <Chip
                        tone={dirTone}
                        icon={row.direction === "inbound" ? ArrowDownLeft : row.direction === "outbound" ? ArrowUpRight : undefined}
                      >
                        {row.direction}
                      </Chip>
                      {row.is_noise ? (
                        <Chip tone={TONE.internal} icon={EyeOff}>
                          internal / noise
                        </Chip>
                      ) : null}
                      <span className="ml-auto shrink-0 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                        {fmtWhen(row.when)}
                      </span>
                    </div>

                    {/* WHAT IT'S ABOUT: clean intent one-liner */}
                    <p
                      className="mt-1 line-clamp-2 text-[13px]"
                      style={{ color: about ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                    >
                      {about || <span className="italic">No content</span>}
                    </p>

                    {/* WHAT TO DO: next-step chip (real conversations only) */}
                    {!row.is_noise && row.next_step && row.next_step.toLowerCase() !== "no action needed" ? (
                      <div className="mt-1.5">
                        <Chip tone={TONE.nextstep} icon={ArrowRight}>
                          {row.next_step}
                        </Chip>
                      </div>
                    ) : null}
                  </div>

                  {/* Processing status + per-row actions (non-noise only) */}
                  <div className="mt-0.5 flex shrink-0 flex-col items-end gap-1.5">
                    <Chip tone={proc.tone} icon={proc.icon}>
                      {proc.label}
                    </Chip>
                    {!row.is_noise ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setTaskFor(row)}
                          title="Create a task about this"
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors active:scale-[0.97]"
                          style={{
                            background: "var(--color-surface)",
                            color: "var(--color-text-primary)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <CheckSquare className="size-3" />
                          Task
                        </button>
                        <button
                          onClick={() => void convertToDeal(row)}
                          disabled={!row.contact_id || dealBusyId === row.id}
                          title={row.contact_id ? "Convert this contact into a deal" : "Needs a linked contact first"}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors active:scale-[0.97] disabled:opacity-40"
                          style={{
                            background: "var(--color-surface)",
                            color: "var(--color-text-primary)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <Briefcase className="size-3" />
                          {dealBusyId === row.id ? "…" : "Deal"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data ? (
        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          Showing {visibleRows.length} of {data.returned} loaded
          {data.returned >= data.row_limit ? ` (capped at ${data.row_limit})` : ""}
          {noiseRows.length && !showNoise ? ` · ${noiseRows.length} internal/noise hidden` : ""} · read-only verification view
        </p>
      ) : null}

      {/* Per-row "Create task" — same wiring as the Inbox. */}
      <NewTaskModal
        open={!!taskFor}
        onOpenChange={(o) => { if (!o) setTaskFor(null); }}
        onCreated={() => { setTaskFor(null); setToast({ message: "Task created.", type: "success" }); }}
        defaultLabel={taskFor ? `Follow up — ${taskFor.who}` : undefined}
        defaultContact={taskFor?.contact_id ? { id: taskFor.contact_id, name: taskFor.who } : undefined}
      />

      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
