"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { useListPageData } from "@/hooks/use-list-page-data";
import { ListRefreshingNotice } from "@/components/ui/mobile-list-card";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { UrgencyPill } from "@/components/ui/urgency-pill";

const SalesDrawer = dynamic(
  () => import("@/components/sales/sales-drawer").then((m) => ({ default: m.SalesDrawer })),
  { ssr: false, loading: () => null },
);
import { Lead, LookupMap } from "@/lib/types";
import { holdReasonLabel } from "@/lib/constants/hold-reasons";
import { followUpReasonLabel } from "@/lib/constants/follow-up-reasons";
import { rejectReasonLabel } from "@/lib/constants/reject-reasons";
import { formatPhone } from "@/lib/utils/phone";
import { formatTimeTodayOrDateNumeric, displayContactName } from "@/lib/utils/format";
import { ToastBanner } from "@/components/ui/toast-banner";
import { fetchLeadById } from "@/lib/utils/fetch-lead";
import { formatLeadProductInterests } from "@/lib/utils/format-lead-product-interests";
import { createClient } from "@/lib/supabase/client";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  type ListPageSize,
  type PaginationMeta,
} from "@/lib/utils/pagination";
import { useStoredListPageSize } from "@/hooks/use-stored-list-page-size";
import { AdminUserFilter } from "@/components/ui/admin-user-filter";
import { appendAdminFilterUserId } from "@/lib/utils/admin-user-filter";
import { isSalesAdminFilterTab } from "@/lib/utils/lead-sales-scoped-tab";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "pipeline" | "claimed" | "in_progress" | "follow_up" | "hold" | "rejected";

type WorklistTab = "pipeline" | "claimed" | "in_progress";

const WORKLIST_TABS: WorklistTab[] = ["pipeline", "claimed", "in_progress"];

function isWorklistTab(tab: Tab): tab is WorklistTab {
  return (WORKLIST_TABS as readonly string[]).includes(tab);
}

interface Toast {
  message: string;
  type: "success" | "error";
}

function routedAtLabel(lead: Lead): string {
  return formatTimeTodayOrDateNumeric(lead.routed_at ?? lead.updated_at);
}

function inProgressAtLabel(lead: Lead): string {
  return formatTimeTodayOrDateNumeric(lead.in_progress_at ?? lead.updated_at);
}

function worklistMilestoneHeader(tab: WorklistTab): string {
  return tab === "in_progress" ? "In Progress" : "Routed";
}

function worklistMilestoneLabel(lead: Lead, tab: WorklistTab): string {
  return tab === "in_progress" ? inProgressAtLabel(lead) : routedAtLabel(lead);
}

function createdAtLabel(lead: Lead): string {
  return formatTimeTodayOrDateNumeric(lead.created_at);
}

function followUpSentLabel(lead: Lead): string {
  return lead.follow_up_at ? formatTimeTodayOrDateNumeric(lead.follow_up_at) : "—";
}

function holdSentLabel(lead: Lead): string {
  return lead.held_at ? formatTimeTodayOrDateNumeric(lead.held_at) : "—";
}

function rejectedAtLabel(lead: Lead): string {
  return formatTimeTodayOrDateNumeric(lead.updated_at);
}
// ─── Table skeleton — see components/ui/table-skeleton.tsx ───────────────────

// ─── Main Component ──────────────────────────────────────────────────────────

export function SalesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");
  const [leads, setLeads] = useState<Lead[]>([]);
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerReadOnly, setDrawerReadOnly] = useState(false);
  const [drawerLockedBy, setDrawerLockedBy] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [tabCounts, setTabCounts] = useState<{
    pipeline: number;
    claimed: number;
    in_progress: number;
    follow_up: number;
    hold: number;
    rejected: number;
  } | null>(null);
  const [salesUserList, setSalesUserList] = useState<{ id: string; full_name: string }[]>([]);
  const [reassignLead, setReassignLead] = useState<Lead | null>(null);
  const [reassignSalesUserId, setReassignSalesUserId] = useState<string>("unassign");
  const [reassignKeyAccount, setReassignKeyAccount] = useState<{ id: string; full_name: string | null } | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [lookups, setLookups] = useState<LookupMap>({});
  const lookupsLoadedRef = useRef(false);

  // Load dropdown options when drawer or reassign modal opens (once)
  useEffect(() => {
    if (!drawerLead && !reassignLead) return;
    if (lookupsLoadedRef.current) return;
    lookupsLoadedRef.current = true;
    fetch("/api/lookups?categories=source,industry,urgency,hold_reason,follow_up_reason,reject_reason,route_reason,sales_drop_reason")
      .then((r) => r.json())
      .then((d) => setLookups(d))
      .catch(() => {
        lookupsLoadedRef.current = false;
      });
  }, [drawerLead, reassignLead]);

  // Get current userId and role for ownership display and admin view access
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
        setIsAdmin(roleName === "admin");
      }
    });
  }, []);

  // Fetch active Sales user list when admin opens reassign modal
  useEffect(() => {
    if (!isAdmin || !reassignLead) return;
    if (salesUserList.length > 0) return;
    fetch("/api/admin/users?role=sales")
      .then((r) => r.json())
      .then((d) => setSalesUserList(d.users ?? []));
  }, [isAdmin, reassignLead, salesUserList.length]);

  useEffect(() => {
    if (!isAdmin || !reassignLead?.customer_id) {
      setReassignKeyAccount(null);
      return;
    }
    fetch(`/api/leads/sales-users?customer_id=${encodeURIComponent(reassignLead.customer_id)}`)
      .then((r) => r.json())
      .then((d) => setReassignKeyAccount(d.key_account ?? null))
      .catch(() => setReassignKeyAccount(null));
  }, [isAdmin, reassignLead?.id, reassignLead?.customer_id]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [activeTab, debouncedSearch, pageSize, filterUserId]);

  const showAdminFilters = isAdmin && isSalesAdminFilterTab(activeTab);
  const showSearch = !isSalesAdminFilterTab(activeTab) || isAdmin;

  const pageDataUrl = useMemo(() => {
    const params = new URLSearchParams({
      tab: activeTab,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (showSearch && debouncedSearch) params.set("search", debouncedSearch);
    if (showAdminFilters) {
      appendAdminFilterUserId(params, "admin", filterUserId);
    }
    return `/api/leads/sales/page-data?${params}`;
  }, [activeTab, debouncedSearch, filterUserId, offset, pageSize, showAdminFilters, showSearch]);

  const { data: pageData, loading, refreshing, refresh: refreshPageData } = useListPageData<{
    leads?: Lead[];
    counts?: Record<string, number>;
    pagination?: PaginationMeta;
  }>({
    prefix: "sales",
    url: pageDataUrl,
    events: ["bazaar:leads-changed", "bazaar:refresh-counts"],
    enabled: !drawerLead,
  });

  useEffect(() => {
    if (!pageData) {
      setLeads([]);
      return;
    }
    if (Array.isArray(pageData.leads)) setLeads(pageData.leads);
    if (pageData.counts) {
      setTabCounts({
        pipeline: pageData.counts.pipeline ?? 0,
        claimed: pageData.counts.claimed ?? 0,
        in_progress: pageData.counts.in_progress ?? 0,
        follow_up: pageData.counts.follow_up ?? 0,
        hold: pageData.counts.hold ?? 0,
        rejected: pageData.counts.rejected ?? 0,
      });
    }
    if (pageData.pagination) {
      setPagination(pageData.pagination);
      if (pageData.pagination.total > 0 && offset >= pageData.pagination.total) {
        setOffset(0);
      }
    }
  }, [pageData, offset]);

  // Defer refresh while drawer is open; run when drawer closes
  const pendingLeadsRefresh = useRef(false);

  useEffect(() => {
    if (drawerLead) {
      pendingLeadsRefresh.current = true;
      return;
    }
    if (pendingLeadsRefresh.current) {
      pendingLeadsRefresh.current = false;
      void refreshPageData(true);
    }
  }, [drawerLead, refreshPageData]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  async function handleSalesReassign() {
    if (!reassignLead) return;
    setReassigning(true);
    const newUser = reassignSalesUserId === "unassign" ? null : reassignSalesUserId;
    const res = await fetch(`/api/leads/${reassignLead.id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: newUser, role: "sales" }),
    });
    const data = await res.json();
    setReassigning(false);
    if (!res.ok) { showToast(data.error ?? "Failed to reassign.", "error"); return; }
    setLeads((prev) => prev.map((l) => l.id === data.lead.id ? data.lead : l));
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
    setReassignLead(null);
    showToast(newUser ? "Sales rep reassigned." : "Sales rep unassigned.");
  }

  const isLoading = loading;

  function handlePageSizeChange(size: ListPageSize) {
    setPageSize(size);
    setOffset(0);
  }

  function selectTab(next: Tab) {
    setActiveTab(next);
    setOffset(0);
  }

  const emptyMessage = debouncedSearch.trim()
    ? "No leads match your search."
    : activeTab === "pipeline"
      ? "No unclaimed leads in pipeline."
      : activeTab === "claimed"
        ? "No claimed leads."
        : activeTab === "in_progress"
          ? "No leads in progress."
          : activeTab === "follow_up"
              ? "No follow-up leads."
              : activeTab === "hold"
                ? "No leads on hold."
                : "No rejected leads.";

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleClaim(lead: Lead) {
    setClaimingId(lead.id);
    const res = await fetch(`/api/leads/${lead.id}/claim`, { method: "POST" });
    const data = await res.json();
    setClaimingId(null);
    if (!res.ok) {
      showToast(data.error ?? "Failed to claim.", "error");
      return;
    }
    setLeads((prev) =>
      activeTab === "pipeline" ? prev.filter((l) => l.id !== lead.id) : prev.map((l) => (l.id === lead.id ? data.lead : l)),
    );
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
    showToast("Lead claimed.");
    // Open the modal immediately after claiming — assignment is already persisted in DB
    await handleOpenLead(data.lead);
  }

  async function handleOpenLead(lead: Lead) {
    const full = (await fetchLeadById(lead.id)) ?? lead;

    // Claim already set sales_owner_id — other reps do not see this row. No session lock needed.
    if (lead.sales_owner_id && lead.sales_owner_id === userId) {
      setDrawerLead(full);
      setDrawerReadOnly(false);
      setDrawerLockedBy(null);
      return;
    }

    // Edge case (stale list / reassigned row): temp lock for read-only banner if another user holds it
    const res = await fetch(`/api/leads/${lead.id}/lock`, { method: "POST" });
    const data = await res.json();

    if (res.status === 409) {
      setDrawerLead(full);
      setDrawerReadOnly(true);
      setDrawerLockedBy(data.locked_by?.full_name ?? "Another user");
    } else {
      setDrawerLead(full);
      setDrawerReadOnly(false);
      setDrawerLockedBy(null);
    }
  }

  async function handleViewLead(lead: Lead) {
    const full = (await fetchLeadById(lead.id)) ?? lead;
    setDrawerLead(full);
    setDrawerReadOnly(true);
    setDrawerLockedBy(null);
  }

  async function handleResume(lead: Lead) {
    setResumingId(lead.id);
    const res = await fetch(`/api/leads/${lead.id}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "sales" }),
    });
    const data = await res.json();
    setResumingId(null);
    if (!res.ok) { showToast(data.error ?? "Failed to resume.", "error"); return; }
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
    showToast("Lead resumed.");
  }

  function handleRefresh() {
    void refreshPageData(false);
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
  }

  // ── Drawer callbacks ──────────────────────────────────────────────────────

  function handleLeadUpdated(updated: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function handleLeadRemoved(leadId: string) {
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "pipeline", label: "Pipeline", count: tabCounts?.pipeline ?? 0 },
    { id: "claimed", label: "Claimed", count: tabCounts?.claimed ?? 0 },
    { id: "in_progress", label: "In Progress", count: tabCounts?.in_progress ?? 0 },
    { id: "follow_up", label: "Follow Up Later", count: tabCounts?.follow_up ?? 0 },
    { id: "hold", label: "On Hold", count: tabCounts?.hold ?? 0 },
    { id: "rejected", label: "Rejected", count: tabCounts?.rejected ?? 0 },
  ];

  function ownerLabel(lead: Lead): string {
    if (!lead.sales_owner_id) return "Unclaimed";
    if (lead.sales_owner_id === userId) return "You";
    return lead.sales_owner?.full_name ?? "Claimed";
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Sales Pipeline
        </h1>
      </div>

      {/* Tab bar + Search + Refresh — same row on desktop */}
      <div
        className="flex flex-col gap-2 lg:flex-row lg:items-center border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {/* Tabs */}
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
              {tab.count > 0 && (
                <span
                  className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                  style={{
                    background: activeTab === tab.id ? "var(--color-badge-bg)" : "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
                    color: "var(--color-badge-text)",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {showSearch && (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center pb-2 lg:pb-0 w-full lg:w-auto lg:shrink-0">
            <div className="relative w-full lg:w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, email, company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm w-full"
              />
            </div>

            {showAdminFilters && (
              <AdminUserFilter
                value={filterUserId}
                onChange={setFilterUserId}
                className="rounded-[6px] border px-3 py-2 text-[13px] font-medium outline-none h-8 w-full lg:w-auto"
              />
            )}

            <ListRefreshingNotice refreshing={refreshing} />
          </div>
        )}
        {!showSearch && (
          <div className="flex items-center pb-2 lg:pb-0">
            <ListRefreshingNotice refreshing={refreshing} />
          </div>
        )}
      </div>

      {/* ── Pipeline / Claimed / In Progress tabs ── */}
      {isWorklistTab(activeTab) && (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Company", "Product Interests", "Phone", "Sales Status", "Urgency", "Owner", "Created", worklistMilestoneHeader(activeTab), "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={10} />
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => (
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
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.company || "—"}
                      </td>
                      <td className="px-3 py-2.5 max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
                        {(() => {
                          const products = formatLeadProductInterests(lead.interests, lead.quantities);
                          return (
                            <span className="block truncate" title={products !== "—" ? products : undefined}>
                              {products}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.phone ? formatPhone(lead.customer.phone) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {lead.sales_status ? <StatusPill status={lead.sales_status} /> : <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <UrgencyPill urgency={lead.urgency} />
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {ownerLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {createdAtLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {worklistMilestoneLabel(lead, activeTab)}
                      </td>
                      <td className="px-3 py-2.5">
                        {isAdmin ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleViewLead(lead)}
                              className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                            >
                              View
                            </button>
                            <button
                              onClick={() => { setReassignLead(lead); setReassignSalesUserId(lead.sales_owner_id ?? "unassign"); }}
                              className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                            >
                              Reassign
                            </button>
                          </div>
                        ) : activeTab === "pipeline" ? (
                          <button
                            onClick={() => handleClaim(lead)}
                            disabled={claimingId === lead.id}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97] disabled:opacity-50"
                            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                          >
                            {claimingId === lead.id ? "…" : "Claim"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenLead(lead)}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                          >
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
            ) : leads.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                {emptyMessage}
              </div>
            ) : (
              leads.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                      {lead.customer?.company && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer.company}</p>
                      )}
                    </div>
                    {lead.sales_status && <StatusPill status={lead.sales_status} />}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    {lead.customer?.phone && (
                      <div className="flex justify-between"><span>Phone</span><span className="normal-case tracking-normal">{formatPhone(lead.customer.phone)}</span></div>
                    )}
                    {formatLeadProductInterests(lead.interests, lead.quantities) !== "—" && (
                      <div className="flex justify-between gap-2">
                        <span className="shrink-0">Product Interests</span>
                        <span className="normal-case tracking-normal text-right truncate max-w-[200px]">{formatLeadProductInterests(lead.interests, lead.quantities)}</span>
                      </div>
                    )}
                    <div className="flex justify-between"><span>Owner</span><span className="normal-case tracking-normal">{ownerLabel(lead)}</span></div>
                    <div className="flex justify-between"><span>Created</span><span className="normal-case tracking-normal">{createdAtLabel(lead)}</span></div>
                    <div className="flex justify-between"><span>{worklistMilestoneHeader(activeTab)}</span><span className="normal-case tracking-normal">{worklistMilestoneLabel(lead, activeTab)}</span></div>
                  </div>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewLead(lead)}
                        className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => { setReassignLead(lead); setReassignSalesUserId(lead.sales_owner_id ?? "unassign"); }}
                        className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                      >
                        Reassign
                      </button>
                    </div>
                  ) : activeTab === "pipeline" ? (
                    <button
                      onClick={() => handleClaim(lead)}
                      disabled={claimingId === lead.id}
                      className="w-full rounded-[6px] py-1.5 text-[13px] font-medium disabled:opacity-50"
                      style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                    >
                      {claimingId === lead.id ? "Claiming…" : "Claim"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenLead(lead)}
                      className="w-full rounded-[6px] py-1.5 text-[13px] font-medium"
                      style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                    >
                      Open
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
                  {["Name", "Company", "Product Interests", "Reason", "Follow Up On", "Created", "Sent to Follow Up", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={8} />
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No leads scheduled for follow-up.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => (
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
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5 max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
                        {(() => {
                          const products = formatLeadProductInterests(lead.interests, lead.quantities);
                          return (
                            <span className="block truncate" title={products !== "—" ? products : undefined}>
                              {products}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{followUpReasonLabel(lead.follow_up_reason)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.follow_up_until ? new Date(lead.follow_up_until).toLocaleDateString("en-US") : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {createdAtLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {followUpSentLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleResume(lead)}
                            disabled={resumingId === lead.id}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium disabled:opacity-50"
                            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                          >
                            {resumingId === lead.id ? "…" : "Resume"}
                          </button>
                          <button
                            onClick={() => handleOpenLead(lead)}
                            className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          >
                            Open
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
            ) : leads.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                No leads scheduled for follow-up.
              </div>
            ) : (
              leads.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                    <StatusPill status="Follow Up Later" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{followUpReasonLabel(lead.follow_up_reason)}</span></div>
                    {formatLeadProductInterests(lead.interests, lead.quantities) !== "—" && (
                      <div className="flex justify-between gap-2">
                        <span className="shrink-0">Product Interests</span>
                        <span className="normal-case tracking-normal text-right truncate max-w-[200px]">{formatLeadProductInterests(lead.interests, lead.quantities)}</span>
                      </div>
                    )}
                    <div className="flex justify-between"><span>Follow up on</span><span className="normal-case tracking-normal">{lead.follow_up_until ? new Date(lead.follow_up_until).toLocaleDateString("en-US") : "—"}</span></div>
                    <div className="flex justify-between"><span>Created</span><span className="normal-case tracking-normal">{createdAtLabel(lead)}</span></div>
                    <div className="flex justify-between"><span>Sent to Follow Up</span><span className="normal-case tracking-normal">{followUpSentLabel(lead)}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResume(lead)}
                      disabled={resumingId === lead.id}
                      className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium disabled:opacity-50"
                      style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                    >
                      {resumingId === lead.id ? "Resuming…" : "Resume"}
                    </button>
                    <button onClick={() => handleOpenLead(lead)} className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                      Open
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
                  {["Name", "Company", "Product Interests", "Hold Reason", "Hold Until", "Created", "Sent to Hold", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowsSkeleton cols={8} />
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No leads on hold.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => (
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
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5 max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
                        {(() => {
                          const products = formatLeadProductInterests(lead.interests, lead.quantities);
                          return (
                            <span className="block truncate" title={products !== "—" ? products : undefined}>
                              {products}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{holdReasonLabel(lead.hold_reason)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.hold_until ? new Date(lead.hold_until).toLocaleDateString("en-US") : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {createdAtLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {holdSentLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleResume(lead)}
                            disabled={resumingId === lead.id}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium disabled:opacity-50"
                            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                          >
                            {resumingId === lead.id ? "…" : "Resume"}
                          </button>
                          <button
                            onClick={() => handleOpenLead(lead)}
                            className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          >
                            Open
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
            ) : leads.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                No leads on hold.
              </div>
            ) : (
              leads.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                    <StatusPill status="On Hold" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{holdReasonLabel(lead.hold_reason)}</span></div>
                    {formatLeadProductInterests(lead.interests, lead.quantities) !== "—" && (
                      <div className="flex justify-between gap-2">
                        <span className="shrink-0">Product Interests</span>
                        <span className="normal-case tracking-normal text-right truncate max-w-[200px]">{formatLeadProductInterests(lead.interests, lead.quantities)}</span>
                      </div>
                    )}
                    <div className="flex justify-between"><span>Until</span><span className="normal-case tracking-normal">{lead.hold_until ? new Date(lead.hold_until).toLocaleDateString("en-US") : "—"}</span></div>
                    <div className="flex justify-between"><span>Created</span><span className="normal-case tracking-normal">{createdAtLabel(lead)}</span></div>
                    <div className="flex justify-between"><span>Sent to Hold</span><span className="normal-case tracking-normal">{holdSentLabel(lead)}</span></div>
                    <div className="flex justify-between"><span>Company</span><span className="normal-case tracking-normal">{lead.customer?.company || "—"}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResume(lead)}
                      disabled={resumingId === lead.id}
                      className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium disabled:opacity-50"
                      style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                    >
                      {resumingId === lead.id ? "Resuming…" : "Resume"}
                    </button>
                    <button
                      onClick={() => handleOpenLead(lead)}
                      className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      Open
                    </button>
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
                  {["Name", "Company", "Product Interests", "Phone", "Rejection Reason", "Created", "Sent to Rejected", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableRowsSkeleton cols={8} />
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No rejected leads.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => (
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
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5 max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
                        {(() => {
                          const products = formatLeadProductInterests(lead.interests, lead.quantities);
                          return (
                            <span className="block truncate" title={products !== "—" ? products : undefined}>
                              {products}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.phone ? formatPhone(lead.customer.phone) : "—"}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>
                        {rejectReasonLabel(lead.rejection_reason)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {createdAtLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {rejectedAtLabel(lead)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleViewLead(lead)}
                          className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                        >
                          View
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
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : leads.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                No rejected leads.
              </div>
            ) : (
              leads.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayContactName(lead.customer, { preferPerson: true })}</p>
                    <StatusPill status="Rejected" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <div className="flex justify-between"><span>Company</span><span className="normal-case tracking-normal">{lead.customer?.company || "—"}</span></div>
                    {formatLeadProductInterests(lead.interests, lead.quantities) !== "—" && (
                      <div className="flex justify-between gap-2">
                        <span className="shrink-0">Product Interests</span>
                        <span className="normal-case tracking-normal text-right truncate max-w-[200px]">{formatLeadProductInterests(lead.interests, lead.quantities)}</span>
                      </div>
                    )}
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{rejectReasonLabel(lead.rejection_reason)}</span></div>
                    <div className="flex justify-between"><span>Created</span><span className="normal-case tracking-normal">{createdAtLabel(lead)}</span></div>
                    <div className="flex justify-between"><span>Sent to Rejected</span><span className="normal-case tracking-normal">{rejectedAtLabel(lead)}</span></div>
                  </div>
                  <button
                    onClick={() => handleViewLead(lead)}
                    className="w-full rounded-[6px] border py-1.5 text-[13px] font-medium"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    View
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <ListPagination
        total={pagination.total}
        offset={offset}
        pageSize={pageSize}
        onOffsetChange={setOffset}
        onPageSizeChange={handlePageSizeChange}
        loading={loading}
      />

      {/* Reassign modal (admin only) */}
      <Dialog open={!!reassignLead} onOpenChange={(o) => { if (!o) { setReassignLead(null); setReassignKeyAccount(null); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reassign Sales Lead</DialogTitle>
          </DialogHeader>
          {reassignLead && (
            <div className="space-y-4 pt-1">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {displayContactName(reassignLead.customer, { preferPerson: true })}
                {reassignLead.customer?.company ? ` — ${reassignLead.customer.company}` : ""}
              </p>
              {reassignKeyAccount && (
                <div
                  className="flex gap-2 rounded-[8px] border px-3 py-2.5 text-[12px]"
                  style={{
                    background: "var(--color-info-bg)",
                    borderColor: "var(--color-info-border)",
                    color: "var(--color-info-text-deep)",
                  }}
                >
                  <p>
                    This customer has a Key Account assigned to{" "}
                    <strong>{reassignKeyAccount.full_name ?? "Unnamed"}</strong>.
                  </p>
                </div>
              )}
              <div>
                <label
                  className="block text-[11px] font-medium uppercase tracking-[0.06em] mb-1.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Assign to Sales Rep
                </label>
                <Select value={reassignSalesUserId} onValueChange={(v) => setReassignSalesUserId(v ?? "unassign")}>
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue placeholder="Select Sales rep…">
                      {reassignSalesUserId === "unassign"
                        ? "— Unassign (remove from Sales rep)"
                        : salesUserList.find((u) => u.id === reassignSalesUserId)?.full_name
                          ?? reassignLead.sales_owner?.full_name
                          ?? "Select Sales rep…"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassign">— Unassign (remove from Sales rep)</SelectItem>
                    {salesUserList.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setReassignLead(null)} disabled={reassigning}>
                  Cancel
                </Button>
                <Button onClick={handleSalesReassign} disabled={reassigning}>
                  {reassigning ? "Saving…" : "Confirm"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sales Drawer */}
      {drawerLead && (
        <SalesDrawer
          lead={drawerLead}
          lookups={lookups}
          readOnly={drawerReadOnly}
          lockedByName={drawerLockedBy}
          currentUserId={userId}
          isAdmin={isAdmin}
          onClose={() => {
            setDrawerLead(null);
            setDrawerReadOnly(false);
            setDrawerLockedBy(null);
          }}
          onLeadUpdated={handleLeadUpdated}
          onLeadRemoved={handleLeadRemoved}
          showToast={showToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <ToastBanner
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
