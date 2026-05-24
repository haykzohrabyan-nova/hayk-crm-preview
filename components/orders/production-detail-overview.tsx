"use client";

/** Production-stage notices — stats and actions live in sibling components. */
export function ProductionDetailOverview({
  completeNotice,
  completeNoticeIsWarning,
}: {
  ticket: unknown;
  userRole?: string | null;
  saving?: boolean;
  onMarkComplete?: () => void;
  completeNotice?: string | null;
  completeNoticeIsWarning?: boolean;
}) {
  if (!completeNotice) return null;

  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{
        borderColor: completeNoticeIsWarning ? "var(--color-warning-border)" : "var(--color-success-border)",
        background: completeNoticeIsWarning ? "var(--color-warning-bg)" : "var(--color-success-bg)",
        color: completeNoticeIsWarning ? "var(--color-warning-text-deep)" : "var(--color-success)",
      }}
    >
      {completeNotice}
    </div>
  );
}
