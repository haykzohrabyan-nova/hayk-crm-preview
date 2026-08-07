"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  PhoneMissed,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  User2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Voicemail,
} from "lucide-react";
import { formatPhone } from "@/lib/utils/phone";
import { ToastBanner } from "@/components/ui/toast-banner";

type State = "missed" | "answered" | "all";
type Range = "today" | "yesterday" | "7d" | "all";

type Call = {
  id: string;
  direction: string | null;
  missed: boolean;
  caller: string;
  phone: string | null;
  received_at: string;
  summary: string | null;
  contact_id: string | null;
  owner_name: string | null;
  returned: boolean;
  tier: "warning" | "danger" | null;
  has_voicemail: boolean;
  voicemail_task: boolean;
};

type Counts = { missed: number; answered: number; all: number };

const TABS: { id: State; label: string }[] = [
  { id: "missed", label: "Missed" },
  { id: "answered", label: "Answered" },
  { id: "all", label: "All" },
];

const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "all", label: "All" },
];

/** Localized date + time without the year (e.g. "Aug 7, 2:14 PM"). */
function formatCallTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Row accent tokens by call state — only not-returned missed calls go red/amber. */
function rowTheme(call: Call): { bg: string; border: string } {
  if (call.missed && !call.returned) {
    if (call.tier === "warning") {
      return { bg: "var(--color-warning-bg)", border: "var(--color-warning-border)" };
    }
    return { bg: "var(--color-danger-bg)", border: "var(--color-danger-border)" };
  }
  return { bg: "var(--color-surface)", border: "var(--color-border)" };
}

export function MissedCallsPage() {
  const [state, setState] = useState<State>("missed");
  const [range, setRange] = useState<Range>("all");
  const [calls, setCalls] = useState<Call[]>([]);
  const [counts, setCounts] = useState<Counts>({ missed: 0, answered: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/missed-calls?state=${state}&range=${range}`, {
        credentials: "include",
      });
      const data = await res.json();
      setCalls(Array.isArray(data.calls) ? data.calls : []);
      if (data.counts) setCounts(data.counts);
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [state, range]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTask(call: Call) {
    setCreatingId(call.id);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "followup",
          label: `Call back ${call.caller}`,
          contact_id: call.contact_id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({
          message: `Follow-up task created${data.task?.owner_name ? ` for ${data.task.owner_name}` : ""}.`,
          type: "success",
        });
      } else {
        setToast({ message: data.error ?? "Could not create task.", type: "error" });
      }
    } catch {
      setToast({ message: "Could not create task.", type: "error" });
    } finally {
      setCreatingId(null);
    }
  }

  const countFor = (id: State) =>
    id === "missed" ? counts.missed : id === "answered" ? counts.answered : counts.all;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Missed Calls
        </h1>

        {/* Daily range filter */}
        <div
          className="inline-flex items-center gap-0.5 rounded-[10px] border p-0.5"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          {RANGES.map((r) => {
            const active = range === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className="rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--color-btn-primary-bg)" : "transparent",
                  color: active ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setState(tab.id)}
            className="whitespace-nowrap px-4 py-2.5 text-[13px] font-medium transition-colors"
            style={{
              borderBottom: state === tab.id ? "2px solid var(--color-tab-underline)" : "2px solid transparent",
              color: state === tab.id ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
            }}
          >
            {tab.label}
            <span
              className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
              style={{
                background:
                  state === tab.id ? "var(--color-badge-bg)" : "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
                color: "var(--color-badge-text)",
              }}
            >
              {countFor(tab.id)}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex flex-col gap-2.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[12px]" style={{ background: "var(--color-surface)" }} />
          ))
        ) : calls.length === 0 ? (
          <div
            className="rounded-[12px] border p-10 text-center text-sm"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            {state === "missed"
              ? "No missed calls in this range. Nice."
              : state === "answered"
                ? "No answered calls in this range."
                : "No calls in this range."}
          </div>
        ) : (
          calls.map((call) => {
            const theme = rowTheme(call);
            const outbound = call.direction === "outbound";
            return (
              <div
                key={call.id}
                className="flex flex-col gap-3 rounded-[12px] border p-3.5 sm:flex-row sm:items-center sm:gap-4"
                style={{ background: theme.bg, borderColor: theme.border }}
              >
                {/* Icon */}
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background:
                      call.missed && !call.returned
                        ? call.tier === "warning"
                          ? "var(--color-warning)"
                          : "var(--color-danger)"
                        : "var(--color-success-bg)",
                    color:
                      call.missed && !call.returned ? "var(--color-text-inverse)" : "var(--color-success)",
                  }}
                >
                  {call.missed ? (
                    <PhoneMissed className="h-4 w-4" />
                  ) : outbound ? (
                    <PhoneOutgoing className="h-4 w-4" />
                  ) : (
                    <PhoneIncoming className="h-4 w-4" />
                  )}
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {call.caller}
                    </span>
                    {call.phone && call.phone !== call.caller && (
                      <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                        {formatPhone(call.phone)}
                      </span>
                    )}
                    <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      · {formatCallTime(call.received_at)}
                    </span>
                    {call.owner_name && (
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        <User2 className="h-3 w-3" />
                        {call.owner_name}
                      </span>
                    )}

                    {/* Returned / not-returned status pill (missed calls only) */}
                    {call.missed && <StatusPill call={call} />}

                    {/* Voicemail → task indicator */}
                    {call.has_voicemail && <VoicemailPill created={call.voicemail_task} />}
                  </div>
                  {call.summary && (
                    <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-muted)" }} title={call.summary}>
                      {call.summary}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {call.contact_id && call.caller && (
                    <Link
                      href={`/contact/${call.contact_id}`}
                      className="inline-flex items-center gap-1 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      View
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                  <button
                    onClick={() => createTask(call)}
                    disabled={creatingId === call.id}
                    className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {creatingId === call.id ? "Adding…" : "Create task"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

/** Returned (success) vs Not returned (danger >30m / amber <30m). */
function StatusPill({ call }: { call: Call }) {
  if (call.returned) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{
          background: "var(--color-success-bg)",
          color: "var(--color-success)",
          border: "1px solid var(--color-success-border)",
        }}
      >
        <CheckCircle2 className="h-3 w-3" />
        Returned
      </span>
    );
  }
  const warn = call.tier === "warning";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: warn ? "var(--color-warning-bg)" : "var(--color-danger-bg)",
        color: warn ? "var(--color-warning)" : "var(--color-danger)",
        border: `1px solid ${warn ? "var(--color-warning-border)" : "var(--color-danger-border)"}`,
      }}
    >
      <AlertTriangle className="h-3 w-3" />
      Not returned
    </span>
  );
}

/** Small indicator on voicemail rows; brighter when a task was auto-created. */
function VoicemailPill({ created }: { created: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: created ? "var(--color-info-bg)" : "var(--color-neutral-bg)",
        color: created ? "var(--color-info-text)" : "var(--color-neutral-text)",
        border: `1px solid ${created ? "var(--color-info-border)" : "var(--color-neutral-border)"}`,
      }}
    >
      <Voicemail className="h-3 w-3" />
      {created ? "Voicemail → task created" : "Voicemail"}
    </span>
  );
}
