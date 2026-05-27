"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { FileText, CheckCircle2, Clock, Loader2, CreditCard } from "lucide-react";
import {
  GLOBAL_LOADING_MESSAGES,
  useGlobalLoading,
} from "@/components/layout/global-loading-provider";
import {
  MobileListCard,
  MobileListCardRow,
  MobileListCardFields,
  MobileListCardSkeleton,
  MobileListCardEmpty,
} from "@/components/ui/mobile-list-card";
import {
  displayContactName,
  formatCurrency,
  formatDateTime,
  relativeTime,
} from "@/lib/utils/format";

interface PendingOrder {
  id: string;
  reference_code: string | null;
  title: string | null;
  quote_final_total: number | null;
  payment_method_used: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_url: string | null;
  payment_evidence_amount: number | null;
  payment_amount_received: number | null;
  deposit_paid_at: string | null;
  ticket_payment_strategy: string | null;
  ticket_status: string;
  customer: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  wire:    "Wire Transfer",
  ach:     "ACH / Bank",
  zelle:   "Zelle",
  check:   "Check",
  card:    "Card",
  cash:    "Cash",
  offline: "Offline",
  other:   "Other",
};

function fmt(n: number | null | undefined): string {
  return formatCurrency(n);
}

function customerLabel(order: PendingOrder): string {
  return displayContactName(order.customer);
}

function inferPaymentMode(order: PendingOrder): "deposit" | "balance" | "full" {
  const strategy = order.ticket_payment_strategy ?? "full";
  if (strategy === "full") return "full";
  if (order.deposit_paid_at) return "balance";
  return "deposit";
}

function claimedAmount(order: PendingOrder): number {
  if (order.payment_evidence_amount != null) return Number(order.payment_evidence_amount);
  const total = Number(order.quote_final_total ?? 0);
  const paid  = Number(order.payment_amount_received ?? 0);
  return Math.max(0, total - paid);
}

function TableSkeleton() {
  return (
    <tbody>
      <TableRowsSkeleton rows={3} cols={6} />
    </tbody>
  );
}

export function PaymentsPage() {
  const router = useRouter();
  const { showLoading, hideLoading } = useGlobalLoading();
  const [orders, setOrders]           = useState<PendingOrder[]>([]);
  const [loading, setLoading]         = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErr, setConfirmErr]     = useState<string | null>(null);

  const fetchPageData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/payments/page-data")
      .then((r) => r.json())
      .then((d) => {
        if (d.orders) setOrders(d.orders);
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useCoalescedRefresh(fetchPageData, [], {
    events: ["bazaar:tickets-changed", "bazaar:refresh-counts"],
  });

  async function handleConfirm(order: PendingOrder) {
    const amount = claimedAmount(order);
    if (amount <= 0) {
      setConfirmErr("No payment amount to confirm.");
      return;
    }

    setConfirmingId(order.id);
    setConfirmErr(null);
    showLoading(GLOBAL_LOADING_MESSAGES.confirmingPayment);

    try {
      const res = await fetch(`/api/tickets/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_payment: true,
          payment_mode: inferPaymentMode(order),
          payment_method: order.payment_method_used ?? "wire",
          payment_amount: amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmErr(data.error ?? "Failed to confirm payment.");
        return;
      }
      window.dispatchEvent(new Event("bazaar:tickets-changed"));
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      fetchPageData(true);
    } catch {
      setConfirmErr("Network error — please try again.");
    } finally {
      setConfirmingId(null);
      hideLoading();
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Payment Evidence Review
            </h1>
            {!loading && orders.length > 0 && (
              <span
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-2 text-[11px] font-semibold"
                style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)" }}
              >
                {orders.length} pending
              </span>
            )}
          </div>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--color-text-muted)" }}>
            Review uploaded payment proof, confirm the amount, and release orders to production.
          </p>
        </div>
        {!loading && orders.length > 0 && (
          <div
            className="flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm"
            style={{
              borderColor: "var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text-deep)",
            }}
          >
            <Clock size={15} style={{ flexShrink: 0 }} />
            <span>View evidence before confirming — customer is notified by email after approval.</span>
          </div>
        )}
      </div>

      {confirmErr && (
        <div
          className="rounded-[10px] border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--color-danger-border)",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
          }}
        >
          {confirmErr}
        </div>
      )}

      {/* Desktop table */}
      <div
        className="hidden lg:block rounded-[10px] border overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-row-alt)" }}>
              {["Order", "Customer", "Claimed", "Method", "Submitted", "Actions"].map((h) => (
                <th
                  key={h}
                  className={`px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider whitespace-nowrap ${
                    h === "Claimed" ? "text-right" : h === "Actions" ? "text-right" : ""
                  }`}
                  style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          {loading ? (
            <TableSkeleton />
          ) : orders.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <CheckCircle2 size={40} style={{ color: "var(--color-text-muted)" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      All caught up
                    </p>
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No orders pending payment review.
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {orders.map((order, i) => {
                const claimed = claimedAmount(order);
                const relTime = relativeTime(order.payment_evidence_submitted_at);
                const isConfirming = confirmingId === order.id;

                return (
                  <tr
                    key={order.id}
                    className="cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                    }}
                    onClick={() => router.push(`/payments/${order.id}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-row-hover)"; }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)";
                    }}
                  >
                    {/* Order */}
                    <td className="px-5 py-4 align-middle">
                      <span
                        className="text-sm font-semibold whitespace-nowrap"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {order.reference_code ?? order.id.slice(0, 8).toUpperCase()}
                      </span>
                      {order.title && (
                        <div className="text-xs mt-1 max-w-[160px] truncate" style={{ color: "var(--color-text-muted)" }}>
                          {order.title}
                        </div>
                      )}
                    </td>

                    {/* Customer */}
                    <td className="px-5 py-4 align-middle">
                      <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {customerLabel(order)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        Total {fmt(order.quote_final_total)}
                      </div>
                    </td>

                    {/* Claimed */}
                    <td className="px-5 py-4 align-middle text-right whitespace-nowrap">
                      <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                        {fmt(claimed)}
                      </div>
                      {order.quote_final_total != null && claimed < order.quote_final_total - 0.01 && (
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                          of {fmt(order.quote_final_total)}
                        </div>
                      )}
                    </td>

                    {/* Method */}
                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      {order.payment_method_used ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                        >
                          <CreditCard size={11} />
                          {CHANNEL_LABELS[order.payment_method_used] ?? order.payment_method_used}
                        </span>
                      ) : (
                        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* Submitted */}
                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                        <div>
                          <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                            {formatDateTime(order.payment_evidence_submitted_at)}
                          </div>
                          {relTime && (
                            <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                              {relTime}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2 flex-nowrap">
                        {order.payment_evidence_url && (
                          <a
                            href={`/api/tickets/${order.id}/evidence`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border whitespace-nowrap"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-text-primary)",
                              background: "var(--color-surface)",
                              textDecoration: "none",
                            }}
                            title="View payment evidence"
                          >
                            <FileText size={14} />
                            Evidence
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={isConfirming}
                          onClick={() => handleConfirm(order)}
                          className="inline-flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-[13px] font-medium disabled:opacity-60 whitespace-nowrap"
                          style={{
                            background: "var(--color-btn-primary-bg)",
                            color: "var(--color-btn-primary-text)",
                          }}
                        >
                          {isConfirming ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={14} />
                          )}
                          Confirm
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          <MobileListCardSkeleton count={2} />
        ) : orders.length === 0 ? (
          <MobileListCardEmpty message="No orders pending payment review." />
        ) : (
          orders.map((order) => {
            const claimed = claimedAmount(order);
            const relTime = relativeTime(order.payment_evidence_submitted_at);
            const isConfirming = confirmingId === order.id;

            return (
              <MobileListCard key={order.id} onClick={() => router.push(`/payments/${order.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
                      {order.reference_code ?? order.id.slice(0, 8).toUpperCase()}
                    </span>
                    {order.title && (
                      <p className="text-xs mt-1 truncate" style={{ color: "var(--color-text-muted)" }}>{order.title}</p>
                    )}
                    <p className="text-sm font-medium mt-1.5" style={{ color: "var(--color-text-primary)" }}>
                      {customerLabel(order)}
                    </p>
                  </div>
                  <span
                    className="text-sm font-semibold tabular-nums shrink-0"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {fmt(claimed)}
                  </span>
                </div>

                <MobileListCardFields>
                  <MobileListCardRow label="Order Total" value={fmt(order.quote_final_total)} />
                  <MobileListCardRow
                    label="Method"
                    value={
                      order.payment_method_used
                        ? (CHANNEL_LABELS[order.payment_method_used] ?? order.payment_method_used)
                        : "—"
                    }
                  />
                  <MobileListCardRow
                    label="Submitted"
                    value={
                      <>
                        {formatDateTime(order.payment_evidence_submitted_at)}
                        {relTime && (
                          <span className="block text-[10px] font-normal mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                            {relTime}
                          </span>
                        )}
                      </>
                    }
                  />
                </MobileListCardFields>

                <div className="flex flex-col gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {order.payment_evidence_url && (
                    <a
                      href={`/api/tickets/${order.id}/evidence`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2.5 text-[13px] font-medium border"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-primary)",
                        background: "var(--color-bg)",
                        textDecoration: "none",
                      }}
                    >
                      <FileText size={14} />
                      View Evidence
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={isConfirming}
                    onClick={() => handleConfirm(order)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-4 py-2.5 text-[13px] font-medium disabled:opacity-60"
                    style={{
                      background: "var(--color-btn-primary-bg)",
                      color: "var(--color-btn-primary-text)",
                    }}
                  >
                    {isConfirming ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Confirm Payment
                  </button>
                </div>
              </MobileListCard>
            );
          })
        )}
      </div>
    </div>
  );
}
