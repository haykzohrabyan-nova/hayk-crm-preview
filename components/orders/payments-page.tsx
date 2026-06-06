"use client";

import { Fragment, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useListPageData } from "@/hooks/use-list-page-data";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { FileText, CheckCircle2, Clock, Loader2, CreditCard, ExternalLink, RotateCcw, Mail, RefreshCw } from "lucide-react";
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
import {
  summarizePaymentReceived,
  summarizeRefundIssued,
} from "@/lib/utils/payment-refund-list-labels";
import { PaymentTypeBadge } from "@/components/orders/payment-type-badge";
import { ConfirmPaymentEvidenceModal } from "@/components/orders/confirm-payment-evidence-modal";
import {
  ApproveTaxExemptModal,
  type TaxExemptApproveTicket,
} from "@/components/orders/approve-tax-exempt-modal";
import { RequestEvidenceResubmitFlow } from "@/components/orders/request-evidence-resubmit-flow";
import type { EvidenceResubmitMode } from "@/lib/client/request-evidence-resubmit";
import { ResubmitStatusCell } from "@/components/orders/resubmit-status-cell";
import {
  resolvePaymentEvidenceResubmitListStatus,
  resolveTaxExemptResubmitListStatus,
  resubmitListStatusIsVisible,
} from "@/lib/utils/evidence-resubmit-list-status";
import { isLegacyTaxExemptMissingPermitFile } from "@/lib/utils/tax-exempt-approval";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  readStoredListPageSize,
  writeStoredListPageSize,
  type ListPageSize,
  type PaginationMeta,
} from "@/lib/utils/pagination";
import { ticketPathSegment } from "@/lib/utils/reference-codes";
import {
  clearLinePreviewListCache,
  seedLinePreviewFromListRows,
} from "@/lib/client/seed-line-preview-from-page-data";
import { TicketLineItemsQuickPreview } from "@/components/quotes/ticket-line-items-quick-preview";
import {
  ExpandChevron,
  TicketListExpandChevronCell,
  TicketListExpandPreviewRow,
  TicketListViewButton,
} from "@/components/ui/ticket-list-expand";
import {
  PaymentsRowActions,
  PaymentsRowIconButton,
  PaymentsRowIconLink,
  PaymentsRowPrimaryButton,
} from "@/components/orders/payments-row-actions";
import {
  ReplaceTicketDocumentModal,
  type ReplaceDocumentKind,
} from "@/components/orders/replace-ticket-document-modal";

type PaymentTab = "pending" | "tax_exempt" | "approved" | "refunded";

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
  payment_evidence_resubmit_requested_at?: string | null;
  payment_evidence_resubmit_received_at?: string | null;
  payment_evidence_url: string | null;
  public_token?: string | null;
  ticket_quote_channel?: "sms" | "email" | "both" | null;
  ticket_dest_email?: string | null;
  ticket_dest_phone?: string | null;
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
  tax_exempt?: boolean;
  sales_permit_number?: string | null;
  sales_permit_file_name?: string | null;
  sales_permit_storage_path?: string | null;
  sales_permit_submitted_at?: string | null;
  sales_permit_reviewed_at?: string | null;
  sales_permit_resubmit_requested_at?: string | null;
  sales_permit_resubmit_received_at?: string | null;
  sales_permit_resubmit_token?: string | null;
  quote_pre_tax_total?: number | null;
  quote_tax_rate_percent?: number | null;
  quote_tax_amount?: number | null;
  quote_subtotal?: number | null;
  quote_shipping?: number | null;
  discount_type?: string | null;
  discount_value?: string | null;
  customer: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    email?: string | null;
    phone?: string | null;
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
  { id: "tax_exempt", label: "Tax-exempt pending" },
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

function paymentEvidenceFileName(order: PaymentOrder): string | null {
  if (!order.payment_evidence_url) return null;
  const segment = order.payment_evidence_url.split("/").pop();
  return segment?.trim() || "Payment proof";
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
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [tabCounts, setTabCounts] = useState({ pending: 0, tax_exempt: 0, approved: 0, refunded: 0 });
  const [pagination, setPagination] = useState<PaginationMeta>({
    limit: 25,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<ListPageSize>(() => readStoredListPageSize());
  const [confirmTarget, setConfirmTarget] = useState<PaymentOrder | null>(null);
  const [taxExemptTarget, setTaxExemptTarget] = useState<PaymentOrder | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<PaymentOrder | null>(null);
  const [resubmitMode, setResubmitMode] = useState<EvidenceResubmitMode | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<PaymentOrder | null>(null);
  const [replaceKind, setReplaceKind] = useState<ReplaceDocumentKind | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [taxExemptConfirmErr, setTaxExemptConfirmErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [activeTab, debouncedSearch, pageSize]);

  useEffect(() => {
    setExpandedId(null);
  }, [activeTab, debouncedSearch, offset, pageSize]);

  const pageDataUrl = useMemo(() => {
    const params = new URLSearchParams({
      tab: activeTab,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    return `/api/payments/page-data?${params}`;
  }, [activeTab, debouncedSearch, offset, pageSize]);

  const {
    data: pageData,
    loading,
    refreshing,
    refresh: refreshPageData,
  } = useListPageData<{
    orders?: PaymentOrder[];
    taxExemptOrders?: PaymentOrder[];
    approvedOrders?: PaymentOrder[];
    refundedOrders?: PaymentOrder[];
    counts?: { pending?: number; tax_exempt?: number; approved?: number; refunded?: number };
    pagination?: PaginationMeta;
  }>({
    prefix: "payments",
    url: pageDataUrl,
    events: ["bazaar:tickets-changed", "bazaar:refresh-counts"],
  });

  useEffect(() => {
    if (!pageData) {
      setOrders([]);
      clearLinePreviewListCache();
      return;
    }
    const rows =
      activeTab === "pending"
        ? pageData.orders
        : activeTab === "tax_exempt"
          ? pageData.taxExemptOrders
          : activeTab === "approved"
            ? pageData.approvedOrders
            : pageData.refundedOrders;
    const list = Array.isArray(rows) ? rows : [];
    setOrders(list);
    seedLinePreviewFromListRows(list);
    if (pageData.counts) {
      setTabCounts({
        pending: pageData.counts.pending ?? 0,
        tax_exempt: pageData.counts.tax_exempt ?? 0,
        approved: pageData.counts.approved ?? 0,
        refunded: pageData.counts.refunded ?? 0,
      });
    }
    if (pageData.pagination) {
      setPagination(pageData.pagination);
      if (pageData.pagination.total > 0 && offset >= pageData.pagination.total) {
        setOffset(0);
      }
    }
  }, [pageData, activeTab, offset]);

  function handlePageSizeChange(size: ListPageSize) {
    writeStoredListPageSize(size);
    setPageSize(size);
    setOffset(0);
  }

  function selectTab(next: PaymentTab) {
    setActiveTab(next);
    setOffset(0);
  }
  const isPendingTab = activeTab === "pending";
  const isTaxExemptTab = activeTab === "tax_exempt";
  const isApprovedTab = activeTab === "approved";
  const isRefundedTab = activeTab === "refunded";

  const showResubmitColumn = useMemo(() => {
    if (!isPendingTab && !isTaxExemptTab) return false;
    return orders.some((order) =>
      resubmitListStatusIsVisible(
        isTaxExemptTab
          ? resolveTaxExemptResubmitListStatus(order)
          : resolvePaymentEvidenceResubmitListStatus(order),
      ),
    );
  }, [orders, isPendingTab, isTaxExemptTab]);

  type PaymentTableHeader = { key: string; label: string };

  const headers = useMemo((): PaymentTableHeader[] => {
    if (isRefundedTab) {
      return [
        { key: "expand", label: "" },
        { key: "order", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "paid-via", label: "Paid via" },
        { key: "refunded-via", label: "Refunded via" },
        { key: "status", label: "Status" },
        { key: "total-refunded", label: "Total refunded" },
        { key: "last-refunded", label: "Last refunded" },
        { key: "refunded-by", label: "Refunded by" },
        { key: "actions", label: "" },
      ];
    }
    if (isTaxExemptTab) {
      const cols: PaymentTableHeader[] = [
        { key: "expand", label: "" },
        { key: "order", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "created-by", label: "Created by" },
        { key: "total", label: "Total" },
        { key: "permit", label: "Permit #" },
        { key: "submitted", label: "Submitted" },
      ];
      if (showResubmitColumn) cols.push({ key: "resubmit-status", label: "Resubmit status" });
      cols.push({ key: "actions", label: "Actions" });
      return cols;
    }
    if (isPendingTab) {
      const cols: PaymentTableHeader[] = [
        { key: "expand", label: "" },
        { key: "order", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "created-by", label: "Created by" },
        { key: "claimed", label: "Claimed" },
        { key: "payment-for", label: "Payment For" },
        { key: "method", label: "Method" },
        { key: "submitted", label: "Submitted" },
      ];
      if (showResubmitColumn) cols.push({ key: "resubmit-status", label: "Resubmit status" });
      cols.push({ key: "actions", label: "Actions" });
      return cols;
    }
    return [
      { key: "expand", label: "" },
      { key: "order", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "created-by", label: "Created by" },
      { key: "claimed", label: "Claimed" },
      { key: "payment-for", label: "Payment For" },
      { key: "method", label: "Method" },
      { key: "submitted", label: "Submitted" },
      { key: "approved", label: "Approved" },
      { key: "actions", label: "" },
    ];
  }, [isRefundedTab, isTaxExemptTab, isPendingTab, showResubmitColumn]);

  const desktopCols = headers.length;

  const paymentsReturnPath = "/payments";

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function openPaymentDetail(order: PaymentOrder, e?: React.MouseEvent) {
    e?.stopPropagation();
    router.push(appendReturnPath(`/payments/${order.id}`, paymentsReturnPath));
  }

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

  function openResubmitModal(order: PaymentOrder, mode: EvidenceResubmitMode, e?: React.MouseEvent) {
    e?.stopPropagation();
    setResubmitTarget(order);
    setResubmitMode(mode);
  }

  function openReplaceModal(order: PaymentOrder, kind: ReplaceDocumentKind, e?: React.MouseEvent) {
    e?.stopPropagation();
    setReplaceTarget(order);
    setReplaceKind(kind);
  }

  function orderForResubmitFlow(order: PaymentOrder) {
    return {
      id: order.id,
      reference_code: order.reference_code,
      public_token: order.public_token,
      contact_email: order.contact_email,
      ticket_quote_channel: order.ticket_quote_channel,
      ticket_dest_email: order.ticket_dest_email,
      ticket_dest_phone: order.ticket_dest_phone,
      customer: order.customer,
    };
  }

  function openTaxExemptModal(order: PaymentOrder, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (isLegacyTaxExemptMissingPermitFile(order)) {
      setTaxExemptConfirmErr(
        "Upload the sales permit file first — use Replace on this row or Quote tab → Permit File.",
      );
      return;
    }
    setTaxExemptConfirmErr(null);
    setTaxExemptTarget(order);
  }

  function paymentOrderToTaxExemptTicket(order: PaymentOrder): TaxExemptApproveTicket {
    return {
      id: order.id,
      reference_code: order.reference_code,
      tax_exempt: !!order.tax_exempt,
      quote_subtotal: order.quote_subtotal ?? null,
      quote_shipping: order.quote_shipping ?? null,
      discount_type: order.discount_type,
      discount_value: order.discount_value,
      quote_tax_rate_percent: order.quote_tax_rate_percent,
      quote_pre_tax_total: order.quote_pre_tax_total ?? null,
      quote_tax_amount: order.quote_tax_amount ?? null,
      quote_final_total: order.quote_final_total,
      sales_permit_number: order.sales_permit_number ?? null,
      sales_permit_file_name: order.sales_permit_file_name ?? null,
      customer: order.customer,
    };
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
      void refreshPageData(true);
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
      : isTaxExemptTab
        ? "All caught up"
        : isRefundedTab
          ? "No refunded orders yet"
          : "No approved evidence yet";
  const emptySubtitle = debouncedSearch.trim()
    ? isTaxExemptTab
      ? "No tax-exempt tickets match your search."
      : "No payment evidence matches your search."
    : isPendingTab
      ? "No orders pending payment review."
      : isTaxExemptTab
        ? "No orders awaiting tax-exempt documentation approval."
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
            Review payment proof on Pending approval, tax-exempt permits on Tax-exempt pending, confirmed evidence on Approved, and refunds on Refunded.
          </p>
        </div>
        {isTaxExemptTab && !loading && !debouncedSearch.trim() && tabCounts.tax_exempt > 0 && (
          <div
            className="flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm"
            style={{
              borderColor: "var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text-deep)",
            }}
          >
            <Clock size={15} style={{ flexShrink: 0 }} />
            <span>View permit before confirming — customer is notified after approval.</span>
          </div>
        )}
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
        onTabChange={(id) => selectTab(id as PaymentTab)}
        tabCounts={tabCounts}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order, customer, creator, amount…"
        refreshing={refreshing}
      />

      {(confirmErr || taxExemptConfirmErr) && (
        <div
          className="rounded-[10px] border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--color-danger-border)",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
          }}
        >
          {confirmErr ?? taxExemptConfirmErr}
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
              {headers.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider whitespace-nowrap ${
                    col.label === "Claimed"
                      ? "text-right"
                      : col.label === "Actions" || col.label === "Approved"
                        ? "text-right"
                        : ""
                  }`}
                  style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                >
                  {col.label}
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
                const isOpen = expandedId === order.id;
                const paymentResubmitStatus = resolvePaymentEvidenceResubmitListStatus(order);

                if (isTaxExemptTab) {
                  const permitHref = `/api/tickets/${order.id}/sales-permit`;
                  const legacyMissing = isLegacyTaxExemptMissingPermitFile(order);
                  const submittedAt = order.sales_permit_submitted_at;
                  const submittedRel = relativeTime(submittedAt);
                  const taxResubmitStatus = resolveTaxExemptResubmitListStatus(order);
                  return (
                    <Fragment key={order.id}>
                    <tr
                      className="cursor-pointer"
                      style={{ borderBottom: "1px solid var(--color-border)", background: isOpen ? "var(--color-row-hover)" : rowBg }}
                      aria-expanded={isOpen}
                      onClick={() => toggleExpand(order.id)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-row-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isOpen ? "var(--color-row-hover)" : rowBg; }}
                    >
                      <TicketListExpandChevronCell open={isOpen} />
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
                          Total {fmt(order.quote_final_total)}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                          {order.created_by?.full_name ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle text-right whitespace-nowrap">
                        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                          {fmt(order.quote_final_total)}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {order.sales_permit_number ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        {legacyMissing ? (
                          <span className="text-sm font-medium" style={{ color: "var(--color-warning)" }}>
                            File required
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                            <div>
                              <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                                {formatDateTime(submittedAt)}
                              </div>
                              {submittedRel && (
                                <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                                  {submittedRel}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      {showResubmitColumn && (
                        <td className="px-5 py-4 align-middle whitespace-nowrap">
                          <ResubmitStatusCell status={taxResubmitStatus} />
                        </td>
                      )}
                      <td className="px-5 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                        <PaymentsRowActions>
                          {order.sales_permit_storage_path ? (
                            <PaymentsRowIconLink
                              href={permitHref}
                              title="View permit file"
                              icon={FileText}
                            />
                          ) : null}
                          <PaymentsRowIconButton
                            title={legacyMissing ? "Upload sales permit" : "Replace sales permit"}
                            icon={RefreshCw}
                            onClick={(e) => openReplaceModal(order, "sales_permit", e)}
                          />
                          <PaymentsRowIconButton
                            title="View order"
                            icon={ExternalLink}
                            onClick={(e) => openPaymentDetail(order, e)}
                          />
                          {!legacyMissing && (
                            <PaymentsRowIconButton
                              title="Request updated permit"
                              icon={Mail}
                              onClick={(e) => openResubmitModal(order, "tax_exempt_resubmit", e)}
                            />
                          )}
                          <PaymentsRowPrimaryButton
                            label="Review"
                            icon={CheckCircle2}
                            disabled={legacyMissing}
                            onClick={(e) => openTaxExemptModal(order, e)}
                          />
                        </PaymentsRowActions>
                      </td>
                    </tr>
                    {isOpen && (
                      <TicketListExpandPreviewRow
                        colSpan={desktopCols}
                        ticketId={order.id}
                        ticketRef={ticketPathSegment(order)}
                        previewId={`payment-preview-${order.id}`}
                      />
                    )}
                    </Fragment>
                  );
                }

                if (isRefundedTab) {
                  return (
                    <Fragment key={order.id}>
                    <tr
                      className="cursor-pointer"
                      style={{ borderBottom: "1px solid var(--color-border)", background: isOpen ? "var(--color-row-hover)" : rowBg }}
                      aria-expanded={isOpen}
                      onClick={() => toggleExpand(order.id)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-row-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isOpen ? "var(--color-row-hover)" : rowBg; }}
                    >
                      <TicketListExpandChevronCell open={isOpen} />
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
                      <td className="px-5 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                        <TicketListViewButton label="View" onClick={(e) => openPaymentDetail(order, e)} />
                      </td>
                    </tr>
                    {isOpen && (
                      <TicketListExpandPreviewRow
                        colSpan={desktopCols}
                        ticketId={order.id}
                        ticketRef={ticketPathSegment(order)}
                        previewId={`payment-preview-${order.id}`}
                      />
                    )}
                    </Fragment>
                  );
                }

                return (
                  <Fragment key={order.id}>
                  <tr
                    className="cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      background: isOpen ? "var(--color-row-hover)" : rowBg,
                    }}
                    aria-expanded={isOpen}
                    onClick={() => toggleExpand(order.id)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-row-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isOpen ? "var(--color-row-hover)" : rowBg; }}
                  >
                    <TicketListExpandChevronCell open={isOpen} />
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

                    {isPendingTab && showResubmitColumn && (
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <ResubmitStatusCell status={paymentResubmitStatus} />
                      </td>
                    )}

                    {isApprovedTab ? (
                      <>
                        <td className="px-5 py-4 align-middle whitespace-nowrap">
                          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                            {formatDateTime(
                              order.payment_evidence_reviewed_at ?? order.sales_permit_reviewed_at,
                            )}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                          <PaymentsRowActions>
                            {order.payment_evidence_url ? (
                              <PaymentsRowIconLink
                                href={`/api/tickets/${order.id}/evidence`}
                                title="View payment file"
                                icon={FileText}
                              />
                            ) : null}
                            {order.stripe_payment_intent_id ? (
                              <PaymentsRowIconLink
                                href={
                                  order.stripe_receipt_url ??
                                  stripePaymentDashboardUrl(order.stripe_payment_intent_id)
                                }
                                title="View in Stripe"
                                icon={CreditCard}
                              />
                            ) : null}
                            <PaymentsRowIconButton
                              title="View order"
                              icon={ExternalLink}
                              onClick={(e) => openPaymentDetail(order, e)}
                            />
                          </PaymentsRowActions>
                        </td>
                      </>
                    ) : (
                      <td className="px-5 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                        <PaymentsRowActions>
                          {order.payment_evidence_url ? (
                            <PaymentsRowIconLink
                              href={`/api/tickets/${order.id}/evidence`}
                              title="View payment file"
                              icon={FileText}
                            />
                          ) : null}
                          {order.payment_evidence_url ? (
                            <PaymentsRowIconButton
                              title="Replace payment proof"
                              icon={RefreshCw}
                              onClick={(e) => openReplaceModal(order, "payment_evidence", e)}
                            />
                          ) : null}
                          {order.stripe_payment_intent_id ? (
                            <PaymentsRowIconLink
                              href={
                                order.stripe_receipt_url ??
                                stripePaymentDashboardUrl(order.stripe_payment_intent_id)
                              }
                              title="View in Stripe"
                              icon={CreditCard}
                            />
                          ) : null}
                          <PaymentsRowIconButton
                            title="View order"
                            icon={ExternalLink}
                            onClick={(e) => openPaymentDetail(order, e)}
                          />
                          <PaymentsRowIconButton
                            title="Request updated proof"
                            icon={Mail}
                            onClick={(e) => openResubmitModal(order, "payment_evidence_resubmit", e)}
                          />
                          <PaymentsRowPrimaryButton
                            label="Confirm"
                            icon={CheckCircle2}
                            loading={isConfirming}
                            onClick={(e) => openConfirmModal(order, e)}
                          />
                        </PaymentsRowActions>
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <TicketListExpandPreviewRow
                      colSpan={desktopCols}
                      ticketId={order.id}
                      ticketRef={ticketPathSegment(order)}
                      previewId={`payment-preview-${order.id}`}
                    />
                  )}
                  </Fragment>
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
            const isOpen = expandedId === order.id;

            if (isTaxExemptTab) {
              const permitHref = `/api/tickets/${order.id}/sales-permit`;
              const legacyMissing = isLegacyTaxExemptMissingPermitFile(order);
              const submittedRel = relativeTime(order.sales_permit_submitted_at);
              const taxResubmitStatus = resolveTaxExemptResubmitListStatus(order);
              return (
                <MobileListCard
                  key={order.id}
                  onClick={() => toggleExpand(order.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden>
                        <ExpandChevron open={isOpen} />
                      </span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
                        {order.reference_code ?? order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <p className="text-sm font-medium mt-1.5" style={{ color: "var(--color-text-primary)" }}>
                        {customerLabel(order)}
                      </p>
                    </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: "var(--color-text-primary)" }}>
                      {fmt(order.quote_final_total)}
                    </span>
                  </div>
                  <MobileListCardFields>
                    <MobileListCardRow label="Permit #" value={order.sales_permit_number ?? "—"} />
                    <MobileListCardRow
                      label="Submitted"
                      value={
                        legacyMissing ? (
                          <span style={{ color: "var(--color-warning)" }}>File required (legacy order)</span>
                        ) : (
                          <>
                            {formatDateTime(order.sales_permit_submitted_at)}
                            {submittedRel && (
                              <span className="block text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                                {submittedRel}
                              </span>
                            )}
                          </>
                        )
                      }
                    />
                    {taxResubmitStatus.kind !== "none" && (
                      <MobileListCardRow
                        label="Resubmit"
                        value={
                          <>
                            <span
                              style={{
                                color:
                                  taxResubmitStatus.kind === "requested"
                                    ? "var(--color-warning)"
                                    : "var(--color-success)",
                              }}
                            >
                              {taxResubmitStatus.label}
                            </span>
                            <span className="block text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                              {formatDateTime(taxResubmitStatus.at)}
                            </span>
                          </>
                        }
                      />
                    )}
                  </MobileListCardFields>
                  <TicketLineItemsQuickPreview
                    ticketId={order.id}
                    ticketRef={ticketPathSegment(order)}
                    expanded={isOpen}
                    previewId={`payment-preview-${order.id}`}
                  />
                  <div className="flex flex-col gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <TicketListViewButton
                      label="View payment"
                      className="w-full justify-center px-2.5 py-2"
                      onClick={(e) => openPaymentDetail(order, e)}
                    />
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2.5 text-[13px] font-medium border"
                      style={{
                        borderColor: legacyMissing ? "var(--color-warning-border)" : "var(--color-border)",
                        color: legacyMissing ? "var(--color-warning-text-deep)" : "var(--color-text-primary)",
                        background: legacyMissing ? "var(--color-warning-bg)" : "var(--color-bg)",
                      }}
                      onClick={(e) => openReplaceModal(order, "sales_permit", e)}
                    >
                      <RefreshCw size={14} />
                      {legacyMissing ? "Upload sales permit" : "Replace permit"}
                    </button>
                    {!legacyMissing && (
                      <button
                        type="button"
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2.5 text-[13px] font-medium border"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-primary)",
                          background: "var(--color-bg)",
                        }}
                        onClick={(e) => openResubmitModal(order, "tax_exempt_resubmit", e)}
                      >
                        <Mail size={14} />
                        Request updated permit
                      </button>
                    )}
                    {order.sales_permit_storage_path && (
                      <a
                        href={permitHref}
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
                    <button
                      type="button"
                      disabled={legacyMissing}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2.5 text-[13px] font-medium border border-transparent disabled:opacity-50"
                      style={{
                        background: "var(--color-btn-primary-bg)",
                        color: "var(--color-btn-primary-text)",
                      }}
                      onClick={(e) => openTaxExemptModal(order, e)}
                    >
                      <CheckCircle2 size={14} />
                      Confirm tax-exempt
                    </button>
                  </div>
                </MobileListCard>
              );
            }

            if (isRefundedTab) {
              return (
                <MobileListCard
                  key={order.id}
                  onClick={() => toggleExpand(order.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden>
                        <ExpandChevron open={isOpen} />
                      </span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
                        {order.reference_code ?? order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <p className="text-sm font-medium mt-1.5" style={{ color: "var(--color-text-primary)" }}>
                        {customerLabel(order)}
                      </p>
                    </div>
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
                  <TicketLineItemsQuickPreview
                    ticketId={order.id}
                    ticketRef={ticketPathSegment(order)}
                    expanded={isOpen}
                    previewId={`payment-preview-${order.id}`}
                  />
                  <TicketListViewButton
                    label="View payment"
                    className="w-full justify-center px-2.5 py-2"
                    onClick={(e) => openPaymentDetail(order, e)}
                  />
                </MobileListCard>
              );
            }

            const paymentResubmitStatus = resolvePaymentEvidenceResubmitListStatus(order);

            return (
              <MobileListCard
                key={order.id}
                onClick={() => toggleExpand(order.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden>
                      <ExpandChevron open={isOpen} />
                    </span>
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
                  {isPendingTab && paymentResubmitStatus.kind !== "none" && (
                    <MobileListCardRow
                      label="Resubmit"
                      value={
                        <>
                          <span
                            style={{
                              color:
                                paymentResubmitStatus.kind === "requested"
                                  ? "var(--color-warning)"
                                  : "var(--color-success)",
                            }}
                          >
                            {paymentResubmitStatus.label}
                          </span>
                          <span className="block text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                            {formatDateTime(paymentResubmitStatus.at)}
                          </span>
                        </>
                      }
                    />
                  )}
                  {isApprovedTab && (
                    <MobileListCardRow
                      label="Approved"
                      value={formatDateTime(order.payment_evidence_reviewed_at)}
                    />
                  )}
                </MobileListCardFields>

                <TicketLineItemsQuickPreview
                  ticketId={order.id}
                  ticketRef={ticketPathSegment(order)}
                  expanded={isOpen}
                  previewId={`payment-preview-${order.id}`}
                />

                <div className="flex flex-col gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <TicketListViewButton
                    label="View payment"
                    className="w-full justify-center px-2.5 py-2"
                    onClick={(e) => openPaymentDetail(order, e)}
                  />
                  {isPendingTab && (
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2.5 text-[13px] font-medium border"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-primary)",
                        background: "var(--color-bg)",
                      }}
                      onClick={(e) => openResubmitModal(order, "payment_evidence_resubmit", e)}
                    >
                      <Mail size={14} />
                      Request updated proof
                    </button>
                  )}
                  {isPendingTab && order.payment_evidence_url && (
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2.5 text-[13px] font-medium border"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-primary)",
                        background: "var(--color-bg)",
                      }}
                      onClick={(e) => openReplaceModal(order, "payment_evidence", e)}
                    >
                      <RefreshCw size={14} />
                      Replace payment proof
                    </button>
                  )}
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
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-[6px] px-3 py-2.5 text-[13px] font-medium border border-transparent disabled:opacity-60"
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

      <ListPagination
        total={pagination.total}
        offset={offset}
        pageSize={pageSize}
        onOffsetChange={setOffset}
        onPageSizeChange={handlePageSizeChange}
        loading={loading}
      />

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
        onRequestEvidence={
          confirmTarget
            ? () => {
                setConfirmTarget(null);
                openResubmitModal(confirmTarget, "payment_evidence_resubmit");
              }
            : undefined
        }
        onClose={() => {
          if (confirmingId) return;
          setConfirmTarget(null);
          setConfirmErr(null);
        }}
      />

      {taxExemptTarget && (
        <ApproveTaxExemptModal
          open={!!taxExemptTarget}
          ticket={paymentOrderToTaxExemptTicket(taxExemptTarget)}
          permitViewHref={`/api/tickets/${taxExemptTarget.id}/sales-permit`}
          error={taxExemptConfirmErr}
          onClose={() => {
            setTaxExemptTarget(null);
            setTaxExemptConfirmErr(null);
          }}
          onRequestEvidence={() => {
            const target = taxExemptTarget;
            setTaxExemptTarget(null);
            openResubmitModal(target, "tax_exempt_resubmit");
          }}
          onApproved={() => {
            setTaxExemptTarget(null);
            setTaxExemptConfirmErr(null);
            void refreshPageData(true);
          }}
        />
      )}

      {resubmitTarget && resubmitMode && (
        <RequestEvidenceResubmitFlow
          ticket={orderForResubmitFlow(resubmitTarget)}
          mode={resubmitMode}
          open
          onClose={() => {
            setResubmitTarget(null);
            setResubmitMode(null);
          }}
          onSuccess={() => {
            setResubmitTarget(null);
            setResubmitMode(null);
            void refreshPageData(true);
          }}
        />
      )}

      {replaceTarget && replaceKind && (
        <ReplaceTicketDocumentModal
          open
          kind={replaceKind}
          ticketId={replaceTarget.id}
          referenceCode={replaceTarget.reference_code}
          existingPermitNumber={
            replaceKind === "sales_permit" ? replaceTarget.sales_permit_number : undefined
          }
          existingFileName={
            replaceKind === "payment_evidence"
              ? paymentEvidenceFileName(replaceTarget)
              : replaceTarget.sales_permit_file_name
          }
          viewHref={
            replaceKind === "payment_evidence"
              ? `/api/tickets/${replaceTarget.id}/evidence`
              : `/api/tickets/${replaceTarget.id}/sales-permit`
          }
          onClose={() => {
            setReplaceTarget(null);
            setReplaceKind(null);
          }}
          onSuccess={() => {
            setReplaceTarget(null);
            setReplaceKind(null);
            void refreshPageData(true);
          }}
        />
      )}
    </div>
  );
}
