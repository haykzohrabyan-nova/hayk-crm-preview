"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { UrgencyPill } from "@/components/ui/urgency-pill";
import { SalesDrawer } from "@/components/sales-drawer";
import { Lead } from "@/lib/types";
import { formatPhone } from "@/lib/utils/phone";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "pipeline" | "hold" | "rejected";

interface Toast {
  message: string;
  type: "success" | "error";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

function leadName(lead: Lead): string {
  const c = lead.customer;
  const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
  return name || "—";
}

function matchesSearch(lead: Lead, q: string): boolean {
  const c = lead.customer;
  return (
    c?.first_name?.toLowerCase().includes(q) ||
    c?.last_name?.toLowerCase().includes(q) ||
    c?.email?.toLowerCase().includes(q) ||
    (c?.phone?.includes(q) ?? false) ||
    c?.company?.toLowerCase().includes(q) ||
    false
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function ToastBanner({ message, type, onDismiss }: Toast & { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex min-w-[260px] items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        borderLeftWidth: 4,
        borderLeftColor: type === "success" ? "var(--color-success)" : "var(--color-danger)",
        color: "var(--color-text-primary)",
      }}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} style={{ color: "var(--color-text-muted)" }}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Table skeleton ───────────────────────────────────────────────────────────

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr
          key={i}
          style={{
            background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
            borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
          }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-3">
              <div
                className="h-3.5 animate-pulse rounded"
                style={{ background: "var(--color-border)", width: j === 0 ? "60%" : j === cols - 1 ? "40%" : "80%" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SalesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");
  const [routedLeads, setRoutedLeads] = useState<Lead[]>([]);
  const [rejectedLeads, setRejectedLeads] = useState<Lead[]>([]);
  const [rejectedFetched, setRejectedFetched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejLoading, setRejLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerReadOnly, setDrawerReadOnly] = useState(false);
  const [drawerLockedBy, setDrawerLockedBy] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [tabCounts, setTabCounts] = useState<{ pipeline: number; hold: number; rejected: number } | null>(null);

  // Get current userId for ownership display
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Fetch tab counts upfront so all badges are visible before clicking
  function fetchTabCounts() {
    fetch("/api/leads/sales-counts")
      .then((r) => r.json())
      .then((d) => { if (d.counts) setTabCounts(d.counts); })
      .catch(() => {});
  }

  useEffect(() => {
    fetchTabCounts();
    window.addEventListener("bazaar:refresh-counts", fetchTabCounts);
    return () => window.removeEventListener("bazaar:refresh-counts", fetchTabCounts);
  }, []);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  // ── Fetch routed leads ────────────────────────────────────────────────────

  const fetchRoutedLeads = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leads/workspace?status=Routed+to+Sales");
    const data = await res.json();
    setRoutedLeads(data.leads ?? []);
    setLoading(false);
  }, []);

  const fetchRejectedLeads = useCallback(async () => {
    setRejLoading(true);
    const res = await fetch("/api/leads/workspace?status=Rejected");
    const data = await res.json();
    setRejectedLeads(data.leads ?? []);
    setRejLoading(false);
    setRejectedFetched(true);
  }, []);

  useEffect(() => {
    fetchRoutedLeads();
  }, [fetchRoutedLeads]);

  // Lazy-fetch rejected leads when that tab is first opened
  useEffect(() => {
    if (activeTab === "rejected" && !rejectedFetched) {
      fetchRejectedLeads();
    }
  }, [activeTab, rejectedFetched, fetchRejectedLeads]);

  // ── Derived lists per tab ─────────────────────────────────────────────────

  const q = search.toLowerCase();

  const pipelineLeads = routedLeads
    .filter((l) => l.sales_status === "Ongoing" || l.sales_status === "Quote Sent" || l.sales_status === null)
    .filter((l) => !q || matchesSearch(l, q));

  const holdLeads = routedLeads
    .filter((l) => l.sales_status === "On Hold")
    .filter((l) => !q || matchesSearch(l, q));

  const rejLeads = rejectedLeads.filter((l) => !q || matchesSearch(l, q));

  const activeLeads = activeTab === "pipeline" ? pipelineLeads : activeTab === "hold" ? holdLeads : rejLeads;
  const isLoading = activeTab === "rejected" ? rejLoading : loading;

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
    setRoutedLeads((prev) => prev.map((l) => (l.id === lead.id ? data.lead : l)));
    showToast("Lead claimed.");
  }

  async function handleOpenLead(lead: Lead) {
    const res = await fetch(`/api/leads/${lead.id}/lock`, { method: "POST" });
    const data = await res.json();
    if (res.status === 409) {
      setDrawerLead(lead);
      setDrawerReadOnly(true);
      setDrawerLockedBy(data.locked_by?.full_name ?? "Another user");
    } else {
      setDrawerLead(lead);
      setDrawerReadOnly(false);
      setDrawerLockedBy(null);
    }
  }

  async function handleViewLead(lead: Lead) {
    // View rejected leads — no locking needed
    setDrawerLead(lead);
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
    setRoutedLeads((prev) => prev.map((l) => (l.id === lead.id ? data.lead : l)));
    showToast("Lead resumed.");
  }

  function handleRefresh() {
    fetchRoutedLeads();
    fetchTabCounts();
    if (activeTab === "rejected") {
      setRejectedFetched(false);
      fetchRejectedLeads();
    }
  }

  // ── Drawer callbacks ──────────────────────────────────────────────────────

  function handleLeadUpdated(updated: Lead) {
    setRoutedLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setRejectedLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function handleLeadRemoved(leadId: string) {
    setRoutedLeads((prev) => prev.filter((l) => l.id !== leadId));
    setRejectedLeads((prev) => prev.filter((l) => l.id !== leadId));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "pipeline", label: "Pipeline", count: tabCounts?.pipeline ?? pipelineLeads.length },
    { id: "hold", label: "On Hold", count: tabCounts?.hold ?? holdLeads.length },
    { id: "rejected", label: "Rejected (SDR)", count: tabCounts?.rejected ?? rejLeads.length },
  ];

  function ownerLabel(lead: Lead): string {
    if (!lead.sales_owner_id) return "Unclaimed";
    if (lead.sales_owner_id === userId) return "You";
    return "Claimed";
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Sales Pipeline
        </h1>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b" style={{ borderColor: "var(--color-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="whitespace-nowrap px-4 py-2.5 text-[13px] font-medium transition-colors"
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

      {/* Search + Refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1" style={{ maxWidth: 320 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, email, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Pipeline tab ── */}
      {activeTab === "pipeline" && (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Company", "Phone", "Sales Status", "Urgency", "Owner", "Routed", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton cols={8} />
                ) : pipelineLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No leads in pipeline.
                    </td>
                  </tr>
                ) : (
                  pipelineLeads.map((lead, idx) => (
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
                        {leadName(lead)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.company || "—"}
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
                        {relativeTime(lead.updated_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        {!lead.sales_owner_id ? (
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
          <div className="flex flex-col gap-3 sm:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                  <div className="h-3 w-24 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : pipelineLeads.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                No leads in pipeline.
              </div>
            ) : (
              pipelineLeads.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{leadName(lead)}</p>
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
                    <div className="flex justify-between"><span>Owner</span><span className="normal-case tracking-normal">{ownerLabel(lead)}</span></div>
                    <div className="flex justify-between"><span>Routed</span><span className="normal-case tracking-normal">{relativeTime(lead.updated_at)}</span></div>
                  </div>
                  {!lead.sales_owner_id ? (
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

      {/* ── On Hold tab ── */}
      {activeTab === "hold" && (
        <>
          <div className="hidden sm:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Company", "Hold Reason", "Hold Until", "Held", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton cols={6} />
                ) : holdLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No leads on hold.
                    </td>
                  </tr>
                ) : (
                  holdLeads.map((lead, idx) => (
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
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{leadName(lead)}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.hold_reason || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.hold_until ? new Date(lead.hold_until).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.held_at ? relativeTime(lead.held_at) : "—"}
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
          <div className="flex flex-col gap-3 sm:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : holdLeads.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                No leads on hold.
              </div>
            ) : (
              holdLeads.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{leadName(lead)}</p>
                    <StatusPill status="On Hold" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{lead.hold_reason || "—"}</span></div>
                    <div className="flex justify-between"><span>Until</span><span className="normal-case tracking-normal">{lead.hold_until ? new Date(lead.hold_until).toLocaleDateString() : "—"}</span></div>
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
          <div className="hidden sm:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Company", "Phone", "Rejection Reason", "Rejected", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rejLoading ? (
                  <TableSkeleton cols={6} />
                ) : rejLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No rejected leads.
                    </td>
                  </tr>
                ) : (
                  rejLeads.map((lead, idx) => (
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
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>{leadName(lead)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.phone ? formatPhone(lead.customer.phone) : "—"}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>
                        {lead.rejection_reason || "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {relativeTime(lead.updated_at)}
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
          <div className="flex flex-col gap-3 sm:hidden">
            {rejLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              ))
            ) : rejLeads.length === 0 ? (
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                No rejected leads.
              </div>
            ) : (
              rejLeads.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{leadName(lead)}</p>
                    <StatusPill status="Rejected" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <div className="flex justify-between"><span>Company</span><span className="normal-case tracking-normal">{lead.customer?.company || "—"}</span></div>
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{lead.rejection_reason || "—"}</span></div>
                    <div className="flex justify-between"><span>Rejected</span><span className="normal-case tracking-normal">{relativeTime(lead.updated_at)}</span></div>
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

      {/* Sales Drawer */}
      {drawerLead && (
        <SalesDrawer
          lead={drawerLead}
          readOnly={drawerReadOnly}
          lockedByName={drawerLockedBy}
          onClose={() => { setDrawerLead(null); setDrawerReadOnly(false); setDrawerLockedBy(null); }}
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
