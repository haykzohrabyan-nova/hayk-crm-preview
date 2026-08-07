"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, RotateCcw, User2, CalendarClock, Building2, Tag, Plus } from "lucide-react";
import { REPS } from "@/lib/azat/reps";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { NewTaskModal } from "@/components/tasks/new-task-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────
type Task = {
  id: string;
  kind: string | null;
  label: string | null;
  due_at: string | null;
  done_at: string | null;
  owner_id: string | null;
  owner_name: string | null;
  contact_id: string | null;
  contact_name: string | null; // "who" — resolved name / company / phone / email
  company_name: string | null;
  deal_id: string | null;
  deal_title: string | null;
  what: string | null; // "what it's about" — deal/product/topic
  source_hint: string | null; // e.g. "from call"
  lead_id: string | null;
  category: TaskCategory; // action-type column, derived server-side in /api/tasks
};

// Human labels for the raw task.kind enum so the pill reads like plain English.
const KIND_LABELS: Record<string, string> = {
  followup: "Follow up",
  first_touch: "First touch",
  ask1: "Follow up",
  ask2: "Follow up",
  decide: "Decision",
  parked_return: "Re-engage",
  callback: "Call back",
  quote: "Quote",
  artwork: "Artwork",
};
function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Action-type ("functional") columns — what the rep must DO, not when it's due.
// Order and ids match the server-side derivation in /api/tasks (deriveCategory).
type TaskCategory = "callback" | "quote" | "deal" | "followup" | "done";

const COLUMNS: { id: TaskCategory; label: string; accent: string }[] = [
  { id: "callback", label: "Call back", accent: "var(--color-info-text)" },
  { id: "quote", label: "Send quote", accent: "var(--color-accent-dark)" },
  { id: "deal", label: "Create deal", accent: "var(--color-in-progress-text)" },
  { id: "followup", label: "Follow-up", accent: "var(--color-text-muted)" },
  { id: "done", label: "Done", accent: "var(--color-success)" },
];

type DateFilter = "all" | "today";

// ── Date helpers ──────────────────────────────────────────────────────────────
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** True when the task's due date falls within today (local time). */
function isDueToday(task: Task): boolean {
  if (!task.due_at) return false;
  const due = new Date(task.due_at).getTime();
  return due >= startOfToday() && due <= endOfToday();
}

/**
 * Column resolver. The server derives `category`, but fall back to the same
 * done-vs-followup default if an older payload lacks it, so the board never
 * silently drops a card.
 */
function columnOf(task: Task): TaskCategory {
  if (task.category) return task.category;
  return task.done_at ? "done" : "followup";
}

function isOverdue(task: Task): boolean {
  return !task.done_at && !!task.due_at && new Date(task.due_at).getTime() < startOfToday();
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TasksBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [owner, setOwner] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?owner=${encodeURIComponent(owner)}`, { credentials: "include" });
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDone(task: Task) {
    setTogglingId(task.id);
    // optimistic
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done_at: t.done_at ? null : new Date().toISOString() } : t)),
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}/toggle`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done_at: data.done_at } : t)));
      } else {
        void load();
      }
    } catch {
      void load();
    } finally {
      setTogglingId(null);
    }
  }

  // Date filter is applied client-side (owner is filtered server-side via the query).
  const visibleTasks = useMemo(
    () => (dateFilter === "today" ? tasks.filter(isDueToday) : tasks),
    [tasks, dateFilter],
  );

  const grouped = useMemo(() => {
    const g: Record<TaskCategory, Task[]> = { callback: [], quote: [], deal: [], followup: [], done: [] };
    for (const t of visibleTasks) g[columnOf(t)].push(t);
    return g;
  }, [visibleTasks]);

  const openCount = visibleTasks.filter((t) => !t.done_at).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Tasks
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{openCount}</span> open{" "}
            {openCount === 1 ? "task" : "tasks"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date filter — segmented All / Today (filters cards by due date) */}
          <div
            className="inline-flex items-center gap-0.5 rounded-[8px] border p-0.5 text-[13px] font-medium"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            role="group"
            aria-label="Filter tasks by due date"
          >
            {(["all", "today"] as DateFilter[]).map((f) => {
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
                  {f === "all" ? "All" : "Today"}
                </button>
              );
            })}
          </div>

          <span className="ml-1 text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
            Owner
          </span>
          <Select value={owner} onValueChange={(v) => setOwner(v ?? "all")}>
            <SelectTrigger size="sm" className="h-8 min-w-[150px] text-[13px]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)" }}>
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

          <Button size="sm" className="h-8" onClick={() => setNewTaskOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New task
          </Button>
        </div>
      </div>

      <NewTaskModal
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        onCreated={() => void load()}
      />

      {/* Kanban — a row of action-type columns. On narrow screens the whole row
          scrolls horizontally so columns keep a comfortable width (never squashed);
          on xl+ the five columns share the width evenly. */}
      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {COLUMNS.map((b) => {
          const items = grouped[b.id];
          return (
            <div
              key={b.id}
              className="flex w-[280px] shrink-0 flex-col xl:w-auto xl:min-w-0 xl:flex-1"
            >
              {/* Column header */}
              <div className="mb-2.5 flex items-center gap-2 px-0.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.accent }} />
                <span className="truncate text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-primary)" }}>
                  {b.label}
                </span>
                <span
                  className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
                  style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                >
                  {items.length}
                </span>
              </div>

              {/* Column body — scrolls independently when the column is long */}
              <div
                className="flex min-h-[120px] max-h-[calc(100vh-210px)] flex-1 flex-col gap-2.5 overflow-y-auto rounded-xl border p-2.5"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-[92px] animate-pulse rounded-[10px]" style={{ background: "var(--color-border)" }} />
                  ))
                ) : items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                    Nothing here
                  </p>
                ) : (
                  items.map((t) => (
                    <TaskCard key={t.id} task={t} toggling={togglingId === t.id} onToggle={() => toggleDone(t)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function TaskCard({ task, toggling, onToggle }: { task: Task; toggling: boolean; onToggle: () => void }) {
  const done = !!task.done_at;
  const overdue = isOverdue(task);

  const who = task.contact_name; // resolved name / company / phone / email
  // "What it's about" — prefer the explicit subject, fall back to the deal title,
  // and never duplicate the person's name back at them.
  const about = (task.what && task.what !== who ? task.what : null) ?? (task.deal_title && task.deal_title !== who ? task.deal_title : null);
  const action = task.label?.trim() || null;
  const kind = kindLabel(task.kind);

  return (
    <div
      className="rounded-[10px] border p-3 shadow-sm transition-shadow hover:shadow-md"
      style={{
        background: "var(--color-bg)",
        borderColor: "var(--color-border)",
        opacity: done ? 0.72 : 1,
      }}
    >
      {/* Row 1 — WHO it's about + done toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {who ? (
            <Link
              href={task.contact_id ? `/contact/${task.contact_id}` : `/crm?search=${encodeURIComponent(who)}`}
              className="block truncate text-[13px] font-semibold leading-snug hover:underline"
              style={{ color: "var(--color-text-primary)" }}
            >
              {who}
            </Link>
          ) : (
            <p className="truncate text-[13px] font-semibold leading-snug" style={{ color: "var(--color-text-muted)" }}>
              Unassigned contact
            </p>
          )}
          {task.company_name && (
            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              <Building2 className="h-3 w-3 shrink-0" />
              {task.company_name}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          disabled={toggling}
          title={done ? "Reopen task" : "Mark done"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 disabled:opacity-50"
          style={
            done
              ? { background: "var(--color-success-bg)", borderColor: "var(--color-success-border)", color: "var(--color-success)" }
              : { background: "transparent", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
          }
        >
          {done ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Row 2 — WHAT it's about */}
      {about && (
        task.deal_title && about === task.deal_title ? (
          <Link
            href={`/sales?search=${encodeURIComponent(task.deal_title)}`}
            className="mt-1.5 block truncate text-[12px] hover:underline"
            style={{ color: "var(--color-info-text)" }}
          >
            {about}
          </Link>
        ) : (
          <p className="mt-1.5 line-clamp-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {about}
          </p>
        )
      )}

      {/* Row 3 — WHAT to do: kind + action label */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {kind && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{ background: "var(--color-in-progress-bg)", color: "var(--color-in-progress-text)" }}
          >
            {kind}
          </span>
        )}
        {action && action.toLowerCase() !== (kind ?? "").toLowerCase() && (
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {action}
          </span>
        )}
      </div>

      {/* Row 4 — due date (overdue in red) + source + owner */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {task.due_at ? (
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: overdue ? "var(--color-danger)" : "var(--color-text-muted)" }}
          >
            <CalendarClock className="h-3 w-3" />
            {overdue ? "Overdue · " : ""}
            {formatDate(task.due_at)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            No due date
          </span>
        )}
        {task.source_hint && (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" />
            {task.source_hint}
          </span>
        )}
        {task.owner_name && (
          <span className="ml-auto inline-flex items-center gap-1">
            <User2 className="h-3 w-3" />
            {task.owner_name}
          </span>
        )}
      </div>
    </div>
  );
}
