"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useListPageData } from "@/hooks/use-list-page-data";
import { notifyListDataChanged } from "@/lib/client/notify-list-data-changed";
import {
  clearLinePreviewListCache,
  seedLinePreviewFromListRows,
} from "@/lib/client/seed-line-preview-from-page-data";
import { TableDivSkeleton } from "@/components/ui/table-skeleton";
import { Clock, ExternalLink, UserCheck, AlertTriangle } from "lucide-react";
import { TicketLineItemsQuickPreview } from "@/components/quotes/ticket-line-items-quick-preview";
import { ExpandChevron, TicketListViewButton } from "@/components/ui/ticket-list-expand";
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
import { formatCurrency } from "@/lib/utils/ticket-math";
import { displayContactName, relativeTime, isOverdue } from "@/lib/utils/format";
import { formatQuoteListDueNow, getQuoteListDueNowAmount } from "@/lib/utils/quote-list-due-now";
import { quoteListStatus } from "@/lib/utils/quote-list-status";
import { quoteDetailPath, ticketPathSegment } from "@/lib/utils/reference-codes";
import { createClient } from "@/lib/supabase/client";
import { AdminUserFilter } from "@/components/ui/admin-user-filter";
import { appendAdminFilterUserId } from "@/lib/utils/admin-user-filter";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  type ListPageSize,
  type PaginationMeta,
} from "@/lib/utils/pagination";
import { useStoredListPageSize } from "@/hooks/use-stored-list-page-size";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteTicket {
  id: string;
  ticket_status: string;
  title: string | null;
  reference_code: string | null;
  quote_channel: string | null;
  quote_final_total: number | null;
  ticket_payment_strategy: "full" | "partial" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  prepayment_type: string | null;
  prepayment_value: string | null;
  client_confirmed: boolean | null;
  ticket_require_client_confirm: boolean | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_paid_at: string | null;
  deposit_paid_at: string | null;
  payment_amount_received: number | null;
  quote_reminder_date: string | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string; // injected by API for routed tickets
  routed_by_id: string | null;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  created_by: { id: string; full_name: string | null } | null;
}

type Tab = "all" | "draft" | "sent" | "approved" | "cancelled" | "routed";

const BASE_TABS: { id: Tab; label: string; status?: string }[] = [
  { id: "all",      label: "All" },
  { id: "draft",    label: "Draft",    status: "draft" },
  { id: "sent",     label: "Sent",     status: "sent" },
  { id: "approved", label: "Won",      status: "approved" },
  { id: "cancelled", label: "Cancelled", status: "cancelled" },
];

// Routed tab appended for sales/admin only
const ROUTED_TAB: { id: Tab; label: string; status: string } = {
  id: "routed", label: "Routed to Sales", status: "routed",
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: "var(--color-neutral-bg)",  text: "var(--color-neutral-text)", label: "Draft" },
  sent:      { bg: "var(--color-info-bg)",     text: "var(--color-info-text)",    label: "Sent" },
  approved:  { bg: "var(--color-success-bg)",  text: "var(--color-success)",      label: "Approved" },
  cancelled: { bg: "var(--color-danger-bg)",   text: "var(--color-danger)",       label: "Cancelled" },
  routed:    { bg: "var(--color-warning-bg)",  text: "var(--color-warning)",      label: "Routed" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


function QuoteMobileCard({
  quote: q,
  expanded,
  onToggleExpand,
  onOpen,
}: {
  quote: QuoteTicket;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
}) {
  const statusStyle = quoteListStatus(q);
  const overdue = isOverdue(q.quote_reminder_date);

  return (
    <MobileListCard onClick={onToggleExpand}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden>
            <ExpandChevron open={expanded} />
          </span>
          <div className="min-w-0">
          <span className="text-xs font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
            {q.reference_code ?? "—"}
          </span>
          {(() => {
            const n = displayContactName(q.customer, { preferPerson: true });
            return (
              <p className="font-semibold text-sm mt-1.5 truncate" title={n} style={{ color: "var(--color-text-primary)" }}>
                {n}
              </p>
            );
          })()}
          {q.customer?.company && (
            <p className="text-xs truncate" title={q.customer.company} style={{ color: "var(--color-text-muted)" }}>{q.customer.company}</p>
          )}
          </div>
        </div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
          style={{ background: statusStyle.bg, color: statusStyle.text }}
        >
          {statusStyle.label}
        </span>
      </div>

      {q.title && (
        <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>{q.title}</p>
      )}

      <MobileListCardFields>
        <MobileListCardRow label="Channel" value={q.quote_channel ?? "—"} />
        <MobileListCardRow
          label="Total"
          value={q.quote_final_total != null ? formatCurrency(q.quote_final_total) : "—"}
        />
        <MobileListCardRow
          label="Due Now"
          value={formatQuoteListDueNow(q)}
          valueColor={getQuoteListDueNowAmount(q) != null ? "var(--color-warning)" : undefined}
        />
        <MobileListCardRow
          label="Follow-up"
          value={
            q.quote_reminder_date
              ? new Date(q.quote_reminder_date + "T00:00:00").toLocaleDateString("en-US")
              : "—"
          }
          valueColor={overdue ? "var(--color-danger)" : undefined}
        />
        <MobileListCardRow label="Created" value={relativeTime(q.created_at)} />
      </MobileListCardFields>

      <TicketLineItemsQuickPreview
        ticketId={q.id}
        ticketRef={ticketPathSegment(q)}
        expanded={expanded}
        previewId={`quote-preview-${q.id}`}
      />

      <TicketListViewButton
        label="View quote"
        className="w-full justify-center px-2.5 py-2"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      />
    </MobileListCard>
  );
}

function RoutedQuoteMobileCard({
  quote: q,
  expanded,
  onToggleExpand,
  userRole,
  claimingId,
  onView,
  onClaim,
}: {
  quote: QuoteTicket;
  expanded: boolean;
  onToggleExpand: () => void;
  userRole: string | null;
  claimingId: string | null;
  onView: () => void;
  onClaim: () => void;
}) {
  return (
    <MobileListCard onClick={onToggleExpand}>
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden>
          <ExpandChevron open={expanded} />
        </span>
        <div className="min-w-0 flex-1">
        {(() => {
          const n = displayContactName(q.customer, { preferPerson: true });
          return (
            <p className="font-semibold text-sm truncate" title={n} style={{ color: "var(--color-text-primary)" }}>
              {n}
            </p>
          );
        })()}
        {q.customer?.company && (
          <p className="text-xs truncate" title={q.customer.company} style={{ color: "var(--color-text-muted)" }}>{q.customer.company}</p>
        )}
        </div>
      </div>

      {q.title && (
        <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>{q.title}</p>
      )}

      <MobileListCardFields>
        <MobileListCardRow label="Quote #" value={q.reference_code ?? "—"} />
        <MobileListCardRow
          label="Total"
          value={q.quote_final_total != null ? formatCurrency(q.quote_final_total) : "—"}
          valueColor="var(--color-warning)"
        />
        <MobileListCardRow
          label="Due Now"
          value={formatQuoteListDueNow(q)}
          valueColor={getQuoteListDueNowAmount(q) != null ? "var(--color-warning)" : undefined}
        />
        <MobileListCardRow label="Routed By" value={q.created_by_name ?? "SDR"} />
        <MobileListCardRow label="Date" value={relativeTime(q.created_at)} />
      </MobileListCardFields>

      <TicketLineItemsQuickPreview
        ticketId={q.id}
        ticketRef={ticketPathSegment(q)}
        expanded={expanded}
        previewId={`quote-preview-${q.id}`}
      />

      {userRole === "sdr" ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onView(); }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
        >
          <ExternalLink size={12} />
          View
        </button>
      ) : (
        <button
          type="button"
          disabled={claimingId === q.id}
          onClick={(e) => { e.stopPropagation(); onClaim(); }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
        >
          <UserCheck size={12} />
          {claimingId === q.id ? "Claiming…" : "Claim"}
        </button>
      )}
    </MobileListCard>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteTicket[]>([]);
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
  const [pageSize, setPageSize] = useStoredListPageSize();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DashboardDateRangeFilterValue>(() =>
    defaultDashboardDateRangeFilterValue("last_month"),
  );
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdmin = userRole === "admin";

  function toggleQuoteExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [tab, debouncedSearch, dateFilter, filterUserId, pageSize]);

  useEffect(() => {
    setExpandedId(null);
  }, [tab, debouncedSearch, dateFilter, filterUserId, offset, pageSize]);

  const dateRange = useMemo(() => resolveDashboardDateRangeFilter(dateFilter), [dateFilter]);

  // ─── Fetch current user role ─────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("roles(name)")
          .eq("id", uid)
          .single();
        const roleName = (profile?.roles as unknown as { name: string } | null)?.name ?? null;
        setUserRole(roleName);
      }
    });
  }, []);

  const canSeeRouted = userRole === "sales" || userRole === "admin" || userRole === "sdr";
  const TABS = canSeeRouted ? [...BASE_TABS, ROUTED_TAB] : BASE_TABS;

  const pageDataUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("tab", tab);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (dateRange) {
      params.set("date_from", dateRange.start.toISOString());
      params.set("date_to", dateRange.end.toISOString());
    }
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    appendAdminFilterUserId(params, isAdmin ? "admin" : null, filterUserId);
    const qs = params.toString();
    return `/api/quotes/page-data${qs ? `?${qs}` : ""}`;
  }, [filterUserId, isAdmin, tab, debouncedSearch, dateRange, offset, pageSize]);

  const { data: pageData, loading, refreshing, refresh: refreshPageData } = useListPageData<{
    tickets?: QuoteTicket[];
    counts?: Record<string, number>;
    pagination?: PaginationMeta;
  }>({
    prefix: "quotes",
    url: pageDataUrl,
    events: ["bazaar:tickets-changed", "bazaar:refresh-counts", "bazaar:activities-changed"],
  });

  useEffect(() => {
    if (!pageData) {
      setQuotes([]);
      clearLinePreviewListCache();
      return;
    }
    if (pageData.tickets) {
      setQuotes(pageData.tickets);
      seedLinePreviewFromListRows(pageData.tickets);
    }
    if (pageData.counts) setTabCounts(pageData.counts);
    if (pageData.pagination) setPagination(pageData.pagination);
  }, [pageData]);

  // Routed tab: job_tickets Realtime needs sales_read_routed_tickets RLS (migration 086).
  // Claim UPDATE often invisible to other reps (row no longer routed); activities INSERT covers that.
  useEffect(() => {
    if (!canSeeRouted) return;

    const supabase = createClient();
    const silentRefresh = () => void refreshPageData(true);

    const channel = supabase
      .channel("quotes-page-routed-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_tickets" },
        () => {
          window.dispatchEvent(new Event("bazaar:refresh-counts"));
          silentRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activities" },
        (payload) => {
          const row = payload.new as { ticket_id?: string | null; lead_id?: string | null };
          if (row.ticket_id || row.lead_id) {
            window.dispatchEvent(new Event("bazaar:refresh-counts"));
            silentRefresh();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canSeeRouted, refreshPageData]);

  // ─── Claim action ────────────────────────────────────────────────────────

  async function handleClaim(q: QuoteTicket) {
    if (!userId) return;
    setClaimingId(q.id);
    setClaimNotice(null);
    const pathSeg = ticketPathSegment(q);
    try {
      const res = await fetch(`/api/tickets/${pathSeg}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_status: "draft", claim_ownership: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClaimNotice(
          (data as { error?: string }).error ?? "This quote could not be claimed. It may already be assigned.",
        );
        return;
      }
      notifyListDataChanged({ cachePrefix: "quotes" });
      router.push(quoteDetailPath(q));
    } finally {
      setClaimingId(null);
    }
  }

  function handlePageSizeChange(size: ListPageSize) {
    setPageSize(size);
    setOffset(0);
  }

  function selectTab(next: Tab) {
    setTab(next);
    setOffset(0);
  }

  const emptyMessage = debouncedSearch
    ? "No quotes match your search."
    : tabCounts.all === 0 && tab !== "routed" && tab !== "cancelled"
      ? "No quotes in this date range."
      : tab === "routed" && (tabCounts.routed ?? 0) === 0
        ? "No routed quotes."
        : tab === "cancelled" && (tabCounts.cancelled ?? 0) === 0
          ? "No cancelled quotes."
          : "No quotes in this tab.";

  const isRoutedTab = tab === "routed";

  return (
    <div className="space-y-5" style={{ color: "var(--color-text-primary)" }}>

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Quoted Requests
        </h1>
        <button
          onClick={() => router.push("/quotes/new")}
          className="flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-80 shrink-0"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          New Quote
        </button>
      </div>

      {/* Date filter row */}
      <div className="flex justify-end mb-4 lg:mb-6">
        <DashboardDateRangeFilter value={dateFilter} onChange={setDateFilter} className="w-full lg:w-auto" />
      </div>

      {claimNotice && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            color: "var(--color-danger-text-deep)",
          }}
          role="alert"
        >
          {claimNotice}
        </div>
      )}

      {isRoutedTab && userRole === "sdr" && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <p style={{ color: "var(--color-warning-text-deep)" }}>
            These quotes exceeded the high-value threshold and were handed off to Sales. You can view them in read-only mode.
          </p>
        </div>
      )}

      <TicketListToolbar
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={tab}
        onTabChange={(id) => selectTab(id as Tab)}
        tabCounts={tabCounts}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search quotes…"
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
          <TableDivSkeleton cols={isRoutedTab ? 9 : isAdmin ? 12 : 11} />
        ) : quotes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {emptyMessage}
            </p>
          </div>
        ) : isRoutedTab ? (
          /* ── Routed tab: dedicated layout ────────────────────────────── */
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["", "Contact", "Quote #", "Title", "Total", "Due Now", "Routed By", "Date", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, idx) => {
                const isOpen = expandedId === q.id;
                const rowBg = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)";
                return (
                <Fragment key={q.id}>
                <tr
                  className="cursor-pointer transition-colors"
                  style={{ background: isOpen ? "var(--color-row-hover)" : rowBg }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isOpen ? "var(--color-row-hover)" : rowBg)}
                  onClick={() => toggleQuoteExpand(q.id)}
                  aria-expanded={isOpen}
                >
                  <td className="px-3 py-3 w-10">
                    <span style={{ color: "var(--color-text-muted)" }}>
                      <ExpandChevron open={isOpen} />
                    </span>
                  </td>
                  <td className="px-4 py-3 overflow-hidden">
                    {(() => {
                      const n = displayContactName(q.customer, { preferPerson: true });
                      return (
                        <p className="text-sm font-medium truncate max-w-[200px]" title={n} style={{ color: "var(--color-text-primary)" }}>{n}</p>
                      );
                    })()}
                    {q.customer?.company && (
                      <p className="text-xs mt-0.5 truncate max-w-[200px]" title={q.customer.company} style={{ color: "var(--color-text-muted)" }}>{q.customer.company}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {q.reference_code ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm truncate max-w-[200px]" style={{ color: "var(--color-text-primary)" }}>
                      {q.title ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold" style={{ color: "var(--color-warning)" }}>
                      {q.quote_final_total != null ? formatCurrency(q.quote_final_total) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-sm font-medium"
                      style={{
                        color: getQuoteListDueNowAmount(q) != null
                          ? "var(--color-warning)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {formatQuoteListDueNow(q)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {q.created_by_name ?? "SDR"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {relativeTime(q.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {userRole === "sdr" ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(quoteDetailPath(q)); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                      >
                        <ExternalLink size={12} />
                        View
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={claimingId === q.id}
                        onClick={(e) => { e.stopPropagation(); handleClaim(q); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                      >
                        <UserCheck size={12} />
                        {claimingId === q.id ? "Claiming…" : "Claim"}
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${q.id}-preview`} style={{ background: "var(--color-row-alt)" }}>
                    <td colSpan={9} className="p-0 border-b" style={{ borderColor: "var(--color-border)" }}>
                      <TicketLineItemsQuickPreview
                        ticketId={q.id}
                        ticketRef={ticketPathSegment(q)}
                        expanded
                        previewId={`quote-preview-${q.id}`}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );})}
            </tbody>
          </table>
        ) : (
          /* ── Standard tabs ───────────────────────────────────────────── */
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {[
                  "",
                  "Contact",
                  "Quote #",
                  "Title",
                  ...(isAdmin ? ["Created by"] : []),
                  "Channel",
                  "Total",
                  "Due Now",
                  "Status",
                  "Follow-up",
                  "Created",
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
              {quotes.map((q, idx) => {
                const statusStyle = quoteListStatus(q);
                const overdue = isOverdue(q.quote_reminder_date);
                const isOpen = expandedId === q.id;
                const rowBg = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)";
                const colCount = isAdmin ? 12 : 11;
                return (
                  <Fragment key={q.id}>
                  <tr
                    className="cursor-pointer transition-colors"
                    style={{
                      background: isOpen ? "var(--color-row-hover)" : rowBg,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = isOpen ? "var(--color-row-hover)" : rowBg)}
                    onClick={() => toggleQuoteExpand(q.id)}
                    aria-expanded={isOpen}
                  >
                    <td className="px-3 py-3 w-10">
                      <span style={{ color: "var(--color-text-muted)" }}>
                        <ExpandChevron open={isOpen} />
                      </span>
                    </td>
                    <td className="px-4 py-3 overflow-hidden">
                      {(() => {
                        const n = displayContactName(q.customer, { preferPerson: true });
                        return (
                          <p className="text-sm font-medium truncate max-w-[200px]" title={n} style={{ color: "var(--color-text-primary)" }}>{n}</p>
                        );
                      })()}
                      {q.customer?.company && (
                        <p className="text-xs mt-0.5 truncate max-w-[200px]" title={q.customer.company} style={{ color: "var(--color-text-muted)" }}>{q.customer.company}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {q.reference_code ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm truncate max-w-[200px]" style={{ color: "var(--color-text-primary)" }}>
                        {q.title ?? "—"}
                      </p>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {q.created_by?.full_name ?? q.created_by_name ?? "—"}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                        {q.quote_channel ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {q.quote_final_total != null ? formatCurrency(q.quote_final_total) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-sm font-medium"
                        style={{
                          color: getQuoteListDueNowAmount(q) != null
                            ? "var(--color-warning)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        {formatQuoteListDueNow(q)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: statusStyle.bg, color: statusStyle.text }}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {q.quote_reminder_date ? (
                        <span
                          className="flex items-center gap-1 text-xs font-medium"
                          style={{ color: overdue ? "var(--color-danger)" : "var(--color-text-muted)" }}
                        >
                          <Clock size={12} />
                          {new Date(q.quote_reminder_date + "T00:00:00").toLocaleDateString("en-US")}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {relativeTime(q.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TicketListViewButton
                        label="View"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(quoteDetailPath(q));
                        }}
                      />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${q.id}-preview`} style={{ background: "var(--color-row-alt)" }}>
                      <td colSpan={colCount} className="p-0 border-b" style={{ borderColor: "var(--color-border)" }}>
                        <TicketLineItemsQuickPreview
                          ticketId={q.id}
                          ticketRef={ticketPathSegment(q)}
                          expanded
                          previewId={`quote-preview-${q.id}`}
                        />
                      </td>
                    </tr>
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
        ) : quotes.length === 0 ? (
          <MobileListCardEmpty message={emptyMessage} />
        ) : isRoutedTab ? (
          quotes.map((q) => (
            <RoutedQuoteMobileCard
              key={q.id}
              quote={q}
              expanded={expandedId === q.id}
              onToggleExpand={() => toggleQuoteExpand(q.id)}
              userRole={userRole}
              claimingId={claimingId}
              onView={() => router.push(quoteDetailPath(q))}
              onClaim={() => handleClaim(q)}
            />
          ))
        ) : (
          quotes.map((q) => (
            <QuoteMobileCard
              key={q.id}
              quote={q}
              expanded={expandedId === q.id}
              onToggleExpand={() => toggleQuoteExpand(q.id)}
              onOpen={() => router.push(quoteDetailPath(q))}
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
