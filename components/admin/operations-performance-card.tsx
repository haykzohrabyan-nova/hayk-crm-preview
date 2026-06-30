"use client";

import type { ReactNode } from "react";
import { RoleSessionPill } from "@/components/admin/user-session-card";
import {
  formatPerformanceQuotedCell,
  type OperationsPerformanceRow,
} from "@/lib/utils/fetch-admin-operations-performance";

type ColumnKey =
  | "active"
  | "claimed"
  | "in_progress"
  | "on_hold"
  | "quoted"
  | "ordered"
  | "rejected"
  | "completed"
  | "win_rate"
  | "paid"
  | "awaiting";

const METRIC_COLUMNS: { key: ColumnKey; label: string; title: string; align?: "left" | "center" | "right" }[] = [
  { key: "active", label: "Active", title: "Open pipeline — not completed or rejected", align: "center" },
  { key: "claimed", label: "Claimed", title: "Claimed, no quote yet", align: "center" },
  { key: "in_progress", label: "In prog", title: "In progress / ongoing", align: "center" },
  { key: "on_hold", label: "Hold", title: "On hold / follow up", align: "center" },
  { key: "quoted", label: "Quoted", title: "Quote stage — subline is sent vs not sent (same deals)", align: "center" },
  { key: "ordered", label: "Ordered", title: "Order / in production — separate from Quoted", align: "center" },
  { key: "rejected", label: "Rejected", title: "Not in Active", align: "center" },
  { key: "completed", label: "Done", title: "Completed — not in Active", align: "center" },
  { key: "win_rate", label: "Win %", title: "Completed ÷ (Completed + Rejected)", align: "center" },
  { key: "paid", label: "Paid", title: "Collected on open orders", align: "right" },
  { key: "awaiting", label: "Awaiting", title: "Balance due on open orders", align: "right" },
];

function winRateLabel(row: OperationsPerformanceRow): string {
  const denom = row.completed + row.rejected;
  if (denom <= 0) return "—";
  return `${Math.round((row.completed / denom) * 100)}%`;
}

function countCell(value: number, mutedZero = true): { text: string; muted: boolean } {
  if (value <= 0 && mutedZero) return { text: "—", muted: true };
  return { text: String(value), muted: false };
}

function MetricCell({
  align = "center",
  children,
  title,
}: {
  align?: "left" | "center" | "right";
  children: ReactNode;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`lg:px-2 lg:py-2 xl:px-2 xl:py-3 align-middle lg:text-xs xl:text-sm tabular-nums ${
        align === "right" ? "text-right" : align === "left" ? "text-left" : "text-center"
      }`}
    >
      {children}
    </td>
  );
}

export function OperationsPerformanceTableRow({
  row,
  isTotal = false,
  rowIndex = 0,
}: {
  row: OperationsPerformanceRow;
  isTotal?: boolean;
  rowIndex?: number;
}) {
  const initial = isTotal ? "∑" : (row.full_name ?? "?")[0]?.toUpperCase() ?? "?";
  const quotedCell = formatPerformanceQuotedCell(row.quoted, row.sent_to_customer);

  return (
    <tr
      style={{
        background: isTotal
          ? "var(--color-badge-bg)"
          : rowIndex % 2 === 1
            ? "var(--color-row-alt)"
            : "var(--color-surface)",
        borderTop: isTotal ? undefined : "1px solid var(--color-border)",
      }}
    >
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 align-middle whitespace-nowrap min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full lg:text-xs xl:text-sm font-medium"
            style={{
              background: "var(--color-btn-verify-bg)",
              color: "var(--color-btn-verify-text)",
            }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p
              className={`truncate max-w-[140px] lg:text-xs xl:text-sm ${isTotal ? "font-semibold" : "font-medium"}`}
              style={{ color: "var(--color-text-primary)" }}
              title={row.full_name}
            >
              {row.full_name}
            </p>
            {!isTotal ? (
              <div className="mt-0.5">
                <RoleSessionPill roleName={row.role_name} label={row.role_display_name} />
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {row.role_display_name}
              </span>
            )}
          </div>
        </div>
      </td>

      {METRIC_COLUMNS.map((col) => {
        if (col.key === "quoted") {
          return (
            <MetricCell key={col.key} title={quotedCell.title}>
              <div
                className="font-medium"
                style={{
                  color: row.quoted > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)",
                }}
              >
                {row.quoted > 0 ? quotedCell.primary : "—"}
              </div>
              {quotedCell.detail ? (
                <div className="text-xs leading-snug mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  {quotedCell.detail}
                </div>
              ) : null}
            </MetricCell>
          );
        }

        if (col.key === "paid") {
          return (
            <MetricCell key={col.key} align="right">
              <span className="font-medium" style={{ color: "var(--color-success)" }}>
                {row.paid_so_far_label}
              </span>
            </MetricCell>
          );
        }

        if (col.key === "awaiting") {
          return (
            <MetricCell key={col.key} align="right">
              <span
                className="font-medium"
                style={{
                  color:
                    row.awaiting_payment > 0 ? "var(--color-warning)" : "var(--color-text-muted)",
                }}
              >
                {row.awaiting_payment_label}
              </span>
            </MetricCell>
          );
        }

        if (col.key === "win_rate") {
          const wr = winRateLabel(row);
          return (
            <MetricCell key={col.key} title={col.title}>
              <span
                className="font-medium"
                style={{ color: wr === "—" ? "var(--color-text-muted)" : "var(--color-text-primary)" }}
              >
                {wr}
              </span>
            </MetricCell>
          );
        }

        if (col.key === "active") {
          const { text, muted } = countCell(row.leads_on_hand, false);
          return (
            <MetricCell key={col.key} title={col.title}>
              <span
                className="font-medium"
                style={{ color: muted ? "var(--color-text-muted)" : "var(--color-text-primary)" }}
              >
                {text}
              </span>
            </MetricCell>
          );
        }

        const valueMap: Record<string, number> = {
          claimed: row.claimed,
          in_progress: row.in_progress,
          on_hold: row.on_hold,
          ordered: row.ordered,
          rejected: row.rejected,
          completed: row.completed,
        };
        const val = valueMap[col.key] ?? 0;
        const { text, muted } = countCell(val);
        return (
          <MetricCell key={col.key} title={col.title}>
            <span
              className="font-medium"
              style={{ color: muted ? "var(--color-text-muted)" : "var(--color-text-primary)" }}
            >
              {text}
            </span>
          </MetricCell>
        );
      })}
    </tr>
  );
}

export function OperationsPerformanceTable({
  totals,
  users,
  periodLabel,
}: {
  totals: OperationsPerformanceRow;
  users: OperationsPerformanceRow[];
  periodLabel: string;
}) {
  return (
    <div
      className="rounded-[10px] border overflow-x-auto"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <table className="w-full min-w-[980px] lg:table-fixed">
        <colgroup>
          <col style={{ width: "17%" }} />
          {METRIC_COLUMNS.map((col) => (
            <col
              key={col.key}
              style={{ width: col.key === "quoted" ? "9%" : col.key === "paid" || col.key === "awaiting" ? "8%" : "6%" }}
            />
          ))}
        </colgroup>
        <thead
          style={{
            background: "color-mix(in srgb, var(--color-border) 30%, transparent)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <tr>
            <th
              className="lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-left text-[11px] font-medium uppercase tracking-wider whitespace-nowrap"
              style={{ color: "var(--color-text-muted)" }}
            >
              Name
            </th>
            {METRIC_COLUMNS.map((col) => (
              <th
                key={col.key}
                title={col.title}
                className={`lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap ${
                  col.align === "right" ? "text-right" : "text-center"
                }`}
                style={{ color: "var(--color-text-muted)" }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <OperationsPerformanceTableRow row={totals} isTotal />
          {users.map((row, idx) => (
            <OperationsPerformanceTableRow key={row.user_id} row={row} rowIndex={idx} />
          ))}
        </tbody>
      </table>
      <p
        className="px-3 py-2 text-xs border-t"
        style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}
      >
        {periodLabel.toLowerCase()} · — = zero for that metric
      </p>
    </div>
  );
}

export function OperationsPerformanceTableSkeleton() {
  return (
    <div
      className="rounded-[10px] border overflow-hidden animate-pulse"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="h-10 border-b" style={{ borderColor: "var(--color-border)", background: "color-mix(in srgb, var(--color-border) 40%, transparent)" }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-12 border-b last:border-b-0"
          style={{ borderColor: "var(--color-border)", background: i % 2 ? "var(--color-row-alt)" : "var(--color-surface)" }}
        />
      ))}
    </div>
  );
}
