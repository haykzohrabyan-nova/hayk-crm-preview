"use client";

import { Zap } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { priorityStyle, quickDate } from "./utils";
import type { LookupOption } from "./types";

interface InfoFormProps {
  /** When false, renders a read-only <dl> view using the ticket values. Default true. */
  editing?: boolean;
  /** Required in read-only mode (editing=false) to supply display values. */
  ticket?: {
    title: string | null;
    priority: string | null;
    due_date: string | null;
    rush: boolean;
    special_requirements: string | null;
    notes: string | null;
  };
  title: string; setTitle: (v: string) => void;
  priority: string; setPriority: (v: string) => void;
  dueDate: string; setDueDate: (v: string) => void;
  rush: boolean; setRush: (v: boolean) => void;
  specialRequirements: string; setSpecialRequirements: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  priorityOpts: LookupOption[];
  titleError?: string;
  dueDateError?: string;
  /** Earliest selectable due date (YYYY-MM-DD), e.g. ticket creation day. */
  minDueDate?: string;
}

export function InfoForm(p: InfoFormProps) {
  const editing = p.editing !== false;
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };

  if (!editing && p.ticket) {
    return (
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {([
          ["Title", p.ticket.title],
          ["Priority", p.ticket.priority],
          ["Due Date", p.ticket.due_date],
          ["Rush", p.ticket.rush ? "Yes — Rush order" : null],
          ["Special Requirements", p.ticket.special_requirements],
          ["Notes", p.ticket.notes],
        ] as [string, string | null][]).map(([label, val]) => val ? (
          <div key={label} className="col-span-1">
            <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</dt>
            <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>{val}</dd>
          </div>
        ) : null)}
      </dl>
    );
  }

  const PRIORITY_OPTS = (p.priorityOpts.length
    ? p.priorityOpts.map((o) => o.label)
    : ["Low", "Normal", "High"]
  ).filter((o) => o.toLowerCase() !== "urgent");

  return (
    <div className="space-y-5">
      {/* Title + Priority — 50/50 row */}
      <div className="grid grid-cols-2 gap-4">
        <div data-field-anchor="title">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Title <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <input
            value={p.title}
            onChange={(e) => p.setTitle(e.target.value)}
            placeholder="e.g. 500 Diecut Stickers — ACME Corp"
            className="w-full px-3 py-2 rounded-md text-sm border outline-none"
            style={{ ...fieldStyle, ...(p.titleError ? { border: "1px solid var(--color-danger)" } : {}) }}
          />
          {p.titleError && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.titleError}</p>
          )}
        </div>

        {/* Priority — segmented control */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Priority <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <div
            className="grid rounded-md overflow-hidden border"
            style={{ gridTemplateColumns: `repeat(${PRIORITY_OPTS.length}, 1fr)`, borderColor: "var(--color-border)" }}
          >
            {PRIORITY_OPTS.map((opt, i) => {
              const active = p.priority === opt;
              const { borderColor: _bc, ...colorStyle } = priorityStyle(opt, active);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => p.setPriority(opt)}
                  className={`py-2 text-sm font-medium transition-all${i < PRIORITY_OPTS.length - 1 ? " border-r" : ""}`}
                  style={{ ...colorStyle, borderColor: "var(--color-border)" }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Due Date + Rush Order — 50/50 row */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <div data-field-anchor="dueDate">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Due Date <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <div className="flex gap-2 items-center">
            <DatePicker
              value={p.dueDate}
              onChange={p.setDueDate}
              placeholder="Select due date"
              disablePast
              minDate={p.minDueDate}
              className="flex-1"
            />
            {[
              { label: "Today",    days: 0 },
              { label: "Tomorrow", days: 1 },
              { label: "+3d",      days: 3 },
            ].map(({ label, days }) => {
              const isActive = p.dueDate === quickDate(days);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => p.setDueDate(quickDate(days))}
                  className="px-3 py-2 rounded-md text-xs font-medium border whitespace-nowrap transition-all hover:opacity-80"
                  style={isActive ? {
                    background: "var(--color-btn-verify-bg)",
                    border: "1px solid var(--color-btn-verify-bg)",
                    color: "var(--color-btn-verify-text)",
                  } : {
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {p.dueDateError && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.dueDateError}</p>
          )}
        </div>

        {/* Rush Order toggle card */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Rush Order</label>
          <div
            className="flex items-center justify-between rounded-md px-4 py-2 cursor-pointer select-none h-[38px]"
            style={{
              background: p.rush ? "var(--color-warning-bg)" : "var(--color-surface)",
              border: `1px solid ${p.rush ? "var(--color-warning-border)" : "var(--color-border)"}`,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onClick={() => p.setRush(!p.rush)}
          >
            <div className="flex items-center gap-2">
              <Zap size={14} style={{ color: p.rush ? "var(--color-warning)" : "var(--color-text-muted)" }} />
              <span className="text-sm font-medium" style={{ color: p.rush ? "var(--color-warning)" : "var(--color-text-muted)" }}>
                {p.rush ? "Rush On" : "Rush Off"}
              </span>
            </div>
            <div
              className="relative w-11 h-6 rounded-full transition-colors shrink-0"
              style={{ background: p.rush ? "var(--color-warning)" : "var(--color-border)" }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{
                  background: "#fff",
                  left: p.rush ? "calc(100% - 22px)" : "2px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Special Requirements */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Special Requirements</label>
        <textarea
          value={p.specialRequirements}
          onChange={(e) => p.setSpecialRequirements(e.target.value)}
          rows={3}
          placeholder="Any special printing or finishing requirements…"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>

      {/* Internal Notes */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Internal Notes</label>
        <textarea
          value={p.notes}
          onChange={(e) => p.setNotes(e.target.value)}
          rows={3}
          placeholder="Notes visible to staff only…"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>
    </div>
  );
}
