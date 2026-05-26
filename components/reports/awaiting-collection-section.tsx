"use client";

import Link from "next/link";
import { AlertCircle, ExternalLink, Hourglass } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { ticketLifecycleHrefWithReturn, REPORTS_RETURN_PATH } from "@/lib/utils/ticket-detail-href";
import type { OutstandingOrderRow } from "@/lib/utils/reports-awaiting-collection";

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    sent: "Quote sent",
    order: "Order",
    in_production: "In production",
    completed: "Completed",
  };
  return map[status] ?? status;
}

function BreakdownBars({
  items,
}: {
  items: { label: string; amount: number; count: number }[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        No outstanding balances right now.
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
              {item.label}
              <span className="ml-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                ({item.count})
              </span>
            </span>
            <span className="text-[12px] font-medium tabular-nums" style={{ color: "var(--color-warning)" }}>
              {formatCurrency(item.amount)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-border)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((item.amount / max) * 100)}%`,
                background: "var(--color-warning)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AwaitingCollectionSection({
  total,
  orderCount,
  collectedSoFar,
  bookedValue,
  pendingEvidenceCount,
  byStatus,
  orders,
  filtered,
}: {
  total: number;
  orderCount: number;
  collectedSoFar: number;
  bookedValue: number;
  pendingEvidenceCount: number;
  byStatus: { status: string; label: string; count: number; amount: number }[];
  orders: OutstandingOrderRow[];
  filtered?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Hourglass className="h-3.5 w-3.5" />
            Awaiting Collection
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {filtered
              ? "Current outstanding balance on this rep’s open orders — live snapshot"
              : "Money still owed on open orders — live snapshot, not limited to the selected period"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendingEvidenceCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                background: "var(--color-warning-bg)",
                color: "var(--color-warning-text-deep)",
                border: "1px solid var(--color-warning-border)",
              }}
            >
              <AlertCircle className="h-3 w-3" />
              {pendingEvidenceCount} pending review
            </span>
          )}
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
          >
            {orderCount} order{orderCount !== 1 ? "s" : ""} · {formatCurrency(total)} due
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div
          className="rounded-[10px] border p-5"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: "Balance due", value: formatCurrency(total), accent: true },
              { label: "Already paid", value: formatCurrency(collectedSoFar), accent: false },
              { label: "Order value", value: formatCurrency(bookedValue), accent: false },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                  {item.label}
                </p>
                <p
                  className="mt-1 text-[18px] font-semibold tabular-nums"
                  style={{ color: item.accent ? "var(--color-warning)" : "var(--color-text-primary)" }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          <BreakdownBars items={byStatus} />
        </div>

        <div
          className="rounded-[10px] border overflow-hidden"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          {orders.length === 0 ? (
            <p className="p-5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              All open orders are paid in full.
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto divide-y" style={{ borderColor: "var(--color-border)" }}>
              {orders.map((row) => {
                const ref = row.reference_code ?? row.ticket_id.slice(0, 8);
                return (
                  <div
                    key={row.ticket_id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    style={{ background: "var(--color-surface)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {ref}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                          style={{
                            background: "var(--color-neutral-bg)",
                            color: "var(--color-neutral-text)",
                            border: "1px solid var(--color-neutral-border)",
                          }}
                        >
                          {statusLabel(row.ticket_status)}
                        </span>
                        {row.evidence_pending && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background: "var(--color-warning-bg)",
                              color: "var(--color-warning-text-deep)",
                            }}
                          >
                            Evidence pending
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                        {row.customer_label}
                        {row.title ? ` · ${row.title}` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        Sales: {row.sales_rep_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                          Balance due
                        </p>
                        <p className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--color-warning)" }}>
                          {formatCurrency(row.balance_due)}
                        </p>
                        <p className="text-[11px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                          {formatCurrency(row.total_paid)} / {formatCurrency(row.quote_total)} paid
                        </p>
                      </div>
                      <Link
                        href={ticketLifecycleHrefWithReturn(row.ticket_id, row.ticket_status, REPORTS_RETURN_PATH)}
                        className="flex h-8 w-8 items-center justify-center rounded-[6px] transition-opacity hover:opacity-80"
                        style={{
                          background: "color-mix(in srgb, var(--color-tab-active) 10%, transparent)",
                          color: "var(--color-tab-active)",
                        }}
                        title="Open order"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
