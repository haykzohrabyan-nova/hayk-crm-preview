"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils/format";

export interface LedgerRow {
  ticket_id: string;
  reference_code: string | null;
  title: string | null;
  customer_label: string;
  sales_rep_name: string;
  sdr_name: string;
  quote_total: number;
  paid_in_period: number;
  total_paid: number;
  ticket_status: string;
  payments: {
    date: string;
    amount: number;
    method_label: string;
    mode: string;
  }[];
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    sent: "Quote sent",
    order: "Order",
    in_production: "In production",
    completed: "Completed",
    routed: "Routed",
  };
  return map[status] ?? status;
}

function modeLabel(mode: string): string {
  if (mode === "deposit") return "Deposit";
  if (mode === "balance") return "Balance";
  return "Full";
}

export function PaymentLedgerSection({
  rows,
  periodLabel,
}: {
  rows: LedgerRow[];
  periodLabel: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className="text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Payment Ledger
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Orders with payments recorded {periodLabel.toLowerCase()} — expand for line-item detail
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
        >
          {rows.length} order{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div
        className="rounded-[10px] border overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {rows.length === 0 ? (
          <p className="p-5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            No payments recorded in this period{periodLabel ? ` (${periodLabel.toLowerCase()})` : ""}.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {rows.map((row) => {
              const isOpen = expanded.has(row.ticket_id);
              const ref = row.reference_code ?? row.ticket_id.slice(0, 8);
              return (
                <div key={row.ticket_id}>
                  <button
                    type="button"
                    onClick={() => toggle(row.ticket_id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:opacity-90"
                    style={{ background: isOpen ? "var(--color-row-alt)" : "var(--color-surface)" }}
                  >
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[13px]" style={{ color: "var(--color-text-primary)" }}>
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
                        </div>
                        <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                          {row.customer_label}
                          {row.title ? ` · ${row.title}` : ""}
                        </p>
                        <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          Sales: {row.sales_rep_name}
                          {row.sdr_name !== "—" ? ` · SDR: ${row.sdr_name}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                            Paid {periodLabel.toLowerCase()}
                          </p>
                          <p className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--color-success)" }}>
                            {formatCurrency(row.paid_in_period)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                            Total paid
                          </p>
                          <p className="text-[13px] font-medium tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                            {formatCurrency(row.total_paid)}
                            <span className="text-[11px] font-normal" style={{ color: "var(--color-text-muted)" }}>
                              {" "}/ {formatCurrency(row.quote_total)}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div
                      className="border-t px-4 py-3 pl-11"
                      style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
                    >
                      <div className="mb-3 overflow-x-auto">
                        <table className="w-full min-w-[360px] text-[12px]">
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                              {["Date", "Amount", "Method", "Type"].map((h) => (
                                <th
                                  key={h}
                                  className="pb-2 text-left font-medium uppercase tracking-[0.06em] text-[10px]"
                                  style={{ color: "var(--color-text-muted)" }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {row.payments.map((p, i) => (
                              <tr key={`${p.date}-${i}`} style={{ borderTop: i > 0 ? "1px solid var(--color-border)" : undefined }}>
                                <td className="py-2" style={{ color: "var(--color-text-primary)" }}>
                                  {formatDate(p.date)}
                                </td>
                                <td className="py-2 font-medium tabular-nums" style={{ color: "var(--color-success)" }}>
                                  {formatCurrency(p.amount)}
                                </td>
                                <td className="py-2" style={{ color: "var(--color-text-muted)" }}>
                                  {p.method_label}
                                </td>
                                <td className="py-2" style={{ color: "var(--color-text-muted)" }}>
                                  {modeLabel(p.mode)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Link
                        href={`/payments/${row.ticket_id}`}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
                        style={{ color: "var(--color-tab-active)" }}
                      >
                        Open payment detail
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
