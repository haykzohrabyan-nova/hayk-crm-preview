"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { FileText, CheckCircle2, Clock, Loader2, CreditCard, ExternalLink, RotateCcw } from "lucide-react";
import { stripePaymentDashboardUrl } from "@/lib/stripe/dashboard-url";
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
  TicketListToolbar,
} from "@/components/ui/mobile-list-card";
import {
  displayContactName,
  formatCurrency,
  formatDateTime,
  relativeTime,
} from "@/lib/utils/format";
import { appendReturnPath } from "@/lib/utils/ticket-detail-href";
import {
  inferPaymentEvidenceMode,
  paymentEvidenceTypeLabelForTicket,
} from "@/lib/utils/payment-evidence-type";
import { filterPaymentEvidenceRows } from "@/lib/utils/filter-payment-evidence-rows";
import {
  summarizePaymentReceived,
  summarizeRefundIssued,
} from "@/lib/utils/payment-refund-list-labels";
import { PaymentTypeBadge } from "@/components/orders/payment-type-badge";
import { ConfirmPaymentEvidenceModal } from "@/components/orders/confirm-payment-evidence-modal";

type PaymentTab = "pending" | "approved" | "refunded";

interface PaymentOrder {
  id: string;
  reference_code: string | null;
  title: string | null;
  contact_name: string | null;
  contact_email: string | null;
  quote_final_total: number | null;
  payment_method_used: string | null;
  deposit_method?: string | null;
  balance_paid_at?: string | null;
  payment_paid_at?: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_reviewed_at: string | null;
  payment_evidence_url: string | null;
  payment_evidence_amount: number | null;
  stripe_payment_intent_id: string | null;
  stripe_receipt_url: string | null;
  payment_amount_received: number | null;
  payment_status: string | null;
  deposit_paid_at: string | null;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  ticket_status: string;
  customer: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  created_by: { id: string; full_name: string | null } | null;
  refund_status?: "none" | "partial" | "full" | string | null;
  total_refunded_amount?: number | null;
  last_refunded_at?: string | null;
  last_refunded_by?: { id: string; full_name: string | null } | null;
  last_refund_method?: string | null;
  last_refund_source?: string | null;
  last_refund_payment_mode?: string | null;
}

const TABS: { id: PaymentTab; label: string }[] = [
  { id: "pending", label: "Pending approval" },
  { id: "approved", label: "Approved" },
  { id: "refunded", label: "Refunded" },
];

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

function customerLabel(order: PaymentOrder): string {
  return displayContactName(order.customer);
}

function inferPaymentMode(order: PaymentOrder): "deposit" | "balance" | "full" {
  return inferPaymentEvidenceMode(order);
}

function refundStatusLabel(status: string | null | undefined): string {
  if (status === "full") return "Fully refunded";
  if (status === "partial") return "Partially refunded";
  return "Refunded";
}

function RefundTabStatusPills({ order }: { order: PaymentOrder }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{
          background: "var(--color-warning-bg)",
          color: "var(--color-warning-text-deep)",
          border: "1px solid var(--color-warning-border)",
        }}
      >
        <RotateCcw size={11} />
        {refundStatusLabel(order.refund_status)}
      </span>
      {order.ticket_status === "cancelled" && (
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            border: "1px solid var(--color-danger-border)",
          }}
        >
          Cancelled
        </span>
      )}
    </div>
  );
}

function claimedAmount(order: PaymentOrder): number {
  if (order.payment_evidence_amount != null) return Number(order.payment_evidence_amount);
  const total = Number(order.quote_final_total ?? 0);
  const paid  = Number(order.payment_amount_received ?? 0);
  return Math.max(0, total - paid);
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <tbody>
      <TableRowsSkeleton rows={3} cols={cols} />
    </tbody>
  );
}

export function PaymentsPage() {
  const router = useRouter();
  const { showLoading, hideLoading } = useGlobalLoading();
  const [activeTab, setActiveTab] = useState<PaymentTab>("pending");
  const [pendingOrders, setPendingOrders] = useState<PaymentOrder[]>([]);
  const [approvedOrders, setApprovedOrders] = useState<PaymentOrder[]>([]);
  const [refundedOrders, setRefundedOrders] = useState<PaymentOrder[]>([]);
  const [tabCounts, setTabCounts] = useState({ pending: 0, approved: 0, refunded: 0 });
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<PaymentOrder | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPageData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/payments/page-data")
      .then((r) => r.json())
      .then((d) => {
        if (d.orders) setPendingOrders(d.orders);
        if (d.approvedOrders) setApprovedOrders(d.approvedOrders);
        if (d.refundedOrders) setRefundedOrders(d.refundedOrders);
        if (d.counts) {
          setTabCounts({
            pending: d.counts.pending ?? 0,
            approved: d.counts.approved ?? 0,
            refunded: d.counts.refunded ?? 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useCoalescedRefresh(fetchPageData, [], {
    events: ["bazaar:tickets-changed", "bazaar:refresh-counts"],
  });

  const filteredPending = useMemo(
    () => filterPaymentEvidenceRows(pendingOrders, debouncedSearch),
    [pendingOrders, debouncedSearch],
  );
  const filteredApproved = useMemo(
    () => filterPaymentEvidenceRows(approvedOrders, debouncedSearch),
    [approvedOrders, debouncedSearch],
  );
  const filteredRefunded = useMemo(
    () => filterPaymentEvidenceRows(refundedOrders, debouncedSearch),
    [refundedOrders, debouncedSearch],
  );

  const displayCounts = debouncedSearch.trim()
    ? {
        pending: filteredPending.length,
        approved: filteredApproved.length,
        refunded: filteredRefunded.length,
      }
    : tabCounts;

  const orders =
    activeTab === "pending"
      ? filteredPending
      : activeTab === "approved"
        ? filteredApproved
        : filteredRefunded;
  const isPendingTab = activeTab === "pending";
  const isApprovedTab = activeTab === "approved";
  const isRefundedTab = activeTab === "refunded";
  const desktopCols = isRefundedTab ? 8 : 8;
  const headers = isRefundedTab
    ? ["Order", "Customer", "Paid via", "Refunded via", "Status", "Total refunded", "Last refunded", "Refunded by"]
    : isPendingTab
      ? ["Order", "Customer", "Created by", "Claimed", "Payment For", "Method", "Submitted", "Actions"]
      : ["Order", "Customer", "Created by", "Claimed", "Payment For", "Method", "Submitted", "Approved"];

  const paymentsReturnPath = "/payments";

  function openConfirmModal(order: PaymentOrder, e?: React.MouseEvent) {
    e?.stopPropagation();
    const amount = claimedAmount(order);
    if (amount <= 0) {
      setConfirmErr("No payment amount to confirm.");
      return;
    }
    setConfirmErr(null);
    setConfirmTarget(order);
  }

  async function handleConfirm(order: PaymentOrder) {
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
      setConfirmTarget(null);
      fetchPageData(true);
    } catch {
      setConfirmErr("Network error — please try again.");
    } finally {
      setConfirmingId(null);
      hideLoading();
    }
  }

  const emptyTitle = debouncedSearch.trim()
    ? "No matches"
    : isPendingTab
      ? "All caught up"
      : isRefundedTab
        ? "No refunded orders yet"
        : "No approved evidence yet";
  const emptySubtitle = debouncedSearch.trim()
    ? "No payment evidence matches your search."
    : isPendingTab
      ? "No orders pending payment review."
      : isRefundedTab
        ? "Orders with partial or full refunds appear here after a refund is recorded."
        : "Orders appear here after an accountant confirms payment evidence.";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Payment Evidence
          </h1>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--color-text-muted)" }}>
            Review payment proof on Pending approval, confirmed evidence on Approved, and orders with partial or full refunds on Refunded.
          </p>
        </div>
        {isPendingTab && !loading && !debouncedSearch.trim() && tabCounts.pending > 0 && (
          <div
            className="flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm"
            style={{
              borderColor: "var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text-deep)",
            }}
          >
            <Clock size={15} style={{ flexShrink: 0 }} />
            <span>View evidence before confirming — customer is notified after approval.</span>
          </div>
        )}
      </div>

      <TicketListToolbar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as PaymentTab)}
        tabCounts={displayCounts}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order, customer, creator, amount…"
      />

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
        className="hidden lg:block rounded-b-[10px] border border-t-0 overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-row-alt)" }}>
              {headers.map((h) => (
                <th
                  key={h}
                  className={`px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider whitespace-nowrap ${
                    h === "Claimed" ? "text-right" : h === "Actions" || h === "Approved" ? "text-right" : ""
                  }`}
                  style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          {loading ? (
            <TableSkeleton cols={desktopCols} />
          ) : orders.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={desktopCols}>
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <CheckCircle2 size={40} style={{ color: "var(--color-text-muted)" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {emptyTitle}
                    </p>
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {emptySubtitle}
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
                const refundRelTime = relativeTime(order.last_refunded_at);
                const isConfirming = confirmingId === order.id;
                const rowBg = i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)";

                if (isRefundedTab) {
                  return (
                    <tr
                      key={order.id}
                      className="cursor-pointer"
                      style={{ borderBottom: "1px solid var(--color-border)", background: rowBg }}
                      onClick={() =>
                        router.push(
                          appendReturnPath(`/payments/${order.id}`, paymentsReturnPath),
                        )
                      }
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-row-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
                    >
                      <td className="px-5 py-4 align-middle">
                        <span className="text-sm font-semibold whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                          {order.reference_code ?? order.id.slice(0, 8).toUpperCase()}
                        </span>
                        {order.title && (
                          <div className="text-xs mt-1 max-w-[160px] truncate" style={{ color: "var(--color-text-muted)" }}>
                            {order.title}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {customerLabel(order)}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                          Order total {fmt(order.quote_final_total)}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                          {summarizePaymentReceived(order)}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                          {summarizeRefundIssued(
                            order.last_refund_method,
                            order.last_refund_source,
                            order.last_refund_payment_mode,
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <RefundTabStatusPills order={order} />
                      </td>
                      <td className="px-5 py-4 align-middle text-right whitespace-nowrap">
                        <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                          {fmt(order.total_refunded_amount)}
                        </div>
                        {order.refund_status !== "full" &&
                          Number(order.payment_amount_received ?? 0) > 0.01 && (
                          <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                            {fmt(order.payment_amount_received)} still on file
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                          {formatDateTime(order.last_refunded_at)}
                        </div>
                        {refundRelTime && (
                          <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                            {refundRelTime}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                          {order.last_refunded_by?.full_name ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={order.id}
                    className="cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      background: rowBg,
                    }}
                    onClick={() =>
                      router.push(
                        appendReturnPath(`/payments/${order.id}`, paymentsReturnPath),
                      )
                    }
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-row-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
                  >
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

                    <td className="px-5 py-4 align-middle">
                      <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {customerLabel(order)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        Total {fmt(order.quote_final_total)}
                        {order.payment_status === "partial" && " · Partial"}
                        {order.payment_status === "paid" && " · Paid"}
                      </div>
                    </td>

                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                        {order.created_by?.full_name ?? "—"}
                      </span>
                    </td>

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

                    <td className="px-5 py-4 align-middle whitespace-nowrap">
                      <PaymentTypeBadge ticket={order} showDescription />
                    </td>

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
                            title="View uploaded file"
                          >
                            <FileText size={14} />
                            File
                          </a>
                        )}
                        {order.stripe_payment_intent_id && (
                          <a
                            href={
                              order.stripe_receipt_url ??
                              stripePaymentDashboardUrl(order.stripe_payment_intent_id)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border whitespace-nowrap"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-text-primary)",
                              background: "var(--color-surface)",
                              textDecoration: "none",
                            }}
                            title="View Stripe payment"
                          >
                            <ExternalLink size={14} />
                            Stripe
                          </a>
                        )}
                        {isPendingTab ? (
                          <button
                            type="button"
                            disabled={isConfirming}
                            onClick={(e) => openConfirmModal(order, e)}
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
                        ) : (
                          <span className="text-sm whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                            {formatDateTime(order.payment_evidence_reviewed_at)}
                          </span>
                        )}
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
          <MobileListCardEmpty message={emptySubtitle} />
        ) : (
          orders.map((order) => {
            const claimed = claimedAmount(order);
            const relTime = relativeTime(order.payment_evidence_submitted_at);
            const refundRelTime = relativeTime(order.last_refunded_at);
            const isConfirming = confirmingId === order.id;

            if (isRefundedTab) {
              return (
                <MobileListCard
                  key={order.id}
                  onClick={() =>
                    router.push(
                      appendReturnPath(`/payments/${order.id}`, paymentsReturnPath),
                    )
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
                        {order.reference_code ?? order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <p className="text-sm font-medium mt-1.5" style={{ color: "var(--color-text-primary)" }}>
                        {customerLabel(order)}
                      </p>
                    </div>
                    <span
                      className="text-sm font-semibold tabular-nums shrink-0"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {fmt(order.total_refunded_amount)}
                    </span>
                  </div>
                  <MobileListCardFields>
                    <MobileListCardRow label="Paid via" value={summarizePaymentReceived(order)} />
                    <MobileListCardRow
                      label="Refunded via"
                      value={summarizeRefundIssued(
                        order.last_refund_method,
                        order.last_refund_source,
                        order.last_refund_payment_mode,
                      )}
                    />
                    <MobileListCardRow
                      label="Status"
                      value={
                        order.ticket_status === "cancelled"
                          ? `${refundStatusLabel(order.refund_status)} · Cancelled`
                          : refundStatusLabel(order.refund_status)
                      }
                    />
                    <MobileListCardRow label="Order total" value={fmt(order.quote_final_total)} />
                    <MobileListCardRow
                      label="Last refunded"
                      value={
                        <>
                          {formatDateTime(order.last_refunded_at)}
                          {refundRelTime && (
                            <span className="block text-[10px] font-normal mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                              {refundRelTime}
                            </span>
                          )}
                        </>
                      }
                    />
                    <MobileListCardRow
                      label="Refunded by"
                      value={order.last_refunded_by?.full_name ?? "—"}
                    />
                  </MobileListCardFields>
                </MobileListCard>
              );
            }

            return (
              <MobileListCard
                key={order.id}
                onClick={() =>
                  router.push(
                    appendReturnPath(`/payments/${order.id}`, paymentsReturnPath),
                  )
                }
              >
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
                    label="Created by"
                    value={order.created_by?.full_name ?? "—"}
                  />
                  <MobileListCardRow
                    label="Payment For"
                    value={<PaymentTypeBadge ticket={order} showDescription />}
                  />
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
                  {isApprovedTab && (
                    <MobileListCardRow
                      label="Approved"
                      value={formatDateTime(order.payment_evidence_reviewed_at)}
                    />
                  )}
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
                      View file
                    </a>
                  )}
                  {order.stripe_payment_intent_id && (
                    <a
                      href={
                        order.stripe_receipt_url ??
                        stripePaymentDashboardUrl(order.stripe_payment_intent_id)
                      }
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
                      <ExternalLink size={14} />
                      Stripe
                    </a>
                  )}
                  {isPendingTab && (
                    <button
                      type="button"
                      disabled={isConfirming}
                      onClick={(e) => openConfirmModal(order, e)}
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
                  )}
                </div>
              </MobileListCard>
            );
          })
        )}
      </div>

      <ConfirmPaymentEvidenceModal
        open={!!confirmTarget}
        referenceCode={confirmTarget?.reference_code}
        customerLabel={confirmTarget ? customerLabel(confirmTarget) : undefined}
        amount={confirmTarget ? claimedAmount(confirmTarget) : 0}
        paymentForLabel={
          confirmTarget ? paymentEvidenceTypeLabelForTicket(confirmTarget) : ""
        }
        methodLabel={
          confirmTarget?.payment_method_used
            ? CHANNEL_LABELS[confirmTarget.payment_method_used] ??
              confirmTarget.payment_method_used
            : undefined
        }
        confirming={confirmingId === confirmTarget?.id}
        error={confirmErr}
        onConfirm={() => {
          if (confirmTarget) void handleConfirm(confirmTarget);
        }}
        onClose={() => {
          if (confirmingId) return;
          setConfirmTarget(null);
          setConfirmErr(null);
        }}
      />
    </div>
  );
}
