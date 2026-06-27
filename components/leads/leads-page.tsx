"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { useListPageData } from "@/hooks/use-list-page-data";
import { ListRefreshingNotice } from "@/components/ui/mobile-list-card";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Clock, ArrowUpDown, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { UrgencyPill } from "@/components/ui/urgency-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status-pill";
import {
  GLOBAL_LOADING_MESSAGES,
  useGlobalLoading,
} from "@/components/layout/global-loading-provider";

const VerifyDrawer = dynamic(
  () => import("@/components/leads/verify-drawer").then((m) => ({ default: m.VerifyDrawer })),
  { ssr: false, loading: () => null },
);
const AddLeadModal = dynamic(
  () => import("@/components/leads/add-lead-modal").then((m) => ({ default: m.AddLeadModal })),
  { ssr: false, loading: () => null },
);
const RouteToSalesModal = dynamic(
  () => import("@/components/leads/route-to-sales-modal").then((m) => ({ default: m.RouteToSalesModal })),
  { ssr: false, loading: () => null },
);
import { Lead, LookupMap } from "@/lib/types";
import { holdReasonLabel } from "@/lib/constants/hold-reasons";
import { followUpReasonLabel } from "@/lib/constants/follow-up-reasons";
import { formatPhone } from "@/lib/utils/phone";
import { relativeTime, displayContactName } from "@/lib/utils/format";
import { ToastBanner } from "@/components/ui/toast-banner";
import { fetchLeadById } from "@/lib/utils/fetch-lead";
import { LeadHistoryTable, type LeadHistoryRow } from "@/components/leads/lead-history-table";
import { formatLeadProductInterests } from "@/lib/utils/format-lead-product-interests";
import {
  getRoutedPipelineStage,
  ROUTED_FILTER_LABELS,
  ROUTED_FILTER_OPTIONS,
  ROUTED_STAGE_LABELS,
  ROUTED_STAGE_STYLES,
  type RoutedPipelineFilter,
} from "@/lib/utils/lead-routed-pipeline-stage";
import {
  routedLeadTicketDisplay,
  type RoutedLeadTicket,
} from "@/lib/utils/lead-routed-ticket-status";
import { parseLeadsTabParam } from "@/lib/utils/leads-return-path";
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

type Tab = "all" | "follow_up" | "hold" | "routed" | "rejected" | "won";

interface Toast {
  message: string;
  type: "success" | "error";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────



function productInterestsText(lead: Lead): string {
  return formatLeadProductInterests(lead.interests, lead.quantities);
}

function ProductInterestsTableCell({ lead }: { lead: Lead }) {
  const products = productInterestsText(lead);
  return (
    <td className="px-3 py-2.5 max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
      <span className="block truncate" title={products !== "—" ? products : undefined}>
        {products}
      </span>
    </td>
  );
}

function ProductInterestsMobileRow({ lead }: { lead: Lead }) {
  const products = productInterestsText(lead);
  if (products === "—") return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0">Product Interests</span>
      <span className="normal-case tracking-normal text-right truncate max-w-[200px]">{products}</span>
    </div>
  );
}

function RoutedStagePill({ lead }: { lead: Lead }) {
  const stage = getRoutedPipelineStage(lead);
  const style = ROUTED_STAGE_STYLES[stage];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
    >
      {ROUTED_STAGE_LABELS[stage]}
    </span>
  );
}

type RoutedLeadRow = Lead & { tickets?: RoutedLeadTicket[] };

function RoutedLeadStatusCell({ lead }: { lead: RoutedLeadRow }) {
  const display = routedLeadTicketDisplay(lead, lead.tickets);

  if (display.kind === "lead_status") {
    return <StatusPill status={display.status} />;
  }

  const tone =
    display.kind === "order"
      ? {
          bg: "var(--color-success-bg)",
          text: "var(--color-success)",
          border: "var(--color-success-border)",
        }
      : display.kind === "waiting"
        ? {
            bg: "var(--color-warning-bg)",
            text: "var(--color-warning)",
            border: "var(--color-warning-border)",
          }
        : {
            bg: "var(--color-info-bg)",
            text: "var(--color-info-text)",
            border: "var(--color-info-border)",
          };

  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium font-mono"
      style={{
        background: tone.bg,
        color: tone.text,
        borderColor: tone.border,
      }}
    >
      {display.label}
    </span>
  );
}

// ─── Created By ───────────────────────────────────────────────────────────────

function CreatedByTableCell({ lead }: { lead: Lead }) {
  if (lead.is_system_created) {
    return (
      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
        >
          System
        </span>
      </td>
    );
  }
  if (lead.created_by?.full_name) {
    return (
      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-primary)" }}>
        {lead.created_by.full_name}
      </td>
    );
  }
  return <td className="px-3 py-2.5" />;
}

function CreatedByMobileRow({ lead }: { lead: Lead }) {
  if (lead.is_system_created) {
    return (
      <div className="flex justify-between items-center">
        <span>Created By</span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal"
          style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
        >
          System
        </span>
      </div>
    );
  }
  if (lead.created_by?.full_name) {
    return (
      <div className="flex justify-between">
        <span>Created By</span>
        <span className="normal-case tracking-normal" style={{ color: "var(--color-text-primary)" }}>
          {lead.created_by.full_name}
        </span>
      </div>
    );
  }
  return null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────


// ─── Table skeleton — see components/ui/table-skeleton.tsx ───────────────────

// ─── Main LeadsPage component ─────────────────────────────────────────────────

export function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { runWithLoading } = useGlobalLoading();
  const [activeTab, setActiveTab] = useState<Tab>(
    () => parseLeadsTabParam(searchParams.get("tab")) ?? "all",
  );
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    limit: 25,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useStoredListPageSize();
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [lookups, setLookups] = useState<LookupMap>({});
  const lookupsLoadedRef = useRef(false);
  const sourceLabels = Object.fromEntries((lookups.source ?? []).map((s) => [s.value, s.label]));

  // Drawer state
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [openingLeadId, setOpeningLeadId] = useState<string | null>(null);
  const [drawerReadOnly, setDrawerReadOnly] = useState(false);
  const [drawerLockedBy, setDrawerLockedBy] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Reassign modal state (admin only)
  const [sdrList, setSdrList] = useState<{ id: string; full_name: string }[]>([]);
  const [reassignLead, setReassignLead] = useState<Lead | null>(null);
  const [reassignUserId, setReassignUserId] = useState<string>("unassign");
  const [reassigning, setReassigning] = useState(false);
  const [routeModalLead, setRouteModalLead] = useState<Lead | null>(null);
  const [routeModalSaving, setRouteModalSaving] = useState(false);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  // Owner filter (SDR users only): "all" = unclaimed pool, "mine" = leads I claimed
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");

  // Routed tab sub-filter — pipeline stage within SDR-routed leads
  const [routedFilter, setRoutedFilter] = useState<RoutedPipelineFilter>("all");
  const [routedSubCounts, setRoutedSubCounts] = useState<Record<RoutedPipelineFilter, number>>(() =>
    Object.fromEntries(ROUTED_FILTER_OPTIONS.map((key) => [key, 0])) as Record<
      RoutedPipelineFilter,
      number
    >,
  );

  // Sort — field + direction
  type SortField = "created" | "urgency";
  type SortDir   = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDir,   setSortDir]   = useState<SortDir>("desc"); // newest first by default

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "urgency" ? "asc" : "desc");
    }
    setOffset(0);
  }

  // Mobile cycling: newest → oldest → urgency high → (repeat)
  function cycleMobileSort() {
    if (sortField === "created" && sortDir === "desc") {
      setSortField("created");
      setSortDir("asc");
    } else if (sortField === "created" && sortDir === "asc") {
      setSortField("urgency");
      setSortDir("asc");
    } else {
      setSortField("created");
      setSortDir("desc");
    }
    setOffset(0);
  }
  const mobileSortLabel =
    sortField === "urgency" ? "Urgency: High first" :
    sortDir === "asc"       ? "Oldest first"        : "Newest first";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [activeTab, debouncedSearch, filterUserId, ownerFilter, routedFilter, pageSize, sortField, sortDir]);

  // Fetch current user id + role
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
        const roleName = (profile?.roles as unknown as { name: string } | null)?.name;
        setUserRole(roleName ?? null);
        setIsAdmin(roleName === "admin");
      }
    });
  }, []);

  // Fetch active SDR list when admin opens reassign modal
  useEffect(() => {
    if (!isAdmin || !reassignLead) return;
    if (sdrList.length > 0) return;
    fetch("/api/admin/users?role=sdr")
      .then((r) => r.json())
      .then((d) => setSdrList(d.users ?? []));
  }, [isAdmin, reassignLead, sdrList.length]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  // Load lookups on mount (needed for source labels in the table) and again when modal/drawer opens
  useEffect(() => {
    if (lookupsLoadedRef.current) return;
    lookupsLoadedRef.current = true;
    fetch("/api/lookups?categories=source,industry,urgency,hold_reason,follow_up_reason,reject_reason,route_reason,sales_drop_reason")
      .then((r) => r.json())
      .then((d) => setLookups(d))
      .catch(() => {
        lookupsLoadedRef.current = false;
      });
  }, []);

  function selectTab(next: Tab) {
    setActiveTab(next);
    setOffset(0);
    if (next !== "routed") setRoutedFilter("all");
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  function selectRoutedFilter(next: RoutedPipelineFilter) {
    setRoutedFilter(next);
    setOffset(0);
  }

  function handlePageSizeChange(size: ListPageSize) {
    setPageSize(size);
    setOffset(0);
  }

  useEffect(() => {
    const tab = parseLeadsTabParam(searchParams.get("tab")) ?? "all";
    setActiveTab(tab);
  }, [searchParams]);

  // ── Tab config ────────────────────────────────────────────────────────────

  const TAB_CONFIG: {
    id: Tab;
    label: string;
    status: string | null;
    statuses?: string[];
    serverStatuses?: string[];
    routed?: boolean;
    scope?: string;
  }[] = [
    { id: "all",      label: "All Leads",         status: null,              statuses: ["Pending", "Validated"] },
    { id: "follow_up", label: "Follow Up Later",  status: "Follow Up Later", scope: "mine" },
    { id: "hold",     label: "On Hold",            status: "On Hold",         scope: "mine" },
    { id: "routed",   label: "Directed to Sales",  status: null,              routed: true, scope: "mine" },
    { id: "rejected", label: "Rejected",           status: "Rejected",        scope: "mine" },
    { id: "won",      label: "Won",                status: null,              scope: "mine" },
  ];

  // ── Fetch leads ───────────────────────────────────────────────────────────

  const pageDataUrl = useMemo(() => {
    const tabConf = TAB_CONFIG.find((t) => t.id === activeTab)!;
    const params = new URLSearchParams();
    if (tabConf.status) params.set("status", tabConf.status);
    if (tabConf.statuses) params.set("statuses", tabConf.statuses.join(","));
    if (tabConf.routed) params.set("routed", "true");
    if (tabConf.scope) params.set("scope", tabConf.scope);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (activeTab === "won") params.set("won", "true");
    if (activeTab === "all" && !isAdmin) params.set("owner_scope", ownerFilter);
    if (activeTab === "routed" && routedFilter !== "all") params.set("routed_filter", routedFilter);
    params.set("sort", sortField);
    params.set("sort_dir", sortDir);
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    appendAdminFilterUserId(params, isAdmin ? "admin" : null, filterUserId);
    return `/api/leads/workspace/page-data?${params}`;
  }, [
    activeTab,
    debouncedSearch,
    filterUserId,
    isAdmin,
    ownerFilter,
    routedFilter,
    offset,
    pageSize,
    sortField,
    sortDir,
  ]);

  const { data: pageData, loading, refreshing, refresh: refreshPageData } = useListPageData<{
    leads?: Lead[];
    counts?: Record<string, number>;
    pagination?: PaginationMeta;
    routedSubCounts?: Record<string, number>;
  }>({
    prefix: "leads",
    url: pageDataUrl,
    events: ["bazaar:leads-changed", "bazaar:refresh-counts"],
    enabled: !drawerLead || drawerReadOnly,
  });

  useEffect(() => {
    if (!pageData) {
      setLeads([]);
      return;
    }
    setLeads(Array.isArray(pageData.leads) ? pageData.leads : []);
    if (pageData.counts) setTabCounts(pageData.counts);
    if (pageData.pagination) {
      setPagination(pageData.pagination);
      if (pageData.pagination.total > 0 && offset >= pageData.pagination.total) {
        setOffset(0);
        return;
      }
    }
    if (pageData.routedSubCounts) setRoutedSubCounts(pageData.routedSubCounts);
  }, [pageData, offset]);

  // ── Open drawer ───────────────────────────────────────────────────────────

  /** Routed + Won tabs: SDR can view lead details only (already handed off or won). */
  function isSdrReadOnlyLeadTab(): boolean {
    return userRole === "sdr" && (activeTab === "routed" || activeTab === "won");
  }

  async function withLeadOpening(leadId: string, fn: () => Promise<void>) {
    if (openingLeadId) return;
    setOpeningLeadId(leadId);
    try {
      await runWithLoading(fn, GLOBAL_LOADING_MESSAGES.openingLead);
    } finally {
      setOpeningLeadId(null);
    }
  }

  async function openReadOnlyLead(lead: Lead) {
    await withLeadOpening(lead.id, async () => {
      const full = (await fetchLeadById(lead.id)) ?? lead;
      setDrawerLead(full);
      setDrawerReadOnly(true);
      setDrawerLockedBy(null);
    });
  }

  async function handleWorkLead(lead: Lead) {
    if (isSdrReadOnlyLeadTab()) {
      await openReadOnlyLead(lead);
      return;
    }
    await withLeadOpening(lead.id, async () => {
      const res = await fetch(`/api/leads/${lead.id}/lock`, { method: "POST" });
      const data = await res.json();
      const full = (await fetchLeadById(lead.id)) ?? lead;

      if (res.status === 409) {
        setDrawerLead(full);
        setDrawerReadOnly(true);
        setDrawerLockedBy(data.locked_by?.full_name ?? "Another user");
      } else {
        setDrawerLead(full);
        setDrawerReadOnly(false);
        setDrawerLockedBy(null);
      }
    });
  }

  async function handleViewLead(lead: Lead) {
    if (isSdrReadOnlyLeadTab()) {
      await openReadOnlyLead(lead);
      return;
    }
    await withLeadOpening(lead.id, async () => {
      const full = (await fetchLeadById(lead.id)) ?? lead;
      setDrawerLead(full);
      setDrawerReadOnly(!isAdmin);
      setDrawerLockedBy(null);
    });
  }

  function leadActionDisabled() {
    return openingLeadId !== null;
  }

  function leadActionLabel(leadId: string, label: string) {
    if (openingLeadId !== leadId) return label;
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Opening…
      </span>
    );
  }

  async function handleRouteLeadToSales(lead: Lead) {
    setRouteModalLead(lead);
  }

  async function confirmRouteLeadToSales(salesOwnerId: string | null) {
    if (!routeModalLead) return;
    setRouteModalSaving(true);
    const res = await fetch(`/api/leads/${routeModalLead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Routed to Sales",
        sales_status: "Ongoing",
        ...(salesOwnerId ? { sales_owner_id: salesOwnerId } : {}),
      }),
    });
    const data = await res.json();
    setRouteModalSaving(false);
    if (!res.ok) {
      showToast(data.error ?? "Failed to route lead.", "error");
      return;
    }
    fetch(`/api/leads/${routeModalLead.id}/unlock`, { method: "POST" }).catch(() => {});
    setLeads((prev) => prev.filter((l) => l.id !== routeModalLead.id));
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
    setRouteModalLead(null);
    showToast("Lead routed to Sales.");
  }

  async function handleResumeLead(lead: Lead) {
    const res = await fetch(`/api/leads/${lead.id}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "sdr" }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error ?? "Failed to resume.", "error"); return; }
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
    showToast("Lead resumed.");
  }

  async function handleReassign() {
    if (!reassignLead) return;
    setReassigning(true);
    const newUser = reassignUserId === "unassign" ? null : reassignUserId;
    const res = await fetch(`/api/leads/${reassignLead.id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: newUser }),
    });
    const data = await res.json();
    setReassigning(false);
    if (!res.ok) { showToast(data.error ?? "Failed to reassign lead.", "error"); return; }
    setLeads((prev) => prev.map((l) => l.id === data.lead.id ? data.lead : l));
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
    setReassignLead(null);
    showToast(newUser ? "Lead reassigned." : "Lead unassigned.");
  }

  // ── Open drawer ───────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: "all",      label: "All Leads" },
    { id: "follow_up", label: "Follow Up Later" },
    { id: "hold",     label: "On Hold" },
    { id: "routed",   label: "Directed to Sales" },
    { id: "rejected", label: "Rejected" },
    { id: "won",      label: "Won" },
  ];

  // Filtered leads — server-side filters, sort, and pagination
  const filtered = leads;

  useEffect(() => {
    if (activeTab !== "routed" || routedFilter === "all") return;
    if (routedSubCounts[routedFilter] === 0) {
      setRoutedFilter("all");
    }
  }, [activeTab, routedFilter, routedSubCounts]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Leads
        </h1>
        <Button onClick={() => setAddOpen(true)}>
          Add Lead
        </Button>
      </div>

      {/* Tab bar + Search + Filters — same row on desktop */}
      <div
        className="flex flex-col gap-2 lg:flex-row lg:items-center border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {/* Tabs — scrollable, takes remaining width */}
        <div className="flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-1 min-w-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              className="whitespace-nowrap px-4 py-2.5 text-[13px] font-medium transition-colors shrink-0"
              style={{
                borderBottom: activeTab === tab.id ? "2px solid var(--color-tab-underline)" : "2px solid transparent",
                color: activeTab === tab.id ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
              }}
            >
              {tab.label}
              {tabCounts[tab.id] !== undefined && tabCounts[tab.id] > 0 && (
                <span
                  className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                  style={{
                    background: activeTab === tab.id ? "var(--color-badge-bg)" : "color-mix(in srgb, var(--color-border) 60%, transparent)",
                    color: activeTab === tab.id ? "var(--color-badge-text)" : "var(--color-text-muted)",
                  }}
                >
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + Filters — right side */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center pb-2 lg:pb-0 w-full lg:w-auto lg:shrink-0">
          <div className="relative w-full lg:w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-full"
            />
          </div>

          {isAdmin && (
            <AdminUserFilter value={filterUserId} onChange={setFilterUserId} className="rounded-[6px] border px-3 py-2 text-[13px] font-medium outline-none h-8 w-full lg:w-auto" />
          )}
          {activeTab === "all" && !isAdmin && (
          <div
            className="flex rounded-[6px] overflow-hidden border text-[12px] font-medium"
            style={{ borderColor: "var(--color-border)" }}
          >
            {(["all", "mine"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  setOwnerFilter(opt);
                  setOffset(0);
                }}
                className="px-3 h-8 transition-colors"
                style={{
                  background: ownerFilter === opt ? "var(--color-tab-active)" : "var(--color-surface)",
                  color: ownerFilter === opt ? "var(--color-text-inverse)" : "var(--color-text-muted)",
                  borderRight: opt === "all" ? "1px solid var(--color-border)" : undefined,
                }}
              >
                {opt === "all" ? "All Leads" : "My Leads"}
              </button>
            ))}
          </div>
        )}

        </div>
      </div>

      {/* ── All Leads tab ── */}
      {activeTab === "all" && (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {(["Name", "Created By", "Company", "Source", "Product Interests", "Phone", "Urgency", "Status", "Owner", "Created", "Action"] as const).map((h) => {
                    const isSortable = h === "Urgency" || h === "Created";
                    const field: SortField = h === "Urgency" ? "urgency" : "created";
                    const isActive = isSortable && sortField === field;
                    return (
                      <th
                        key={h}
                        className={`px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap${isSortable ? " cursor-pointer select-none" : ""}`}
                        style={{ color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                        onClick={isSortable ? () => toggleSort(field) : undefined}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {h}
                          {isSortable && (
                            isActive
                              ? sortDir === "asc"
                                ? <ChevronUp className="h-3 w-3" />
                                : <ChevronDown className="h-3 w-3" />
                              : <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={11} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className="transition-colors"
                      style={{
                        background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                    >
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                        {displayContactName(lead.customer, { preferPerson: true })}
                      </td>
                      {/* Created By column */}
                      <CreatedByTableCell lead={lead} />
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.company || "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {(lead.source && (sourceLabels[lead.source] ?? lead.source)) || "—"}
                      </td>
                      <td className="px-3 py-2.5 max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
                        <span className="block truncate" title={productInterestsText(lead) !== "—" ? productInterestsText(lead) : undefined}>
                          {productInterestsText(lead)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.phone ? formatPhone(lead.customer.phone) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <UrgencyPill urgency={lead.urgency} />
                      </td>
                      <td className="px-3 py-2.5"><StatusPill status={lead.status} /></td>
                      {/* Owner column — visible to all roles */}
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        {lead.locked_by_id ? (
                          lead.locked_by_id === userId ? (
                            <span className="italic" style={{ color: "var(--color-text-muted)" }}>You</span>
                          ) : (
                            <span style={{ color: "var(--color-text-primary)" }}>
                              {(lead.locked_by as { full_name?: string | null } | undefined)?.full_name ?? "—"}
                            </span>
                          )
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
                          >
                            Unclaimed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {relativeTime(lead.created_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        {isAdmin ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => void handleViewLead(lead)}
                              disabled={leadActionDisabled()}
                              className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                            >
                              {leadActionLabel(lead.id, "Edit")}
                            </button>
                            <button
                              onClick={() => { setReassignLead(lead); setReassignUserId(lead.locked_by_id ? "unassign" : ""); }}
                              className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 min-w-[72px] text-center"
                              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                            >
                              {lead.locked_by_id ? "Reassign" : "Assign"}
                            </button>
                            {lead.status !== "Routed to Sales" && (
                              <button
                                onClick={() => void handleRouteLeadToSales(lead)}
                                disabled={leadActionDisabled()}
                                className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                                style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                              >
                                Route to Sales
                              </button>
                            )}
                          </div>
                        ) : lead.locked_by_id === userId ? (
                          <button
                            onClick={() => void handleWorkLead(lead)}
                            disabled={leadActionDisabled()}
                            className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          >
                            {leadActionLabel(lead.id, "View")}
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleWorkLead(lead)}
                            disabled={leadActionDisabled()}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                          >
                            {leadActionLabel(lead.id, "Claim")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile sort pill */}
          <div className="flex items-center justify-end lg:hidden">
            <button
              onClick={cycleMobileSort}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-muted)",
              }}
            >
              <ArrowUpDown className="h-3 w-3" />
              {mobileSortLabel}
            </button>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                  <div className="h-3 w-24 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                No leads found.
              </div>
            ) : (
              filtered.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                      {lead.customer?.company && (
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{lead.customer.company}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UrgencyPill urgency={lead.urgency} />
                      <StatusPill status={lead.status} />
                    </div>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <CreatedByMobileRow lead={lead} />
                    {lead.customer?.phone && (
                      <div className="flex justify-between"><span>Phone</span><span className="normal-case tracking-normal">{formatPhone(lead.customer.phone)}</span></div>
                    )}
                    <div className="flex justify-between"><span>Source</span><span className="normal-case tracking-normal">{(lead.source && (sourceLabels[lead.source] ?? lead.source)) || "—"}</span></div>
                    {productInterestsText(lead) !== "—" && (
                      <div className="flex justify-between gap-2">
                        <span className="shrink-0">Product Interests</span>
                        <span className="normal-case tracking-normal text-right truncate max-w-[200px]">{productInterestsText(lead)}</span>
                      </div>
                    )}
                    <div className="flex justify-between"><span>Created</span><span className="normal-case tracking-normal">{relativeTime(lead.created_at)}</span></div>
                    <div className="flex justify-between items-center">
                      <span>Owner</span>
                      {lead.locked_by_id ? (
                        <span className="normal-case tracking-normal" style={{ color: "var(--color-text-primary)" }}>
                          {lead.locked_by_id === userId
                            ? "You"
                            : (lead.locked_by as { full_name?: string | null } | undefined)?.full_name ?? "—"}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal"
                          style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
                        >
                          Unclaimed
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleViewLead(lead)}
                        disabled={leadActionDisabled()}
                        className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                      >
                        {leadActionLabel(lead.id, "Edit")}
                      </button>
                      <button
                        onClick={() => { setReassignLead(lead); setReassignUserId(lead.locked_by_id ? "unassign" : ""); }}
                        className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                      >
                        {lead.locked_by_id ? "Reassign" : "Assign"}
                      </button>
                    </div>
                  ) : lead.locked_by_id === userId ? (
                    <button
                      onClick={() => void handleWorkLead(lead)}
                      disabled={leadActionDisabled()}
                      className="w-full rounded-[6px] border py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      {leadActionLabel(lead.id, "View")}
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleWorkLead(lead)}
                      disabled={leadActionDisabled()}
                      className="w-full rounded-[6px] py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                    >
                      {leadActionLabel(lead.id, "Claim")}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Follow Up Later tab ── */}
      {activeTab === "follow_up" && (
        <>
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Created By", "Company", "Product Interests", "Reason", "Follow Up On", "Marked", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={8} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No leads scheduled for follow-up.
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className="transition-colors"
                      style={{
                        background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                    >
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</td>
                      <CreatedByTableCell lead={lead} />
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <ProductInterestsTableCell lead={lead} />
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{followUpReasonLabel(lead.follow_up_reason)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.follow_up_until ? new Date(lead.follow_up_until).toLocaleDateString("en-US") : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.follow_up_at ? relativeTime(lead.follow_up_at) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleResumeLead(lead)}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium"
                            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                          >
                            Resume
                          </button>
                          <button
                            onClick={() => void (isAdmin ? handleViewLead(lead) : handleWorkLead(lead))}
                            disabled={leadActionDisabled()}
                            className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          >
                            {leadActionLabel(lead.id, "View")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>No leads scheduled for follow-up.</div>
            ) : (
              filtered.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                    <StatusPill status="Follow Up Later" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <CreatedByMobileRow lead={lead} />
                    <ProductInterestsMobileRow lead={lead} />
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{followUpReasonLabel(lead.follow_up_reason)}</span></div>
                    <div className="flex justify-between"><span>Follow up on</span><span className="normal-case tracking-normal">{lead.follow_up_until ? new Date(lead.follow_up_until).toLocaleDateString("en-US") : "—"}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleResumeLead(lead)} className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium" style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}>Resume</button>
                    <button
                      onClick={() => void (isAdmin ? handleViewLead(lead) : handleWorkLead(lead))}
                      disabled={leadActionDisabled()}
                      className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      {leadActionLabel(lead.id, "View")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── On Hold tab ── */}
      {activeTab === "hold" && (
        <>
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Created By", "Company", "Product Interests", "Hold Reason", "Hold Until", "Held", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={8} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No leads on hold.
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className="transition-colors"
                      style={{
                        background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                    >
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</td>
                      <CreatedByTableCell lead={lead} />
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <ProductInterestsTableCell lead={lead} />
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{holdReasonLabel(lead.hold_reason)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.hold_until ? new Date(lead.hold_until).toLocaleDateString("en-US") : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.held_at ? relativeTime(lead.held_at) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleResumeLead(lead)}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium"
                            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                          >
                            Resume
                          </button>
                          <button
                            onClick={() => void (isAdmin ? handleViewLead(lead) : handleWorkLead(lead))}
                            disabled={leadActionDisabled()}
                            className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          >
                            {leadActionLabel(lead.id, "View")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: hold cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>No leads on hold.</div>
            ) : (
              filtered.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                    <StatusPill status="On Hold" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <CreatedByMobileRow lead={lead} />
                    <ProductInterestsMobileRow lead={lead} />
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{holdReasonLabel(lead.hold_reason)}</span></div>
                    <div className="flex justify-between"><span>Until</span><span className="normal-case tracking-normal">{lead.hold_until ? new Date(lead.hold_until).toLocaleDateString("en-US") : "—"}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleResumeLead(lead)} className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium" style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}>Resume</button>
                    <button
                      onClick={() => void (isAdmin ? handleViewLead(lead) : handleWorkLead(lead))}
                      disabled={leadActionDisabled()}
                      className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      {leadActionLabel(lead.id, "View")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Directed to Sales tab ── */}
      {activeTab === "routed" && (
        <>
          {/* Sub-filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {ROUTED_FILTER_OPTIONS.map((f) => {
              const count = routedSubCounts[f];
              const isActive = routedFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => selectRoutedFilter(f)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors"
                  style={{
                    background: isActive ? "var(--color-tab-active)" : "var(--color-surface)",
                    borderColor: isActive ? "var(--color-tab-active)" : "var(--color-border)",
                    color: isActive ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                  }}
                >
                  {ROUTED_FILTER_LABELS[f]}
                  {count > 0 && (
                    <span
                      className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                      style={{
                        background: isActive
                          ? "color-mix(in srgb, var(--color-btn-verify-text) 25%, transparent)"
                          : "color-mix(in srgb, var(--color-border) 60%, transparent)",
                        color: isActive ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Created By", "Company", "Product Interests", "Phone", "Stage", "Lead Status", "Sales Rep", "Updated"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={9} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {routedFilter === "all"
                        ? "No leads directed to sales."
                        : `No leads in ${ROUTED_FILTER_LABELS[routedFilter]}.`}
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className="cursor-pointer transition-colors"
                      style={{
                        background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                      onClick={() => { if (!leadActionDisabled()) void handleViewLead(lead); }}
                    >
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</td>
                      <CreatedByTableCell lead={lead} />
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5 max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
                        <span className="block truncate" title={productInterestsText(lead) !== "—" ? productInterestsText(lead) : undefined}>
                          {productInterestsText(lead)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.phone ? formatPhone(lead.customer.phone) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <RoutedStagePill lead={lead} />
                      </td>
                      <td className="px-3 py-2.5">
                        <RoutedLeadStatusCell lead={lead as RoutedLeadRow} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        {(lead.sales_owner as { full_name?: string | null } | undefined)?.full_name ? (
                          <span style={{ color: "var(--color-text-primary)" }}>
                            {(lead.sales_owner as { full_name?: string | null }).full_name}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
                          >
                            Unclaimed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>{relativeTime(lead.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: routed cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                {routedFilter === "all"
                  ? "No leads directed to sales."
                  : `No leads in ${ROUTED_FILTER_LABELS[routedFilter]}.`}
              </div>
            ) : (
              filtered.map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-[10px] border p-4 space-y-3 cursor-pointer"
                  style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
                  onClick={() => { if (!leadActionDisabled()) void handleViewLead(lead); }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                      {lead.customer?.company && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer.company}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <RoutedStagePill lead={lead} />
                      <RoutedLeadStatusCell lead={lead as RoutedLeadRow} />
                    </div>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <CreatedByMobileRow lead={lead} />
                    {lead.customer?.phone && (
                      <div className="flex justify-between"><span>Phone</span><span className="normal-case tracking-normal">{formatPhone(lead.customer.phone)}</span></div>
                    )}
                    {productInterestsText(lead) !== "—" && (
                      <div className="flex justify-between gap-2">
                        <span className="shrink-0">Product Interests</span>
                        <span className="normal-case tracking-normal text-right truncate max-w-[200px]">{productInterestsText(lead)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span>Sales Rep</span>
                      {(lead.sales_owner as { full_name?: string | null } | undefined)?.full_name ? (
                        <span className="normal-case tracking-normal" style={{ color: "var(--color-text-primary)" }}>
                          {(lead.sales_owner as { full_name?: string | null }).full_name}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal"
                          style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
                        >
                          Unclaimed
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between"><span>Updated</span><span className="normal-case tracking-normal">{relativeTime(lead.updated_at)}</span></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Rejected tab ── */}
      {activeTab === "rejected" && (
        <>
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Created By", "Company", "Product Interests", "Rejection Reason", "Rejected", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={7} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No rejected leads.</td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className="transition-colors"
                      style={{
                        background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                        opacity: 0.8,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                    >
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</td>
                      <CreatedByTableCell lead={lead} />
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <ProductInterestsTableCell lead={lead} />
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{lead.rejection_reason || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>{relativeTime(lead.updated_at)}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => void (isAdmin ? handleViewLead(lead) : handleWorkLead(lead))}
                          disabled={leadActionDisabled()}
                          className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                        >
                          {leadActionLabel(lead.id, "View")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: rejected cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>No rejected leads.</div>
            ) : (
              filtered.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3 opacity-75" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                    <StatusPill status="Rejected" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <CreatedByMobileRow lead={lead} />
                    <ProductInterestsMobileRow lead={lead} />
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{lead.rejection_reason || "—"}</span></div>
                  </div>
                  <button
                    onClick={() => void (isAdmin ? handleViewLead(lead) : handleWorkLead(lead))}
                    disabled={leadActionDisabled()}
                    className="w-full rounded-[6px] border py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                  >
                    {leadActionLabel(lead.id, "View")}
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Won tab ── */}
      {activeTab === "won" && (
        <LeadHistoryTable
          leads={filtered as LeadHistoryRow[]}
          sourceLabels={sourceLabels}
          emptyMessage="No won leads yet. Leads appear here when you route them to Sales and the linked order enters production."
          loading={loading}
          showTitle={false}
          borderRadius="12px"
          onLeadClick={(lead) => {
            if (!openingLeadId) {
              void (isAdmin ? handleViewLead : handleWorkLead)(lead as Lead);
            }
          }}
        />
      )}

      <ListPagination
        total={pagination.total}
        offset={offset}
        pageSize={pageSize}
        onOffsetChange={setOffset}
        onPageSizeChange={handlePageSizeChange}
        loading={loading}
      />

      {/* Add Lead Modal */}
      <AddLeadModal
        open={addOpen}
        lookups={lookups}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          window.dispatchEvent(new Event("bazaar:leads-changed"));
          window.dispatchEvent(new Event("bazaar:refresh-counts"));
        }}
        showToast={showToast}
      />

      {/* Verify Drawer */}
      {drawerLead && (
        <VerifyDrawer
          lead={drawerLead}
          lookups={lookups}
          readOnly={drawerReadOnly}
          lockedByName={drawerLockedBy}
          isAdmin={isAdmin}
          onClose={() => {
            setDrawerLead(null);
            setDrawerReadOnly(false);
          }}
          onLeadUpdated={(updated) => {
            if (activeTab === "routed") {
              setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
              return;
            }
            const tabConf = TAB_CONFIG.find((t) => t.id === activeTab);
            const tabStatus = tabConf?.status;
            const tabStatuses = tabConf?.statuses;
            const belongsToTab =
              tabStatus ? updated.status === tabStatus
              : tabStatuses ? tabStatuses.includes(updated.status)
              : true;
            if (!belongsToTab) {
              setLeads((prev) => prev.filter((l) => l.id !== updated.id));
            } else {
              setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
            }
          }}
          onLeadRemoved={(id) => {
            setLeads((prev) => prev.filter((l) => l.id !== id));
          }}
          showToast={showToast}
        />
      )}

      {/* Reassign / Assign modal (admin only) */}
      <Dialog open={!!reassignLead} onOpenChange={(o) => { if (!o) setReassignLead(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{reassignLead?.locked_by_id ? "Reassign Lead" : "Assign Lead"}</DialogTitle>
          </DialogHeader>
          {reassignLead && (
            <div className="space-y-4 pt-1">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {displayContactName(reassignLead.customer, { preferPerson: true })}
              </p>
              <div>
                <label
                  className="block text-[11px] font-medium uppercase tracking-[0.06em] mb-1.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {reassignLead.locked_by_id ? "Reassign to SDR" : "Assign to SDR"}
                </label>
                <Select value={reassignUserId} onValueChange={(v) => setReassignUserId(v ?? "")}>
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue placeholder="Select an SDR…">
                      {reassignUserId === "unassign"
                        ? "— Unassign (remove from SDR)"
                        : sdrList.find((s) => s.id === reassignUserId)?.full_name ?? "Select an SDR…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {reassignLead.locked_by_id && (
                      <SelectItem value="unassign">— Unassign (remove from SDR)</SelectItem>
                    )}
                    {sdrList.map((sdr) => (
                      <SelectItem key={sdr.id} value={sdr.id}>
                        {sdr.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setReassignLead(null)} disabled={reassigning}>
                  Cancel
                </Button>
                <Button onClick={handleReassign} disabled={reassigning || !reassignUserId}>
                  {reassigning ? "Saving…" : "Confirm"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <ToastBanner
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      <RouteToSalesModal
        open={!!routeModalLead}
        onClose={() => setRouteModalLead(null)}
        onConfirm={(salesOwnerId) => void confirmRouteLeadToSales(salesOwnerId)}
        saving={routeModalSaving}
      />
    </div>
  );
}
