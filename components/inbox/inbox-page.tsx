"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Flame,
  Clock,
  Mail,
  MessageSquare,
  Megaphone,
  AtSign,
  FileText,
  UserPlus,
  Sparkles,
  ClipboardList,
  Inbox as InboxIcon,
} from "lucide-react";
import { REPS } from "@/lib/azat/reps";
import { relativeTime } from "@/lib/utils/format";
import { ToastBanner } from "@/components/ui/toast-banner";
import { LogLeadDialog } from "@/components/inbox/log-lead-dialog";
import { NewTaskModal } from "@/components/tasks/new-task-modal";

type Item = {
  id: string;
  type: "comm" | "lead";
  channel: string;
  who: string;
  contact_id: string | null;
  lead_id: string | null;
  subject: string | null;
  summary: string;
  deal_signal: boolean;
  deal_reason: string | null;
  sentiment: string;
  waited_since: string;
  waited_ms: number;
  heat: "hot" | "warm";
};

type Counts = { total: number; hot: number; warm: number; comms: number; leads: number };

type Filter = "all" | "hot" | "deals";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All waiting" },
  { id: "hot", label: "Hot (>2h)" },
  { id: "deals", label: "Deal signals" },
];

const CHANNEL_META: Record<string, { label: string; Icon: typeof Mail }> = {
  email: { label: "Email", Icon: Mail },
  sms: { label: "SMS", Icon: MessageSquare },
  webform: { label: "Web form", Icon: FileText },
  ad_lead: { label: "Ad lead", Icon: Megaphone },
  ig_dm: { label: "Instagram DM", Icon: AtSign },
};

function channelMeta(channel: string) {
  return CHANNEL_META[channel] ?? { label: channel || "Lead", Icon: InboxIcon };
}

export function InboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, hot: 0, warm: 0, comms: 0, leads: 0 });
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [taskFor, setTaskFor] = useState<Item | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ownerFor, setOwnerFor] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox", { credentials: "include" });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.counts) setCounts(data.counts);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "hot") return items.filter((i) => i.heat === "hot");
    if (filter === "deals") return items.filter((i) => i.deal_signal);
    return items;
  }, [items, filter]);

  async function act(item: Item, action: "assign" | "convert") {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/inbox/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action,
          commId: item.type === "comm" ? item.id : undefined,
          leadId: item.type === "lead" ? item.id : undefined,
          ownerId: ownerFor[item.id] || undefined,
          title: item.subject || item.summary,
          summary: item.summary,
          contactId: item.contact_id,
          channel: item.channel,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({
          message:
            action === "convert"
              ? `Converted to a deal${data.owner_name ? ` for ${data.owner_name}` : ""}.`
              : `Assigned to ${data.owner_name ?? "a rep"}.`,
          type: "success",
        });
        // Optimistically drop the handled item from the queue.
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        setToast({ message: data.error ?? "Action failed.", type: "error" });
      }
    } catch {
      setToast({ message: "Action failed.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const countFor = (id: Filter) => (id === "hot" ? counts.hot : id === "deals" ? items.filter((i) => i.deal_signal).length : counts.total);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Unassigned Inbox
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Inbound with no rep yet — assign or convert before it goes cold. Oldest waiting first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LogLeadDialog onLogged={load} />
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
          >
            <Flame className="h-3.5 w-3.5" />
            {counts.hot} hot
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}
          >
            {counts.total} waiting
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
        {FILTERS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className="whitespace-nowrap px-4 py-2.5 text-[13px] font-medium transition-colors"
            style={{
              borderBottom: filter === tab.id ? "2px solid var(--color-tab-underline)" : "2px solid transparent",
              color: filter === tab.id ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
            }}
          >
            {tab.label}
            <span
              className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
              style={{
                background:
                  filter === tab.id ? "var(--color-badge-bg)" : "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
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
            <div key={i} className="h-[96px] animate-pulse rounded-[12px]" style={{ background: "var(--color-surface)" }} />
          ))
        ) : visible.length === 0 ? (
          <div
            className="rounded-[12px] border p-10 text-center text-sm"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            {filter === "hot"
              ? "Nothing overdue. Inbox is under control."
              : filter === "deals"
                ? "No unassigned deal signals right now."
                : "Inbox zero. No unassigned inbound waiting."}
          </div>
        ) : (
          visible.map((item) => {
            const { label: chLabel, Icon: ChIcon } = channelMeta(item.channel);
            const hot = item.heat === "hot";
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-[12px] border p-3.5 sm:flex-row sm:items-start sm:gap-4"
                style={{
                  background: hot ? "var(--color-danger-bg)" : "var(--color-surface)",
                  borderColor: hot ? "var(--color-danger-border)" : "var(--color-border)",
                }}
              >
                {/* Channel icon */}
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: hot ? "var(--color-danger)" : "var(--color-surface-hover, var(--color-surface))",
                    color: hot ? "var(--color-text-inverse)" : "var(--color-text-muted)",
                    border: hot ? "none" : "1px solid var(--color-border)",
                  }}
                >
                  <ChIcon className="h-4 w-4" />
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {item.contact_id ? (
                      <Link
                        href={`/contact/${item.contact_id}`}
                        className="text-[14px] font-semibold hover:underline"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {item.who}
                      </Link>
                    ) : (
                      <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {item.who}
                      </span>
                    )}
                    {/* Channel badge */}
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                      style={{ background: "color-mix(in srgb, var(--color-border) 45%, transparent)", color: "var(--color-text-muted)" }}
                    >
                      {chLabel}
                    </span>
                    {item.type === "lead" && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: "color-mix(in srgb, var(--color-info, #3b82f6) 16%, transparent)", color: "var(--color-info, #3b82f6)" }}
                      >
                        Lead
                      </span>
                    )}
                    {item.deal_signal && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: "color-mix(in srgb, var(--color-success) 16%, transparent)", color: "var(--color-success)" }}
                        title={item.deal_reason ?? "Looks like a quote / order opportunity"}
                      >
                        <Sparkles className="h-3 w-3" />
                        Deal signal
                      </span>
                    )}
                    {/* Aging flag */}
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: hot ? "var(--color-danger)" : "var(--color-warning, var(--color-text-muted))" }}
                    >
                      {hot ? <Flame className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      waiting {relativeTime(item.waited_since)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px]" style={{ color: "var(--color-text-secondary, var(--color-text-primary))" }} title={item.summary}>
                    {item.summary}
                  </p>
                  {item.subject && item.subject !== item.summary && (
                    <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-muted)" }} title={item.subject}>
                      {item.subject}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-[200px]">
                  <select
                    value={ownerFor[item.id] ?? ""}
                    onChange={(e) => setOwnerFor((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="h-8 rounded-[8px] border px-2 text-[12px] outline-none"
                    style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    <option value="">Auto (least busy)</option>
                    {REPS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => act(item, "assign")}
                      disabled={busyId === item.id}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-all active:scale-[0.97] disabled:opacity-50"
                      style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {busyId === item.id ? "…" : "Assign"}
                    </button>
                    {item.deal_signal && (
                      <button
                        onClick={() => act(item, "convert")}
                        disabled={busyId === item.id || !item.contact_id}
                        title={item.contact_id ? "Create a deal" : "Needs a linked contact first"}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-medium transition-all active:scale-[0.97] disabled:opacity-40"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Deal
                      </button>
                    )}
                    <button
                      onClick={() => setTaskFor(item)}
                      title="Create a task for a rep about this"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-[8px] border px-2.5 py-1.5 text-[12px] font-medium transition-all active:scale-[0.97]"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      Task
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

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
