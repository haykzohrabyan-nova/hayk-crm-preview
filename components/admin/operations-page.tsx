"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { useStaleWhileRevalidate } from "@/hooks/use-stale-while-revalidate";
import { useStoredListPageSize } from "@/hooks/use-stored-list-page-size";
import {
  OPERATIONS_FILTER_LABELS,
  OPERATIONS_FILTER_OPTIONS,
  type OperationsFilter,
} from "@/lib/utils/admin-deal-stage";
import type { OperationsDealRow } from "@/lib/utils/fetch-admin-operations-data";
import type { OperationsOwnerHighlight } from "@/lib/utils/admin-deal-stage";
import { formatDateNumeric } from "@/lib/utils/format";
import { quoteDetailPath } from "@/lib/utils/reference-codes";
import { DashboardDateRangeFilter } from "@/components/ui/dashboard-date-range-filter";
import {
  defaultDashboardDateRangeFilterValue,
  type DashboardDateRangeFilterValue,
} from "@/lib/utils/dashboard-date-range-filter";
import { SDR_DASHBOARD_PRESET_LABELS } from "@/lib/utils/sdr-dashboard-date-range";
import { AdminUserFilter } from "@/components/ui/admin-user-filter";
import { appendAdminFilterUserId } from "@/lib/utils/admin-user-filter";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  type ListPageSize,
  type PaginationMeta,
} from "@/lib/utils/pagination";
import {
  MobileListCard,
  MobileListCardRow,
  MobileListCardFields,
  MobileListCardSkeleton,
  MobileListCardEmpty,
  TicketListToolbar,
} from "@/components/ui/mobile-list-card";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { OperationsDealDetailDialog } from "@/components/admin/operations-deal-detail-dialog";
import { OperationsPerformancePanel } from "@/components/admin/operations-performance-panel";
import type { OperationsPerformanceData } from "@/lib/utils/fetch-admin-operations-performance";
import { fetchLeadById } from "@/lib/utils/fetch-lead";
import type { Lead, LookupMap } from "@/lib/types";
import { ToastBanner } from "@/components/ui/toast-banner";
import { useGlobalLoading } from "@/components/layout/global-loading-provider";
import { TicketListViewButton } from "@/components/ui/ticket-list-expand";
import {
  groupOperationsDeals,
  OPERATIONS_GROUP_COLUMN_TITLES,
  type OperationsGroupField,
} from "@/lib/utils/operations-list-group";

const VerifyDrawer = dynamic(
  () => import("@/components/leads/verify-drawer").then((m) => ({ default: m.VerifyDrawer })),
  { ssr: false, loading: () => null },
);

function operationsPeriodLabel(filter: DashboardDateRangeFilterValue): string {
  if (filter.preset === "custom") return "Custom range";
  return SDR_DASHBOARD_PRESET_LABELS[filter.preset];
}

function TicketRefCell({
  refCode,
  ticketId,
  createdAt,
  linkRef,
}: {
  refCode: string | null;
  ticketId: string | null;
  createdAt: string | null;
  /** Actual ticket ref for navigation when display ref differs (converted QUO ← ORD). */
  linkRef?: string | null;
}) {
  const router = useRouter();
  const { showLoading, isLoading } = useGlobalLoading();
  if (!refCode || !ticketId) {
    return <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>;
  }
  const navRef = linkRef ?? refCode;
  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isLoading) return;
          showLoading(`Opening ${refCode}…`);
          router.push(quoteDetailPath({ id: ticketId, reference_code: navRef }));
        }}
        disabled={isLoading}
        className="text-xs font-mono font-medium cursor-pointer hover:opacity-80 transition-opacity disabled:cursor-wait disabled:opacity-70"
        style={{ color: "var(--color-tab-active)" }}
      >
        {refCode}
      </button>
      {createdAt && (
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {formatDateNumeric(createdAt)}
        </p>
      )}
    </div>
  );
}

const GROUPABLE_COLUMN_FIELDS: Record<string, OperationsGroupField> = {
  Stage: "stage",
  SDR: "sdr",
  "Sales rep": "sales",
};

const TABLE_HEADERS: { label: string; title: string; width: string }[] = [
  { label: "Customer", title: "Customer name; company on the line below when present", width: "11%" },
  {
    label: "Stage",
    title: "Live status from the linked quote or order ticket when one exists; otherwise the lead status",
    width: "16%",
  },
  { label: "SDR", title: "SDR who validated or routed the lead — active owner during SDR steps", width: "10%" },
  {
    label: "Sales rep",
    title: "Rep who claimed the lead — active owner for quotes, orders, and production",
    width: "13%",
  },
  { label: "Quote", title: "Linked quote ticket (QUO-*) — may match the ticket driving Stage", width: "14%" },
  { label: "Order", title: "Linked order ticket (ORD-*) — may match the ticket driving Stage", width: "14%" },
  { label: "Created", title: "Lead created date", width: "8%" },
  { label: "Action", title: "Open deal detail", width: "5%" },
];

function OperationsStageCell({ deal }: { deal: OperationsDealRow }) {
  return (
    <div>
      <StatusPill status={deal.stage} />
      <p className="text-xs mt-1 leading-snug" style={{ color: "var(--color-text-muted)" }}>
        {deal.stage_from_ticket && deal.stage_ticket_ref ? (
          <>
            Ticket{" "}
            <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>
              {deal.stage_ticket_ref}
            </span>
          </>
        ) : (
          "Lead status"
        )}
      </p>
    </div>
  );
}

function OperationsGroupHeaderRow({ label, count }: { label: string; count: number }) {
  return (
    <tr style={{ background: "var(--color-badge-bg)", borderTop: "1px solid var(--color-border)" }}>
      <td colSpan={TABLE_HEADERS.length} className="lg:px-2 lg:py-2 xl:px-2 xl:py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider truncate"
            style={{ color: "var(--color-badge-text)" }}
            title={label}
          >
            {label}
          </span>
          <span
            className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold shrink-0"
            style={{
              background: "color-mix(in srgb, var(--color-badge-text) 12%, transparent)",
              color: "var(--color-badge-text)",
            }}
          >
            {count}
          </span>
        </div>
      </td>
    </tr>
  );
}

function OperationsDealTableRow({
  deal,
  rowIndex,
  onOpenDeal,
}: {
  deal: OperationsDealRow;
  rowIndex: number;
  onOpenDeal: (deal: OperationsDealRow) => void;
}) {
  return (
    <tr
      className="cursor-pointer transition-colors"
      style={{
        background: rowIndex % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
      onMouseLeave={(e) =>
        (e.currentTarget.style.background =
          rowIndex % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")
      }
      onClick={() => onOpenDeal(deal)}
    >
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 min-w-0 max-w-0 overflow-hidden">
        <p
          className="lg:text-xs xl:text-sm font-medium truncate"
          title={deal.customer_name}
          style={{ color: "var(--color-text-primary)" }}
        >
          {deal.customer_name}
        </p>
        {deal.company && (
          <p
            className="text-xs truncate mt-0.5"
            title={deal.company}
            style={{ color: "var(--color-text-muted)" }}
          >
            {deal.company}
          </p>
        )}
      </td>
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 min-w-0 overflow-hidden">
        <OperationsStageCell deal={deal} />
      </td>
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 min-w-0 overflow-hidden">
        <OperationsOwnerCell name={deal.sdr_name} role="sdr" highlight={deal.owner_highlight} />
      </td>
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 min-w-0 overflow-hidden">
        <OperationsOwnerCell
          name={deal.sales_owner_name}
          role="sales"
          highlight={deal.owner_highlight}
        />
      </td>
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 min-w-0 overflow-hidden">
        <TicketRefCell
          refCode={deal.quote_ref}
          ticketId={deal.quote_id}
          createdAt={deal.quote_created_at}
          linkRef={deal.quote_nav_ref}
        />
      </td>
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 min-w-0 overflow-hidden">
        <TicketRefCell
          refCode={deal.order_ref}
          ticketId={deal.order_id}
          createdAt={deal.order_created_at}
        />
      </td>
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3 whitespace-nowrap">
        <span className="lg:text-xs xl:text-sm" style={{ color: "var(--color-text-muted)" }}>
          {formatDateNumeric(deal.lead_created_at)}
        </span>
      </td>
      <td className="lg:px-2 lg:py-2 xl:px-2 xl:py-3" onClick={(e) => e.stopPropagation()}>
        <TicketListViewButton
          label="View"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDeal(deal);
          }}
        />
      </td>
    </tr>
  );
}

function OperationsMobileDealCard({
  deal,
  onOpenDeal,
}: {
  deal: OperationsDealRow;
  onOpenDeal: (deal: OperationsDealRow) => void;
}) {
  return (
    <MobileListCard onClick={() => onOpenDeal(deal)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
            {deal.customer_name}
          </p>
          {deal.company && (
            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
              {deal.company}
            </p>
          )}
        </div>
        <StatusPill status={deal.stage} />
      </div>
      {deal.stage_from_ticket && deal.stage_ticket_ref && (
        <p className="text-[10px] font-mono -mt-1 mb-1" style={{ color: "var(--color-text-muted)" }}>
          Stage on {deal.stage_ticket_ref}
        </p>
      )}
      <MobileListCardFields>
        <MobileListCardRow
          label="SDR"
          value={deal.sdr_name ?? "—"}
          valueColor={
            deal.owner_highlight === "sdr"
              ? "var(--color-text-primary)"
              : "var(--color-text-muted)"
          }
        />
        <MobileListCardRow
          label="Sales"
          value={
            deal.owner_highlight === "unclaimed"
              ? "Unclaimed"
              : (deal.sales_owner_name ?? "—")
          }
          valueColor={
            deal.owner_highlight === "sales" || deal.owner_highlight === "unclaimed"
              ? "var(--color-text-primary)"
              : "var(--color-text-muted)"
          }
        />
        <MobileListCardRow label="Quote" value={deal.quote_ref ?? "—"} />
        <MobileListCardRow label="Order" value={deal.order_ref ?? "—"} />
        <MobileListCardRow label="Created" value={formatDateNumeric(deal.lead_created_at)} />
      </MobileListCardFields>
    </MobileListCard>
  );
}

function OperationsOwnerCell({
  name,
  role,
  highlight,
}: {
  name: string | null;
  role: "sdr" | "sales";
  highlight: OperationsOwnerHighlight;
}) {
  const isActive =
    role === "sdr" ? highlight === "sdr" : highlight === "sales" || highlight === "unclaimed";
  const display =
    role === "sales"
      ? highlight === "unclaimed"
        ? "Unclaimed"
        : (name ?? "—")
      : (name ?? "—");

  return (
    <div>
      <span
        className="lg:text-xs xl:text-sm block truncate max-w-full"
        title={display}
        style={{
          color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
          fontWeight: isActive ? 500 : 400,
          opacity: isActive ? 1 : 0.55,
        }}
      >
        {display}
      </span>
      {isActive && (
        <p className="text-xs mt-0.5" style={{ color: "var(--color-info-text)" }}>
          {highlight === "unclaimed" ? "Awaiting claim" : "Active owner"}
        </p>
      )}
    </div>
  );
}

export default function OperationsPage() {
  const [activeStage, setActiveStage] = useState<OperationsFilter>("all_active");
  const [deals, setDeals] = useState<OperationsDealRow[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<string, number> | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>({
    limit: 25,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useStoredListPageSize();
  const [dateFilter, setDateFilter] = useState<DashboardDateRangeFilterValue>(
    defaultDashboardDateRangeFilterValue("last_month"),
  );
  const [selectedDeal, setSelectedDeal] = useState<OperationsDealRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [lookups, setLookups] = useState<LookupMap>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [performance, setPerformance] = useState<OperationsPerformanceData | null>(null);
  const [groupBy, setGroupBy] = useState<OperationsGroupField | null>(null);

  const isPerformanceTab = activeStage === "performance";

  const performancePeriodLabel = useMemo(
    () => operationsPeriodLabel(dateFilter),
    [dateFilter],
  );

  type OperationsPageData = {
    deals?: OperationsDealRow[];
    counts?: Record<string, number>;
    pagination?: PaginationMeta;
    performance?: OperationsPerformanceData;
    error?: string;
    code?: string;
  };

  useEffect(() => {
    if (!drawerLead || Object.keys(lookups).length > 0) return;
    fetch("/api/lookups?categories=source,industry,urgency,hold_reason,follow_up_reason,reject_reason,route_reason")
      .then((r) => r.json())
      .then((d) => setLookups(d))
      .catch(() => {});
  }, [drawerLead, lookups]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [activeStage, debouncedSearch, pageSize, filterUserId, dateFilter]);

  useEffect(() => {
    setGroupBy(null);
  }, [activeStage, debouncedSearch, filterUserId, dateFilter, offset, pageSize]);

  const pageDataUrl = useMemo(() => {
    const params = new URLSearchParams({
      stage: activeStage,
      limit: String(pageSize),
      offset: String(offset),
      date_preset: dateFilter.preset,
    });
    if (dateFilter.preset === "custom") {
      if (dateFilter.dateFrom) params.set("date_from", dateFilter.dateFrom);
      if (dateFilter.dateTo) params.set("date_to", dateFilter.dateTo);
    }
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    appendAdminFilterUserId(params, "admin", filterUserId);
    return `/api/admin/operations/page-data?${params}`;
  }, [activeStage, debouncedSearch, filterUserId, offset, pageSize, dateFilter]);

  const { data: pageData, loading, refreshing } = useStaleWhileRevalidate<OperationsPageData>(
    `operations:${pageDataUrl}`,
    async () => {
      console.log("[Operations] fetching", pageDataUrl);
      setFetchError(null);
      try {
        const res = await fetch(pageDataUrl);
        let body: OperationsPageData = {};
        try {
          body = (await res.json()) as OperationsPageData;
        } catch (parseErr) {
          console.error("[Operations] failed to parse JSON", parseErr);
          throw new Error("Invalid response from server.");
        }

        console.log("[Operations] response", {
          status: res.status,
          ok: res.ok,
          deals: body.deals?.length ?? 0,
          total: body.pagination?.total,
          counts: body.counts,
          error: body.error,
          code: body.code,
        });

        if (!res.ok) {
          const message = body.error ?? `Request failed (${res.status})`;
          console.error("[Operations] API error", message, body);
          setFetchError(message);
          throw new Error(message);
        }

        return body;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load operations data.";
        console.error("[Operations] fetch failed", err);
        setFetchError(message);
        throw err;
      }
    },
    [pageDataUrl],
    {
      events: ["bazaar:leads-changed", "bazaar:tickets-changed", "bazaar:refresh-counts"],
      enabled: !drawerLead,
    },
  );

  useEffect(() => {
    if (loading) {
      console.log("[Operations] loading…", pageDataUrl);
    }
  }, [loading, pageDataUrl]);

  useEffect(() => {
    if (pageData) {
      console.log("[Operations] pageData applied", {
        deals: pageData.deals?.length ?? 0,
        counts: pageData.counts,
        pagination: pageData.pagination,
      });
    } else if (!loading) {
      console.warn("[Operations] no pageData after load (check Network tab / server logs)");
    }
  }, [pageData, loading]);

  useEffect(() => {
    if (!pageData) {
      setDeals([]);
      setPerformance(null);
      return;
    }
    if (Array.isArray(pageData.deals)) setDeals(pageData.deals);
    if (pageData.performance) setPerformance(pageData.performance);
    else if (!isPerformanceTab) setPerformance(null);
    if (pageData.counts) setTabCounts(pageData.counts);
    if (pageData.pagination) {
      setPagination(pageData.pagination);
      if (pageData.pagination.total > 0 && offset >= pageData.pagination.total) {
        setOffset(0);
      }
    }
  }, [pageData, offset, isPerformanceTab]);

  function handlePageSizeChange(size: ListPageSize) {
    setPageSize(size);
    setOffset(0);
  }

  function openDeal(deal: OperationsDealRow) {
    setSelectedDeal(deal);
    setDetailOpen(true);
  }

  function toggleGroupColumn(field: OperationsGroupField) {
    setGroupBy((current) => (current === field ? null : field));
  }

  const dealGroups = useMemo(() => {
    if (!groupBy || deals.length === 0) return null;
    return groupOperationsDeals(deals, groupBy);
  }, [deals, groupBy]);

  async function handleViewLead(leadId: string) {
    const full = (await fetchLeadById(leadId)) ?? null;
    if (full) setDrawerLead(full);
  }

  const emptyMessage = fetchError
    ? `Failed to load deals: ${fetchError}`
    : debouncedSearch.trim()
      ? "No deals match your search."
      : activeStage === "all_active"
        ? "No active deals in this date range."
        : `No deals in ${OPERATIONS_FILTER_LABELS[activeStage].toLowerCase()}.`;

  const toolbarTabs = OPERATIONS_FILTER_OPTIONS.map((id) => ({
    id,
    label: OPERATIONS_FILTER_LABELS[id],
  }));

  return (
    <div className="space-y-5" style={{ color: "var(--color-text-primary)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Operations
        </h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DashboardDateRangeFilter value={dateFilter} onChange={setDateFilter} className="w-full sm:w-auto" />
          <AdminUserFilter value={filterUserId} onChange={setFilterUserId} />
        </div>
      </div>

      {fetchError && (
        <div
          className="rounded-[10px] border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--color-danger-border)",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
          }}
        >
          {fetchError} — open DevTools Console (filter: <code>[Operations]</code>) and check the terminal
          running <code>npm run dev</code> for server logs.
        </div>
      )}

      <TicketListToolbar
        tabs={toolbarTabs}
        activeTab={activeStage}
        onTabChange={(id) => setActiveStage(id as OperationsFilter)}
        tabCounts={
          tabCounts
            ? Object.fromEntries(
                Object.entries(tabCounts).filter(([id]) => id !== "performance"),
              )
            : undefined
        }
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={
          isPerformanceTab
            ? "Search disabled on Performance tab"
            : "Search deals, company, QUO-…, ORD-…"
        }
        refreshing={refreshing}
      />

      {isPerformanceTab ? (
        <OperationsPerformancePanel
          totals={performance?.totals ?? null}
          users={performance?.users ?? []}
          loading={loading}
          periodLabel={performancePeriodLabel}
        />
      ) : (
        <>
      {/* Desktop table — attached to toolbar like Orders / Quotes */}
      <div
        className="hidden lg:block rounded-b-xl border border-t-0 overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <table className="w-full lg:table-fixed 2xl:table-auto">
          <colgroup>
            {TABLE_HEADERS.map((h) => (
              <col key={h.label} style={{ width: h.width }} />
            ))}
          </colgroup>
          <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              {TABLE_HEADERS.map((h) => {
                const groupField = GROUPABLE_COLUMN_FIELDS[h.label];
                const isGroupable = Boolean(groupField);
                const isActive = isGroupable && groupBy === groupField;

                return (
                  <th
                    key={h.label}
                    title={
                      groupField
                        ? OPERATIONS_GROUP_COLUMN_TITLES[groupField][isActive ? "active" : "inactive"]
                        : h.title
                    }
                    className={`lg:px-2 lg:py-3 xl:px-2 xl:py-3 text-left text-[11px] font-medium uppercase tracking-wider whitespace-nowrap${
                      isGroupable ? " cursor-pointer select-none" : ""
                    }`}
                    style={{
                      color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                    }}
                    onClick={
                      isGroupable && groupField
                        ? () => toggleGroupColumn(groupField)
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {h.label}
                      {isGroupable && groupField && (
                        <Layers
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowsSkeleton cols={8} />
            ) : deals.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : dealGroups ? (
              dealGroups.map((section) => (
                <Fragment key={section.key}>
                  <OperationsGroupHeaderRow label={section.label} count={section.deals.length} />
                  {section.deals.map((deal, idx) => (
                    <OperationsDealTableRow
                      key={deal.lead_id}
                      deal={deal}
                      rowIndex={idx}
                      onOpenDeal={openDeal}
                    />
                  ))}
                </Fragment>
              ))
            ) : (
              deals.map((deal, idx) => (
                <OperationsDealTableRow
                  key={deal.lead_id}
                  deal={deal}
                  rowIndex={idx}
                  onOpenDeal={openDeal}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          <MobileListCardSkeleton count={4} />
        ) : deals.length === 0 ? (
          <MobileListCardEmpty message={emptyMessage} />
        ) : dealGroups ? (
          dealGroups.map((section) => (
            <div key={section.key} className="space-y-3">
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-badge-bg)",
                }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider truncate"
                  style={{ color: "var(--color-badge-text)" }}
                >
                  {section.label}
                </span>
                <span
                  className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--color-badge-text) 12%, transparent)",
                    color: "var(--color-badge-text)",
                  }}
                >
                  {section.deals.length}
                </span>
              </div>
              {section.deals.map((deal) => (
                <OperationsMobileDealCard key={deal.lead_id} deal={deal} onOpenDeal={openDeal} />
              ))}
            </div>
          ))
        ) : (
          deals.map((deal) => (
            <OperationsMobileDealCard key={deal.lead_id} deal={deal} onOpenDeal={openDeal} />
          ))
        )}
      </div>

      <ListPagination
        total={pagination.total}
        offset={offset}
        pageSize={pageSize}
        onOffsetChange={setOffset}
        onPageSizeChange={handlePageSizeChange}
        loading={loading || refreshing}
      />
        </>
      )}

      <OperationsDealDetailDialog
        deal={selectedDeal}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onViewLead={handleViewLead}
      />

      {toast && (
        <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {drawerLead && (
        <VerifyDrawer
          lead={drawerLead}
          lookups={lookups}
          readOnly
          isAdmin
          onClose={() => setDrawerLead(null)}
          onLeadUpdated={(updated) => setDrawerLead(updated)}
          onLeadRemoved={() => setDrawerLead(null)}
          showToast={(message, type = "success") => setToast({ message, type: type ?? "success" })}
        />
      )}
    </div>
  );
}
