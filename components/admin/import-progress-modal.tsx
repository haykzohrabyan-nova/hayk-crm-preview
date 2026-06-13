"use client";

import { createPortal } from "react-dom";
import { Loader2, CheckCircle2, XCircle, SkipForward } from "lucide-react";

export interface ImportProgress {
  total: number;
  processed: number;
  created: number;
  errors: number;
  skipped: number;
}

interface ImportProgressModalProps {
  label: string;        // "customers" | "leads" | "orders"
  progress: ImportProgress;
}

export function ImportProgressModal({ label, progress }: ImportProgressModalProps) {
  const { total, processed, created, errors, skipped } = progress;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const remaining = total - processed;

  return createPortal(
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/60" aria-hidden="true" />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] p-6 shadow-2xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        role="dialog"
        aria-label={`Importing ${label}`}
        aria-live="polite"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Loader2
            className="animate-spin shrink-0"
            size={22}
            style={{ color: "var(--color-accent)" }}
          />
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Importing {total.toLocaleString()} {label}…
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Please wait — do not close this tab
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-2 rounded-full overflow-hidden mb-3"
          style={{ background: "var(--color-border)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              background: "var(--color-accent)",
            }}
          />
        </div>

        {/* Counters row */}
        <div className="flex items-center justify-between text-xs mb-4">
          <span style={{ color: "var(--color-text-muted)" }}>
            <strong style={{ color: "var(--color-text-primary)" }}>{processed.toLocaleString()}</strong>
            {" / "}
            {total.toLocaleString()} processed
          </span>
          <span style={{ color: "var(--color-text-muted)" }}>
            {remaining > 0 ? `${remaining.toLocaleString()} left` : "Finishing up…"}
          </span>
        </div>

        {/* Status breakdown */}
        <div
          className="rounded-[8px] border p-3 grid grid-cols-3 gap-2 text-xs text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
        >
          <div className="flex flex-col items-center gap-1">
            <CheckCircle2 size={14} style={{ color: "var(--color-success)" }} />
            <span className="font-semibold tabular-nums" style={{ color: "var(--color-success)" }}>
              {created.toLocaleString()}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>Created</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <SkipForward size={14} style={{ color: "var(--color-warning)" }} />
            <span className="font-semibold tabular-nums" style={{ color: "var(--color-warning)" }}>
              {skipped.toLocaleString()}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>Skipped</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <XCircle size={14} style={{ color: "var(--color-danger)" }} />
            <span className="font-semibold tabular-nums" style={{ color: "var(--color-danger)" }}>
              {errors.toLocaleString()}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>Errors</span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
