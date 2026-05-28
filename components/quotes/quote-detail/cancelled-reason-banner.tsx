"use client";

import { XCircle } from "lucide-react";

export function CancelledReasonBanner({
  reasonLabel,
  notes,
}: {
  reasonLabel: string | null | undefined;
  notes?: string | null;
}) {
  if (!reasonLabel) return null;

  return (
    <div
      className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm border mb-4"
      style={{
        background: "var(--color-danger-bg)",
        borderColor: "var(--color-danger-border)",
        color: "var(--color-danger-text-deep, var(--color-danger))",
      }}
    >
      <XCircle size={16} className="shrink-0 mt-0.5" style={{ color: "var(--color-danger)" }} />
      <div className="min-w-0">
        <p className="font-medium" style={{ color: "var(--color-danger)" }}>
          Cancelled — {reasonLabel}
        </p>
        {notes?.trim() ? (
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-primary)" }}>
            {notes.trim()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
