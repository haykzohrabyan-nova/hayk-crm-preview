"use client";

import { formatDateTime, relativeTime } from "@/lib/utils/format";
import type { ResubmitListStatus } from "@/lib/utils/evidence-resubmit-list-status";

export function ResubmitStatusCell({ status }: { status: ResubmitListStatus }) {
  if (status.kind === "none") {
    return null;
  }

  const isRequested = status.kind === "requested";

  return (
    <div>
      <div
        className="text-sm font-medium"
        style={{ color: isRequested ? "var(--color-warning)" : "var(--color-success)" }}
      >
        {status.label}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
        {formatDateTime(status.at)}
        {relativeTime(status.at) ? ` · ${relativeTime(status.at)}` : ""}
      </div>
    </div>
  );
}
