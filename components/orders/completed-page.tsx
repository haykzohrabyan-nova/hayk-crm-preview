"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useListPageData } from "@/hooks/use-list-page-data";
import { ListRefreshingNotice } from "@/components/ui/mobile-list-card";
import { Search, Zap } from "lucide-react";
import { DashboardDateRangeFilter } from "@/components/ui/dashboard-date-range-filter";
import { TableDivSkeleton } from "@/components/ui/table-skeleton";
import {
  defaultDashboardDateRangeFilterValue,
  resolveDashboardDateRangeFilter,
  type DashboardDateRangeFilterValue,
} from "@/lib/utils/dashboard-date-range-filter";
import {
  MobileListCard,
  MobileListCardRow,
  MobileListCardFields,
  MobileListCardSkeleton,
  MobileListCardEmpty,
} from "@/components/ui/mobile-list-card";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  readStoredListPageSize,
  writeStoredListPageSize,
  type ListPageSize,
  type PaginationMeta,
} from "@/lib/utils/pagination";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { displayContactName, formatDate } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import { AdminUserFilter } from "@/components/ui/admin-user-filter";
import { appendAdminFilterUserId } from "@/lib/utils/admin-user-filter";
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

interface CompletedOrder {
  id: string;
  reference_code: string | null;
  title: string | null;
  ticket_status: string;
  payment_status: "unpaid" | "partial" | "paid" | null;
  quote_final_total: number | null;
  payment_amount_received: number | null;
  ticket_payment_strategy: "full" | "partial" | "net" | null;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  updated_at: string;
  created_at: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  created_by?: { id: string; full_name: string | null } | null;
}

const PAYMENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  unpaid:  { bg: "var(--color-danger-bg)",  text: "var(--color-danger)",  label: "Unpaid" },
  partial: { bg: "var(--color-warning-bg)", text: "var(--color-warning)", label: "Partial" },
  paid:    { bg: "var(--color-success-bg)", text: "var(--color-success)", label: "Paid" },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
  High:   { color: "var(--color-danger)" },
  Normal: { color: "var(--color-text-muted)" },
  Low:    { color: "var(--color-success)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(o: CompletedOrder): string {
  return displayContactName(o.customer, { preferPerson: true });
}

function CompletedMobileCard({
  order: o,
  expanded,
  onToggleExpand,
  onOpen,
}: {
  order: CompletedOrder;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
}) {
  const ps = PAYMENT_STYLE[o.payment_status ?? "unpaid"] ?? PAYMENT_STYLE.unpaid;
  const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;

  return (
    <MobileListCard onClick={onToggleExpand}>
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
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
          )}
          <p className="font-semibold text-sm mt-1.5 truncate" style={{ color: "var(--color-text-primary)" }}>
            {displayName(o)}
          </p>
          {o.customer?.company && (
            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
          )}
          </div>
        </div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
          style={{ background: ps.bg, color: ps.text }}
        >
          {ps.label}
        </span>
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
        <MobileListCardRow
          label="Total"
          value={o.quote_final_total != null ? formatCurrency(o.quote_final_total) : "—"}
        />
        <MobileListCardRow label="Priority" value={o.priority ?? "—"} valueColor={priorityStyle.color} />
        <MobileListCardRow
          label="Due Date"
          value={o.due_date ? new Date(o.due_date + "T00:00:00").toLocaleDateString() : "—"}
        />
        <MobileListCardRow label="Completed" value={formatDate(o.updated_at)} />
      </MobileListCardFields>

      <TicketLineItemsQuickPreview
        ticketId={o.id}
        ticketRef={ticketPathSegment(o)}
        expanded={expanded}
        previewId={`completed-preview-${o.id}`}
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

// ─── Component ────────────────────────────────────────────────────────────────

export function CompletedPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    limit: 25,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<ListPageSize>(() => readStoredListPageSize());
  const [dateFilter, setDateFilter] = useState<DashboardDateRangeFilterValue>(() =>
    defaultDashboardDateRangeFilterValue("last_month"),
  );
  const [userRole, setUserRole] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [listTotalUnfiltered, setListTotalUnfiltered] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";
  const desktopColCount = (isAdmin ? 9 : 8) + 2;

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, dateFilter, filterUserId, pageSize]);

  useEffect(() => {
    setExpandedId(null);
  }, [debouncedSearch, dateFilter, filterUserId, pageSize, offset]);

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

  const pageDataUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (dateRange) {
      params.set("date_from", dateRange.start.toISOString());
      params.set("date_to", dateRange.end.toISOString());
    }
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    appendAdminFilterUserId(params, isAdmin ? "admin" : null, filterUserId);
    const qs = params.toString();
    return `/api/completed/page-data${qs ? `?${qs}` : ""}`;
  }, [filterUserId, isAdmin, debouncedSearch, dateRange, offset, pageSize]);

  const { data: pageData, loading, refreshing } = useListPageData<{
    orders?: CompletedOrder[];
    pagination?: PaginationMeta;
    counts?: { completed?: number };
  }>({
    prefix: "completed",
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
    if (pageData.pagination) setPagination(pageData.pagination);
    if (pageData.counts?.completed != null) setListTotalUnfiltered(pageData.counts.completed);
  }, [pageData]);

  function handlePageSizeChange(size: ListPageSize) {
    writeStoredListPageSize(size);
    setPageSize(size);
    setOffset(0);
  }

  const emptyMessage = debouncedSearch
    ? "No orders match your search."
    : listTotalUnfiltered === 0
      ? "No completed orders yet."
      : "No completed orders in this date range.";

  return (
    <div className="space-y-5" style={{ color: "var(--color-text-primary)" }}>

      {/* Page header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4 lg:mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Completed Orders
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Finished orders — filter by completion date
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 shrink-0">
          <ListRefreshingNotice refreshing={refreshing} />
          <DashboardDateRangeFilter value={dateFilter} onChange={setDateFilter} />
          {isAdmin && (
            <AdminUserFilter value={filterUserId} onChange={setFilterUserId} />
          )}

          <div className="relative w-full sm:w-52 shrink-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders…"
              className="w-full pl-8 pr-3 py-2 lg:py-1.5 text-sm rounded-md border outline-none"
              style={{
                background: "var(--color-bg)",
                border:     "1px solid var(--color-border)",
                color:      "var(--color-text-primary)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div
        className="hidden lg:block rounded-[10px] border overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {loading ? (
          <TableDivSkeleton cols={desktopColCount} />
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {emptyMessage}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {[
                  "",
                  "Order #",
                  "Contact",
                  "Title",
                  ...(isAdmin ? ["Created by"] : []),
                  "Total",
                  "Payment",
                  "Priority",
                  "Due Date",
                  "Completed",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => {
                const ps = PAYMENT_STYLE[o.payment_status ?? "unpaid"] ?? PAYMENT_STYLE.unpaid;
                const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;
                const isOpen = expandedId === o.id;
                const rowBg = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)";

                return (
                  <Fragment key={o.id}>
                  <tr
                    className="cursor-pointer transition-colors"
                    style={{ background: isOpen ? "var(--color-row-hover)" : rowBg }}
                    aria-expanded={isOpen}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = isOpen ? "var(--color-row-hover)" : rowBg)}
                    onClick={() => toggleExpand(o.id)}
                  >
                    <TicketListExpandChevronCell open={isOpen} />
                    {/* Order # */}
                    <td className="px-4 py-3">
                      {o.reference_code ? (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
                          {o.reference_code}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(o)}</p>
                      {o.customer?.company && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
                      )}
                    </td>

                    {/* Title */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {o.rush && <span title="Rush" style={{ color: "var(--color-danger)" }}><Zap size={13} /></span>}
                        <span className="text-sm truncate max-w-[180px]" style={{ color: "var(--color-text-primary)" }}>
                          {o.title ?? "—"}
                        </span>
                      </div>
                    </td>

                    {isAdmin && (
                      <td className="px-4 py-3">
                        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {o.created_by?.full_name ?? "—"}
                        </span>
                      </td>
                    )}

                    {/* Total */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {o.quote_final_total != null ? formatCurrency(o.quote_final_total) : "—"}
                      </span>
                    </td>

                    {/* Payment */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: ps.bg, color: ps.text }}
                      >
                        {ps.label}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: priorityStyle.color }}>
                        {o.priority ?? "—"}
                      </span>
                    </td>

                    {/* Due date */}
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {o.due_date ? new Date(o.due_date + "T00:00:00").toLocaleDateString() : "—"}
                      </span>
                    </td>

                    {/* Completed at */}
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {formatDate(o.updated_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <TicketListViewButton
                        label="View"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/completed/${ticketPathSegment(o)}`);
                        }}
                      />
                    </td>
                  </tr>
                  {isOpen && (
                    <TicketListExpandPreviewRow
                      colSpan={desktopColCount}
                      ticketId={o.id}
                      ticketRef={ticketPathSegment(o)}
                      previewId={`completed-preview-${o.id}`}
                    />
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
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
            <CompletedMobileCard
              key={o.id}
              order={o}
              expanded={expandedId === o.id}
              onToggleExpand={() => toggleExpand(o.id)}
              onOpen={() => router.push(`/completed/${ticketPathSegment(o)}`)}
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
