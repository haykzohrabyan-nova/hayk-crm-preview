"use client";

import type { OperationsPerformanceRow } from "@/lib/utils/fetch-admin-operations-performance";
import {
  OperationsPerformanceTable,
  OperationsPerformanceTableSkeleton,
} from "@/components/admin/operations-performance-card";
import { CircleHelp } from "lucide-react";

export function OperationsPerformancePanel({
  totals,
  users,
  loading,
  periodLabel = "Selected date range",
}: {
  totals: OperationsPerformanceRow | null;
  users: OperationsPerformanceRow[];
  loading: boolean;
  periodLabel?: string;
}) {
  if (loading) {
    return (
      <div
        className="rounded-b-xl border border-t-0 overflow-hidden p-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <OperationsPerformanceTableSkeleton />
      </div>
    );
  }

  if (!totals) {
    return (
      <div
        className="rounded-b-xl border border-t-0 px-4 py-16 text-center text-sm"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        No performance data for this date range.
      </div>
    );
  }

  return (
    <div
      className="rounded-b-xl border border-t-0 overflow-hidden"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div
        className="mx-4 mt-4 mb-3 rounded-lg border px-3 py-2.5 text-xs leading-relaxed"
        style={{
          borderColor: "var(--color-info-border)",
          background: "var(--color-info-bg)",
          color: "var(--color-info-text-deep)",
        }}
      >
        <div className="flex gap-2">
          <CircleHelp
            className="size-3.5 shrink-0 mt-0.5"
            style={{ color: "var(--color-info-text)" }}
            aria-hidden
          />
          <p style={{ color: "var(--color-info-text-deep)" }}>
            Fixed columns align across every row. <span className="font-medium">Active</span> = open work;{" "}
            <span className="font-medium">Quoted</span> subline is sent vs not sent (same deals);{" "}
            <span className="font-medium">Ordered</span> is a separate stage.
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        {users.length === 0 ? (
          <>
            <OperationsPerformanceTable totals={totals} users={[]} periodLabel={periodLabel} />
            <p className="text-center text-sm py-6" style={{ color: "var(--color-text-muted)" }}>
              No team members with activity in this range.
            </p>
          </>
        ) : (
          <OperationsPerformanceTable totals={totals} users={users} periodLabel={periodLabel} />
        )}
      </div>
    </div>
  );
}
