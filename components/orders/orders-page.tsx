"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useListPageData } from "@/hooks/use-list-page-data";
import {
  MobileListCard,
  MobileListCardRow,
  MobileListCardFields,
  MobileListCardSkeleton,
  MobileListCardEmpty,
  TicketListToolbar,
} from "@/components/ui/mobile-list-card";
import { DashboardDateRangeFilter } from "@/components/ui/dashboard-date-range-filter";
import {
  defaultDashboardDateRangeFilterValue,
  resolveDashboardDateRangeFilter,
  type DashboardDateRangeFilterValue,
} from "@/lib/utils/dashboard-date-range-filter";
import { TableDivSkeleton } from "@/components/ui/table-skeleton";
import { Zap, ListFilter } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { PRIORITY_STYLE, PAYMENT_STYLE } from "@/lib/utils/order-styles";
import {
  displayContactName,
  isDueSoon,
  isDueToday,
  isOverdue,
  relativeTime,
} from "@/lib/utils/format";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { taxExemptListLabel, taxExemptListStyle } from "@/lib/utils/tax-exempt-list-label";
import { paymentEvidenceAwaitingConfirmationLabel } from "@/lib/utils/payment-evidence-type";
import type { OrderListStatusTone } from "@/lib/utils/order-list-status";
import { createClient } from "@/lib/supabase/client";
import { AdminUserFilter } from "@/components/ui/admin-user-filter";
import { appendAdminFilterUserId } from "@/lib/utils/admin-user-filter";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  readStoredListPageSize,
  writeStoredListPageSize,
  type ListPageSize,
  type PaginationMeta,
} from "@/lib/utils/pagination";
import type { OrdersListSortField } from "@/lib/utils/orders-list-sort";
import {
  clearLinePreviewListCache,
  seedLinePreviewFromListRows,
} from "@/lib/client/seed-line-preview-from-page-data";
import { ticketPathSegment } from "@/lib/utils/reference-codes";
import { TicketLineItemsQuickPreview } from "@/components/quotes/ticket-line-items-quick-preview";
import {
  ExpandChevron,
  TicketListExpandChevronCell,
  TicketListExpandPreviewRow,
  TicketListViewButton,
} from "@/components/ui/ticket-list-expand";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderTicket {
  id: string;
  ticket_kind: string;
  ticket_status: string;
  status_label: string;
  status_tone: OrderListStatusTone;
  payment_status: "unpaid" | "partial" | "paid" | null;
  refund_status?: "none" | "partial" | "full" | string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_reviewed_at: string | null;
  stripe_payment_intent_id: string | null;
  stripe_amount_cents: number | null;
  payment_evidence_amount: number | null;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  payment_paid_at: string | null;
  deposit_paid_at: string | null;
  title: string | null;
  reference_code: string | null;
  quote_final_total: number | null;
  payment_amount_received: number | null;
  tax_exempt?: boolean;
  sales_permit_storage_path?: string | null;
  sales_permit_reviewed_at?: string | null;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  created_at: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  created_by: { id: string; full_name: string | null } | null;
}


const REFUND_PAYMENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  partial: {
    bg: "var(--color-warning-bg)",
    text: "var(--color-warning-text-deep)",
    label: "Partially refunded",
  },
  full: {
    bg: "var(--color-warning-bg)",
    text: "var(--color-warning-text-deep)",
    label: "Fully refunded",
  },
};

function paymentDisplay(o: OrderTicket): { bg: string; text: string; label: string } {
  const refundStatus = o.refund_status ?? "none";
  if (refundStatus === "partial" || refundStatus === "full") {
    return REFUND_PAYMENT_STYLE[refundStatus] ?? PAYMENT_STYLE.unpaid;
  }
  const taxLabel = taxExemptListLabel(o);
  if (taxLabel) {
    const style = taxExemptListStyle(o)!;
    return { bg: style.bg, text: style.text, label: taxLabel };
  }
  if (isPaymentEvidencePending(o)) {
    return {
      bg: "var(--color-warning-bg)",
      text: "var(--color-warning-text-deep)",
      label: paymentEvidenceAwaitingConfirmationLabel(o),
    };
  }
  return PAYMENT_STYLE[o.payment_status ?? "unpaid"] ?? PAYMENT_STYLE.unpaid;
}

type Tab = "all" | "pending" | "in_production" | "cancelled";

const TABS: { id: Tab; label: string; statuses?: string[] }[] = [
  { id: "all",            label: "All",             statuses: ["order", "in_production", "cancelled"] },
  { id: "pending",        label: "Pending Payment", statuses: ["order"] },
  { id: "in_production",  label: "In Production",   statuses: ["in_production"] },
  { id: "cancelled",      label: "Cancelled",       statuses: ["cancelled"] },
];

const STATUS_TONE_STYLE: Record<OrderListStatusTone, { bg: string; text: string }> = {
  confirmed:              { bg: "var(--color-success-bg)", text: "var(--color-success)" },
  converted:              { bg: "var(--color-info-bg)",    text: "var(--color-info-text)" },
  awaiting_confirmation:  { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)" },
  admin_override:         { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)" },
  in_production:          { bg: "var(--color-info-bg)",    text: "var(--color-info-text)" },
  cancelled:              { bg: "var(--color-danger-bg)",  text: "var(--color-danger)" },
};


// ─── Helpers ──────────────────────────────────────────────────────────────────


/** Due today and still open on Orders (not cancelled). */
function isDueTodayAlert(o: OrderTicket): boolean {
  if (!o.due_date || o.ticket_status === "cancelled") return false;
  return isDueToday(o.due_date);
}

/** Full-row alert fill — applied on every `<td>` so the entire row reads red. */
const DUE_TODAY_ROW_BG =
  "color-mix(in srgb, var(--color-danger) 14%, var(--color-danger-bg))";
const DUE_TODAY_ROW_BG_HOVER =
  "color-mix(in srgb, var(--color-danger) 22%, var(--color-danger-bg))";

function orderRowCellStyle(o: OrderTicket, idx: number): React.CSSProperties | undefined {
  if (isDueTodayAlert(o)) {
    return { background: DUE_TODAY_ROW_BG };
  }
  return {
    background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
  };
}

function setDueTodayRowCellsBg(row: HTMLTableRowElement, bg: string) {
  row.querySelectorAll("td").forEach((cell) => {
    cell.style.background = bg;
  });
}

function orderPaymentAmounts(o: OrderTicket): {
  total: string;
  received: string;
  balanceDue: string;
  receivedValue: number | null;
  balanceDueValue: number | null;
} {
  if (o.quote_final_total == null) {
    return { total: "—", received: "—", balanceDue: "—", receivedValue: null, balanceDueValue: null };
  }

  const total = Number(o.quote_final_total);
  const receivedValue = o.payment_amount_received;
  const received =
    receivedValue != null && Number.isFinite(Number(receivedValue))
      ? formatCurrency(Number(receivedValue))
      : "—";
  const balanceDueValue = Math.max(0, total - Number(receivedValue ?? 0));

  return {
    total: formatCurrency(total),
    received,
    balanceDue: formatCurrency(balanceDueValue),
    receivedValue: receivedValue != null ? Number(receivedValue) : null,
    balanceDueValue,
  };
}

function OrderMobileCard({
  order: o,
  expanded,
  onToggleExpand,
  onOpen,
}: {
  order: OrderTicket;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
}) {
  const statusStyle = STATUS_TONE_STYLE[o.status_tone] ?? STATUS_TONE_STYLE.converted;
  const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;
  const overdue = isOverdue(o.due_date);
  const dueToday = isDueTodayAlert(o);
  const dueSoon = !dueToday && isDueSoon(o.due_date);
  const ps = paymentDisplay(o);
  const amounts = orderPaymentAmounts(o);

  return (
    <MobileListCard
      onClick={onToggleExpand}
      style={
        dueToday
          ? {
              background: DUE_TODAY_ROW_BG,
              borderColor: "var(--color-danger-border)",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden>
            <ExpandChevron open={expanded} />
          </span>
          <div className="min-w-0">
          {o.reference_code ? (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded inline-block" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
              {o.reference_code}
            </span>
          ) : (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Draft</span>
          )}
          <p className="font-semibold text-sm mt-1.5 truncate" style={{ color: "var(--color-text-primary)" }}>
            {displayContactName(o.customer, { preferPerson: true })}
          </p>
          {o.customer?.company && (
            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
          )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium max-w-[140px] truncate"
            title={o.status_label}
            style={{ background: statusStyle.bg, color: statusStyle.text }}
          >
            {o.status_label}
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ background: ps.bg, color: ps.text }}
          >
            {ps.label}
          </span>
        </div>
      </div>

      {(o.title || o.rush) && (
        <div className="flex items-center gap-1.5 min-w-0">
          {o.rush && (
            <span title="Rush" style={{ color: "var(--color-danger)" }}>
              <Zap size={13} className="shrink-0" />
            </span>
          )}
          <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
            {o.title ?? "—"}
          </p>
        </div>
      )}

      <MobileListCardFields>
        <MobileListCardRow label="Total" value={amounts.total} />
        <MobileListCardRow
          label="Received"
          value={amounts.received}
          valueColor={
            amounts.receivedValue != null && amounts.receivedValue > 0.01
              ? "var(--color-success)"
              : undefined
          }
        />
        <MobileListCardRow
          label="Balance Due"
          value={amounts.balanceDue}
          valueColor={
            amounts.balanceDueValue != null && amounts.balanceDueValue > 0.01
              ? "var(--color-warning)"
              : undefined
          }
        />
        <MobileListCardRow label="Priority" value={o.priority ?? "—"} valueColor={priorityStyle.color} />
        <MobileListCardRow
          label="Due Date"
          value={
            o.due_date
              ? `${new Date(o.due_date + "T00:00:00").toLocaleDateString()}${overdue ? " · Overdue" : ""}`
              : "—"
          }
          valueColor={dueToday || overdue ? "var(--color-danger)" : dueSoon ? "var(--color-warning)" : undefined}
        />
        <MobileListCardRow label="Created" value={relativeTime(o.created_at)} />
      </MobileListCardFields>

      <TicketLineItemsQuickPreview
        ticketId={o.id}
        ticketRef={ticketPathSegment(o)}
        expanded={expanded}
        previewId={`order-preview-${o.id}`}
      />

      <TicketListViewButton
        label="View order"
        className="w-full justify-center px-2.5 py-2"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      />
    </MobileListCard>
  );
}

const SORTABLE_COLUMN_FIELDS: Record<string, OrdersListSortField> = {
  "Created by": "created_by",
  "Balance Due": "balance_due",
  "Due Date": "due_date",
  Status: "status",
  Payment: "payment",
};

const SORT_COLUMN_TITLES: Record<OrdersListSortField, string> = {
  default: "Default sort",
  created_by: "Sort by creator (A–Z)",
  balance_due: "Sort by balance due (high to low)",
  due_date: "Sort by due date (overdue first)",
  status: "Sort by status (In Production first)",
  payment: "Sort by payment (Unpaid first)",
};

function OrdersTableDesktop({
  orders: filtered,
  expandedId,
  onToggleExpand,
  onView,
  showCreator = false,
  sortField,
  onSortColumn,
}: {
  orders: OrderTicket[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onView: (order: OrderTicket) => void;
  showCreator?: boolean;
  sortField: OrdersListSortField;
  onSortColumn: (field: OrdersListSortField) => void;
}) {
  const colCount = (showCreator ? 12 : 11) + 2;

  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
          {[
            "",
            "Order #",
            "Contact",
            "Title",
            ...(showCreator ? ["Created by"] : []),
            "Total",
            "Received",
            "Balance Due",
            "Priority",
            "Due Date",
            "Status",
            "Payment",
            "Created",
          ].map((h) => {
            const sortKey = SORTABLE_COLUMN_FIELDS[h];
            const isSortable = Boolean(sortKey);
            const isActive = isSortable && sortField === sortKey;

            return (
              <th
                key={h}
                className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider${
                  isSortable ? " cursor-pointer select-none" : ""
                }`}
                style={{ color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                title={sortKey ? SORT_COLUMN_TITLES[sortKey] : undefined}
                onClick={
                  isSortable && sortKey
                    ? () => onSortColumn(sortKey)
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {h}
                  {isSortable && sortKey && (
                    <ListFilter
                      className="h-3 w-3 shrink-0"
                      aria-hidden
                      style={{
                        color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                        opacity: isActive ? 1 : 0.5,
                      }}
                    />
                  )}
                </span>
              </th>
            );
          })}
          <th className="px-4 py-3 w-16" />
        </tr>
      </thead>
      <tbody>
        {filtered.map((o, idx) => {
          const statusStyle = STATUS_TONE_STYLE[o.status_tone] ?? STATUS_TONE_STYLE.converted;
          const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;
          const overdue = isOverdue(o.due_date);
          const dueToday = isDueTodayAlert(o);
          const dueSoon = !dueToday && isDueSoon(o.due_date);
          const amounts = orderPaymentAmounts(o);
          const cellStyle = orderRowCellStyle(o, idx);
          const dueTodayRow = isDueTodayAlert(o);
          const isOpen = expandedId === o.id;
          const rowBg = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)";

          return (
            <Fragment key={o.id}>
            <tr
              className="cursor-pointer transition-colors"
              aria-expanded={isOpen}
              onMouseEnter={(e) => {
                if (dueTodayRow) {
                  setDueTodayRowCellsBg(e.currentTarget, DUE_TODAY_ROW_BG_HOVER);
                  return;
                }
                e.currentTarget.querySelectorAll("td").forEach((cell) => {
                  cell.style.background = "var(--color-row-hover)";
                });
              }}
              onMouseLeave={(e) => {
                const bg = dueTodayRow
                  ? DUE_TODAY_ROW_BG
                  : isOpen
                    ? "var(--color-row-hover)"
                    : rowBg;
                e.currentTarget.querySelectorAll("td").forEach((cell) => {
                  cell.style.background = bg;
                });
              }}
              onClick={() => onToggleExpand(o.id)}
            >
              <TicketListExpandChevronCell open={isOpen} />
              <td className="px-4 py-3" style={{ ...cellStyle, ...(dueTodayRow ? { boxShadow: "inset 3px 0 0 var(--color-danger)" } : {}) }}>
                {o.reference_code ? (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
                    {o.reference_code}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Draft</span>
                )}
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{displayContactName(o.customer, { preferPerson: true })}</p>
                {o.customer?.company && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
                )}
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                <div className="flex items-center gap-1.5">
                  {o.rush && (
                    <span title="Rush" style={{ color: "var(--color-danger)" }}>
                      <Zap size={13} />
                    </span>
                  )}
                  <span className="text-sm truncate max-w-[180px]" style={{ color: "var(--color-text-primary)" }}>
                    {o.title ?? "—"}
                  </span>
                </div>
              </td>
              {showCreator && (
                <td className="px-4 py-3" style={cellStyle}>
                  <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {o.created_by?.full_name ?? "—"}
                  </span>
                </td>
              )}
              <td className="px-4 py-3" style={cellStyle}>
                <span className="text-sm font-medium tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                  {amounts.total}
                </span>
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                <span
                  className="text-sm font-medium tabular-nums"
                  style={{
                    color:
                      amounts.receivedValue != null && amounts.receivedValue > 0.01
                        ? "var(--color-success)"
                        : "var(--color-text-muted)",
                  }}
                >
                  {amounts.received}
                </span>
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                <span
                  className="text-sm font-medium tabular-nums"
                  style={{
                    color:
                      amounts.balanceDueValue != null && amounts.balanceDueValue > 0.01
                        ? "var(--color-warning)"
                        : "var(--color-text-muted)",
                  }}
                >
                  {amounts.balanceDue}
                </span>
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                <span className="text-sm font-medium" style={{ color: priorityStyle.color }}>
                  {o.priority ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                {o.due_date ? (
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: dueToday || overdue ? "var(--color-danger)" :
                             dueSoon ? "var(--color-warning)" :
                             "var(--color-text-muted)",
                    }}
                  >
                    {new Date(o.due_date + "T00:00:00").toLocaleDateString()}
                    {overdue ? " · Overdue" : ""}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                )}
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium max-w-[180px] truncate"
                  title={o.status_label}
                  style={{ background: statusStyle.bg, color: statusStyle.text }}
                >
                  {o.status_label}
                </span>
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                {(() => {
                  const ps = paymentDisplay(o);
                  return (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: ps.bg, color: ps.text }}
                    >
                      {ps.label}
                    </span>
                  );
                })()}
              </td>
              <td className="px-4 py-3" style={cellStyle}>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {relativeTime(o.created_at)}
                </span>
              </td>
              <td className="px-4 py-3" style={cellStyle} onClick={(e) => e.stopPropagation()}>
                <TicketListViewButton
                  label="View"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(o);
                  }}
                />
              </td>
            </tr>
            {isOpen && (
              <TicketListExpandPreviewRow
                colSpan={colCount}
                ticketId={o.id}
                ticketRef={ticketPathSegment(o)}
                previewId={`order-preview-${o.id}`}
              />
            )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderTicket[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState<PaginationMeta>({
    limit: 25,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<ListPageSize>(() => readStoredListPageSize());
  const [dateFilter, setDateFilter] = useState<DashboardDateRangeFilterValue>(() =>
    defaultDashboardDateRangeFilterValue("last_month"),
  );
  const [userRole, setUserRole] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<OrdersListSortField>("default");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [tab, debouncedSearch, dateFilter, filterUserId, pageSize, sortField]);

  useEffect(() => {
    setExpandedId(null);
  }, [tab, debouncedSearch, dateFilter, filterUserId, pageSize, sortField, offset]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("roles(name)")
        .eq("id", uid)
        .single();
      const roleName = (profile?.roles as unknown as { name: string } | null)?.name ?? null;
      setUserRole(roleName);
    });
  }, []);

  const dateRange = useMemo(() => resolveDashboardDateRangeFilter(dateFilter), [dateFilter]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "all" || t === "pending" || t === "in_production" || t === "cancelled") {
      setTab(t);
    }
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    setOffset(0);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  function toggleSortColumn(field: OrdersListSortField) {
    setSortField((current) => (current === field ? "default" : field));
    setOffset(0);
  }

  const pageDataUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("tab", tab);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (dateRange) {
      params.set("date_from", dateRange.start.toISOString());
      params.set("date_to", dateRange.end.toISOString());
    }
    if (sortField !== "default") params.set("sort", sortField);
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    appendAdminFilterUserId(params, isAdmin ? "admin" : null, filterUserId);
    const qs = params.toString();
    return `/api/orders/page-data${qs ? `?${qs}` : ""}`;
  }, [filterUserId, isAdmin, tab, debouncedSearch, dateRange, offset, pageSize, sortField]);

  const { data: pageData, loading, refreshing } = useListPageData<{
    orders?: OrderTicket[];
    counts?: Record<string, number>;
    pagination?: PaginationMeta;
  }>({
    prefix: "orders",
    url: pageDataUrl,
    events: ["bazaar:tickets-changed", "bazaar:refresh-counts"],
  });

  useEffect(() => {
    if (!pageData) {
      setOrders([]);
      clearLinePreviewListCache();
      return;
    }
    if (pageData.orders) {
      setOrders(pageData.orders);
      seedLinePreviewFromListRows(pageData.orders);
    }
    if (pageData.counts) setTabCounts(pageData.counts);
    if (pageData.pagination) setPagination(pageData.pagination);
  }, [pageData]);

  function handlePageSizeChange(size: ListPageSize) {
    writeStoredListPageSize(size);
    setPageSize(size);
    setOffset(0);
  }

  const emptyMessage = debouncedSearch
    ? "No orders match your search."
    : tabCounts.all === 0
      ? "No orders in this date range."
      : "No orders in this tab.";

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" style={{ color: "var(--color-text-primary)" }}>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Orders
          </h1>
        </div>
        <DashboardDateRangeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      <TicketListToolbar
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={tab}
        onTabChange={(id) => selectTab(id as Tab)}
        tabCounts={tabCounts}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search orders…"
        refreshing={refreshing}
        endAdornment={
          isAdmin ? (
            <AdminUserFilter value={filterUserId} onChange={setFilterUserId} />
          ) : undefined
        }
      />

      {/* Desktop table */}
      <div
        className="hidden lg:block rounded-b-xl border border-t-0 overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {loading ? (
          <TableDivSkeleton rows={6} cols={isAdmin ? 14 : 13} />
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {emptyMessage}
            </p>
          </div>
        ) : (
          <OrdersTableDesktop
            orders={orders}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onView={(o) => router.push(`/orders/${ticketPathSegment(o)}`)}
            showCreator={isAdmin}
            sortField={sortField}
            onSortColumn={toggleSortColumn}
          />
        )}
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          <MobileListCardSkeleton />
        ) : orders.length === 0 ? (
          <MobileListCardEmpty message={emptyMessage} />
        ) : (
          orders.map((o) => (
            <OrderMobileCard
              key={o.id}
              order={o}
              expanded={expandedId === o.id}
              onToggleExpand={() => toggleExpand(o.id)}
              onOpen={() => router.push(`/orders/${ticketPathSegment(o)}`)}
            />
          ))
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
    </div>
  );
}

// ─── Skeleton — see components/ui/table-skeleton.tsx ─────────────────────────
