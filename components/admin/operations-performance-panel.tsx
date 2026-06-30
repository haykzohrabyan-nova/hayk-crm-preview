"use client";

import {
  formatPerformanceRowSummary,
  type OperationsPerformanceRow,
} from "@/lib/utils/fetch-admin-operations-performance";
import { CircleHelp } from "lucide-react";

type MetricKey =
  | "leads_on_hand"
  | "unclaimed"
  | "claimed"
  | "in_progress"
  | "on_hold"
  | "rejected"
  | "quoted"
  | "sent_to_customer"
  | "ordered"
  | "completed";

const COUNT_COLUMNS: { key: MetricKey; label: string; title: string }[] = [
  {
    key: "leads_on_hand",
    label: "On hand",
    title: "Active deals (not rejected or completed). Should match the stage columns for this row.",
  },
  {
    key: "unclaimed",
    label: "Unclaimed",
    title: "Routed to sales, not yet claimed — Total row only",
  },
  { key: "claimed", label: "Claimed", title: "Claimed by rep, no quote ticket yet" },
  { key: "in_progress", label: "In progress", title: "Sales working — In Progress or Ongoing" },
  { key: "on_hold", label: "On hold", title: "On hold or follow up later" },
  { key: "rejected", label: "Rejected", title: "Rejected leads" },
  {
    key: "quoted",
    label: "Quoted",
    title: "Quote ticket exists — each deal is in only one stage column",
  },
  {
    key: "sent_to_customer",
    label: "Sent",
    title: "Subset of Quoted — quote sent to customer (not a separate pipeline stage)",
  },
  { key: "ordered", label: "Ordered", title: "Order ticket or in production" },
  { key: "completed", label: "Completed", title: "Completed orders (ticket_status = completed)" },
];

function PerformanceNameCell({
  name,
  summary,
  isTotal,
}: {
  name: string;
  summary: string | null;
  isTotal?: boolean;
}) {
  return (
    <td
      className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 align-top"
      style={{ color: "var(--color-text-primary)" }}
    >
      <div
        className={`lg:text-xs xl:text-sm truncate max-w-[200px] ${isTotal ? "font-semibold" : "font-medium"}`}
        title={name}
      >
        {name}
      </div>
      {summary ? (
        <p
          className="mt-0.5 text-[10px] leading-snug max-w-[220px]"
          style={{ color: "var(--color-text-muted)" }}
          title={summary}
        >
          {summary}
        </p>
      ) : null}
    </td>
  );
}

function PerformanceRowCells({
  row,
  isTotal,
}: {
  row: OperationsPerformanceRow;
  isTotal?: boolean;
}) {
  return (
    <>
      {COUNT_COLUMNS.map((col) => (
        <td
          key={col.key}
          className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 text-center tabular-nums lg:text-xs xl:text-sm"
          style={{
            color:
              row[col.key] > 0
                ? "var(--color-text-primary)"
                : "var(--color-text-muted)",
            fontWeight: isTotal ? 500 : 400,
          }}
        >
          {col.key === "unclaimed" && !isTotal ? "—" : row[col.key]}
        </td>
      ))}
      <td
        className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 text-right tabular-nums lg:text-xs xl:text-sm whitespace-nowrap"
        style={{ color: "var(--color-success)", fontWeight: isTotal ? 500 : 400 }}
      >
        {row.paid_so_far_label}
      </td>
      <td
        className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 text-right tabular-nums lg:text-xs xl:text-sm whitespace-nowrap"
        style={{ color: "var(--color-warning)", fontWeight: isTotal ? 500 : 400 }}
      >
        {row.awaiting_payment_label}
      </td>
    </>
  );
}

export function OperationsPerformancePanel({
  totals,
  users,
  loading,
}: {
  totals: OperationsPerformanceRow | null;
  users: OperationsPerformanceRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div
        className="rounded-b-xl border border-t-0 overflow-hidden p-8"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 rounded" style={{ background: "var(--color-border)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!totals) {
    return (
      <div
        className="rounded-b-xl border border-t-0 px-4 py-16 text-center text-sm"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }}
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
        className="mx-4 mt-4 mb-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed"
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
          <div className="space-y-1 min-w-0">
            <p className="font-medium" style={{ color: "var(--color-info-text-deep)" }}>
              How to read this table
            </p>
            <p>
              <span className="font-medium">On hand</span> is the total active deals for each rep in the
              selected date range. Each deal sits in{" "}
              <span className="font-medium">one stage column</span> (Quoted, Ordered, etc.) — those
              columns should add up to On hand.{" "}
              <span className="font-medium">Sent</span> is part of Quoted, not a separate stage.
              Per-user rows show a short breakdown under the name. Paid / Awaiting use open order
              balances.
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] lg:table-fixed">
          <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              <th
                className="lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-left text-[11px] font-medium uppercase tracking-wider w-[18%]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Name
              </th>
              <th
                className="lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-left text-[11px] font-medium uppercase tracking-wider w-[10%]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Role
              </th>
              {COUNT_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  title={col.title}
                  className="lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-center text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {col.label}
                </th>
              ))}
              <th
                className="lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-right text-[11px] font-medium uppercase tracking-wider w-[9%]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Paid
              </th>
              <th
                className="lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-right text-[11px] font-medium uppercase tracking-wider w-[9%]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Awaiting
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              style={{
                background: "var(--color-badge-bg)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <PerformanceNameCell
                name={totals.full_name}
                summary={formatPerformanceRowSummary(totals, { includeUnclaimed: true })}
                isTotal
              />
              <td
                className="lg:px-2 lg:py-2.5 xl:px-2 xl:py-3 lg:text-xs xl:text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {totals.role_display_name}
              </td>
              <PerformanceRowCells row={totals} isTotal />
            </tr>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={COUNT_COLUMNS.length + 4}
                  className="px-4 py-12 text-center text-sm"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No team members with activity in this range.
                </td>
              </tr>
            ) : (
              users.map((row, idx) => (
                <tr
                  key={row.user_id}
                  style={{
                    background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  <PerformanceNameCell
                    name={row.full_name}
                    summary={formatPerformanceRowSummary(row)}
                  />
                  <td
                    className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 lg:text-xs xl:text-sm truncate"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {row.role_display_name}
                  </td>
                  <PerformanceRowCells row={row} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
