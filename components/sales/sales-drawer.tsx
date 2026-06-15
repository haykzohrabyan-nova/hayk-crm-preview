"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Lock, ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { UrgencyPill } from "@/components/ui/urgency-pill";
import { HoldSubForm } from "@/components/leads/hold-sub-form";
import { FollowUpSubForm } from "@/components/leads/follow-up-sub-form";
import { Activity, FollowUpForm, HoldForm, Lead, LookupMap } from "@/lib/types";
import {
  leadActivityDetailLines,
  leadActivityDotColor,
  leadActivityLabel,
} from "@/lib/utils/lead-activity-display";
import { formatPhone } from "@/lib/utils/phone";
import { lookupLabel } from "@/lib/utils/lookups";
import { authorityLabel } from "@/lib/utils/authority";
import { formatCurrency, relativeTime } from "@/lib/utils/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Constants ───────────────────────────────────────────────────────────────

// ─── Styles ──────────────────────────────────────────────────────────────────

const labelCls = "block text-[11px] font-medium uppercase tracking-[0.06em] mb-1";
const labelStyle = { color: "var(--color-text-muted)" };
const inputCls = "w-full h-9 rounded-[6px] border px-3 text-sm outline-none transition-all";
const inputStyle = {
  background: "var(--color-surface)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface SalesForm {
  sales_notes: string;
}

interface SalesDrawerProps {
  lead: Lead;
  lookups: LookupMap;
  readOnly?: boolean;
  lockedByName?: string | null;
  currentUserId?: string | null;
  isAdmin?: boolean;
  onClose: () => void;
  onLeadUpdated: (lead: Lead) => void;
  onLeadRemoved: (leadId: string) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}


function formFromLead(lead: Lead): SalesForm {
  return {
    sales_notes: lead.sales_notes ?? "",
  };
}

function leadDisplayName(lead: Lead): string {
  const c = lead.customer;
  const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
  return name || "Lead Details";
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SalesDrawer({
  lead: initialLead,
  lookups,
  readOnly = false,
  lockedByName = null,
  currentUserId = null,
  isAdmin = false,
  onClose,
  onLeadUpdated,
  onLeadRemoved,
  showToast,
}: SalesDrawerProps) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initialLead);
  const [form, setForm] = useState<SalesForm>(() => formFromLead(initialLead));
  const [activeTab, setActiveTab] = useState<"info" | "history">("info");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesFetched, setActivitiesFetched] = useState(false);
  const [footerMode, setFooterMode] = useState<"actions" | "follow_up" | "hold" | "reject">("actions");
  const [holdForm, setHoldForm] = useState<HoldForm>({ hold_reason: "", hold_notes: "", hold_until: "" });
  const [followUpForm, setFollowUpForm] = useState<FollowUpForm>({
    follow_up_reason: "",
    follow_up_notes: "",
    follow_up_until: "",
  });
  const [rejForm, setRejForm] = useState({ rejection_reason: "", rejection_notes: "" });
  const [saving, setSaving] = useState(false);
  const unlockRef = useRef(false);

  const isTerminal = lead.status === "Rejected" || lead.sales_status === "Won" || lead.sales_status === "Dropped";
  const isReadOnly = readOnly || (isTerminal && !isAdmin);

  const holdReasons = lookups.hold_reason ?? [];
  const followUpReasons = lookups.follow_up_reason ?? [];
  const rejectReasons = lookups.reject_reason ?? [];
  const isSalesDeferred =
    lead.sales_status === "On Hold" || lead.sales_status === "Follow Up Later";
  const industries = lookups.industry ?? [];
  const sources = lookups.source ?? [];

  useEffect(() => {
    return () => {
      if (!unlockRef.current && !readOnly) {
        fetch(`/api/leads/${lead.id}/unlock`, { method: "POST" }).catch(() => {});
        unlockRef.current = true;
      }
    };
  }, [lead.id, readOnly]);

  useEffect(() => {
    if (activeTab === "history" && !activitiesFetched) {
      setActivitiesLoading(true);
      fetch(`/api/leads/${lead.id}/activities`)
        .then((r) => r.json())
        .then((d) => { setActivities(d.activities ?? []); setActivitiesFetched(true); })
        .catch(() => {})
        .finally(() => setActivitiesLoading(false));
    }
  }, [activeTab, activitiesFetched, lead.id]);

  function handleClose() {
    if (!readOnly && !unlockRef.current) {
      fetch(`/api/leads/${lead.id}/unlock`, { method: "POST" }).catch(() => {});
      unlockRef.current = true;
    }
    onClose();
  }

  async function patchLead(fields: Record<string, unknown>): Promise<Lead | null> {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "Something went wrong.", "error");
      return null;
    }
    return data.lead as Lead;
  }

  // ── Action: Save ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    const updated = await patchLead({ sales_notes: form.sales_notes || null });
    setSaving(false);
    if (!updated) return;
    setLead(updated);
    setForm(formFromLead(updated));
    onLeadUpdated(updated);
    showToast("Lead saved.");
  }

  // ── Action: Create Quote/Order — save notes silently then navigate ─────────

  async function handleCreateQuote() {
    setSaving(true);
    await patchLead({ sales_notes: form.sales_notes || null });
    setSaving(false);
    router.push(`/quotes/new?lead_id=${lead.id}`);
  }

  // ── Action: Hold ─────────────────────────────────────────────────────────

  async function handleHoldConfirm() {
    if (!holdForm.hold_reason) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...holdForm, role: "sales" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error ?? "Something went wrong.", "error"); return; }
    unlockRef.current = true;
    onLeadRemoved(lead.id);
    onLeadUpdated(data.lead);
    showToast("Lead put on hold.");
    onClose();
  }

  // ── Action: Follow Up Later ─────────────────────────────────────────────

  async function handleFollowUpConfirm() {
    if (!followUpForm.follow_up_reason) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...followUpForm, role: "sales" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error ?? "Something went wrong.", "error"); return; }
    unlockRef.current = true;
    onLeadRemoved(lead.id);
    onLeadUpdated(data.lead);
    showToast("Lead marked for follow-up.");
    onClose();
  }

  // ── Action: Resume (from On Hold / Follow Up Later) ─────────────────────

  async function handleResume() {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "sales" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error ?? "Something went wrong.", "error"); return; }
    setLead(data.lead);
    onLeadUpdated(data.lead);
    onLeadRemoved(lead.id);
    showToast("Lead resumed.");
    onClose();
  }

  // ── Action: Reject ───────────────────────────────────────────────────────

  async function handleRejectConfirm() {
    if (!rejForm.rejection_reason) return;
    setSaving(true);
    const updated = await patchLead({
      status: "Rejected",
      sales_status: null,
      rejection_reason: rejForm.rejection_reason,
      rejection_notes: rejForm.rejection_notes || null,
    });
    setSaving(false);
    if (!updated) return;
    fetch(`/api/leads/${lead.id}/unlock`, { method: "POST" }).catch(() => {});
    unlockRef.current = true;
    onLeadRemoved(lead.id);
    onLeadUpdated(updated);
    showToast("Lead rejected.");
    onClose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const displayName = leadDisplayName(lead);
  const c = lead.customer;

  return (
    <>
      {/* Backdrop — intentionally non-clickable: user must use Save or an action button to close */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden="true"
      />

      {/* Modal centering wrapper */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        aria-modal="true"
        role="dialog"
      >
      {/* Modal panel */}
      <div
        className="pointer-events-auto flex w-full max-w-[780px] min-h-0 flex-col overflow-hidden shadow-2xl"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          minHeight: "600px",
          maxHeight: "90vh",
          height: "80vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <p className="text-[15px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                {displayName}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {lead.sales_status && <StatusPill status={lead.sales_status} />}
                {lead.urgency && <UrgencyPill urgency={lead.urgency} />}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full p-1.5 transition-colors hover:bg-muted"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lock / terminal banner */}
        {lockedByName && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", borderBottom: "1px solid var(--color-danger-border)" }}
          >
            <Lock className="h-3.5 w-3.5" />
            {lockedByName} is currently working this lead — view only
          </div>
        )}
        {isTerminal && !lockedByName && isAdmin && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)", borderBottom: "1px solid var(--color-warning-border)" }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin override — this lead is in a terminal state.
            {lead.sales_status === "Won" && " Editing will NOT cancel the linked order — handle that manually in Tickets."}
          </div>
        )}
        {isTerminal && !lockedByName && !isAdmin && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", borderBottom: "1px solid var(--color-danger-border)" }}
          >
            <Lock className="h-3.5 w-3.5" />
            This lead is in a terminal state and cannot be modified.
          </div>
        )}

        {/* Tab bar — hidden while hold / follow-up forms are open */}
        {footerMode !== "hold" && footerMode !== "follow_up" && (
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {(["info", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2.5 text-[13px] font-medium transition-colors"
              style={{
                borderBottom: activeTab === tab ? "2px solid var(--color-tab-underline)" : "2px solid transparent",
                color: activeTab === tab ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
              }}
            >
              {tab === "info" ? "Lead Info" : "History"}
            </button>
          ))}
        </div>
        )}

        {/* Scrollable content */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto px-5 py-5 ${
            footerMode === "hold" || footerMode === "follow_up" ? "flex flex-col" : "space-y-6"
          }`}
        >
          {footerMode === "hold" ? (
            <HoldSubForm
              fullScreen
              form={holdForm}
              reasons={holdReasons}
              onChange={setHoldForm}
              onConfirm={handleHoldConfirm}
              onCancel={() => setFooterMode("actions")}
              saving={saving}
            />
          ) : footerMode === "follow_up" ? (
            <FollowUpSubForm
              fullScreen
              form={followUpForm}
              reasons={followUpReasons}
              onChange={setFollowUpForm}
              onConfirm={handleFollowUpConfirm}
              onCancel={() => setFooterMode("actions")}
              saving={saving}
            />
          ) : (
          <>
          {activeTab === "info" && (
            <>
              {/* ── Contact Info (read-only for Sales) ── */}
              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--color-text-muted)" }}>
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  <div>
                    <label className={labelCls} style={labelStyle}>Phone</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={c?.phone ? formatPhone(c.phone) : "—"}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Email</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={c?.email || "—"}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>First Name</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={c?.first_name || "—"}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Last Name</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={c?.last_name || "—"}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Company</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={c?.company || "—"}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Industry</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={lookupLabel(industries, c?.industry)}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Source</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={lookupLabel(sources, lead.source)}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Decision Maker?</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={authorityLabel(c?.authority ?? lead.authority) ?? "—"}
                      readOnly
                    />
                  </div>

                  {c?.website && (
                    <div className="col-span-2">
                      <label className={labelCls} style={labelStyle}>Website / Social</label>
                      <input
                        className={inputCls}
                        style={{ ...inputStyle, opacity: 0.75 }}
                        value={c.website}
                        readOnly
                      />
                    </div>
                  )}
                </div>

                {lead.is_returning_customer && (
                  <p
                    className="mt-2 text-[12px] font-medium rounded-[6px] px-2.5 py-1.5 inline-block"
                    style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--color-text-primary)" }}
                  >
                    Returning Customer (Existing Client)
                  </p>
                )}
              </section>

              {/* ── SDR Comment ── */}
              {lead.sdr_comment && (
                <section>
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--color-text-muted)" }}>
                    SDR Verify Comment
                  </h3>
                  <div
                    className="rounded-[6px] border px-3 py-2.5 text-sm"
                    style={{
                      background: "var(--color-row-alt)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {lead.sdr_comment}
                  </div>
                </section>
              )}

              {/* ── Product Interests ── */}
              {lead.interests && Object.keys(lead.interests).some((k) => lead.interests[k]) && (
                <section>
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--color-text-muted)" }}>
                    Product Interests
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(lead.interests)
                      .filter(([, checked]) => checked)
                      .map(([interest]) => {
                        const qty = lead.quantities?.[interest];
                        const qtyStr = qty != null ? String(qty).trim() : "";
                        const label = qtyStr ? `${interest}[${qtyStr}]` : interest;
                        return (
                        <span
                          key={interest}
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium"
                          style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                        >
                          {label}
                        </span>
                        );
                      })}
                  </div>
                </section>
              )}

              {/* ── Sales notes (+ quote total only after a quote exists) ── */}
              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--color-text-muted)" }}>
                  Sales Notes
                </h3>
                <div className="space-y-3">
                  {lead.quote_total != null && lead.quote_total > 0 && (
                    <div>
                      <label className={labelCls} style={labelStyle}>Quote Total</label>
                      <input
                        className={inputCls}
                        style={{ ...inputStyle, opacity: 0.75 }}
                        value={formatCurrency(lead.quote_total)}
                        readOnly
                      />
                    </div>
                  )}
                  <textarea
                    rows={3}
                    placeholder="Internal notes visible to sales and admin only…"
                    className="w-full rounded-[6px] border px-3 py-2 text-sm outline-none resize-none transition-all"
                    style={inputStyle}
                    value={form.sales_notes}
                    onChange={(e) => setForm((f) => ({ ...f, sales_notes: e.target.value }))}
                    disabled={isReadOnly}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-accent)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </section>
            </>
          )}

          {activeTab === "history" && (
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-4" style={{ color: "var(--color-text-muted)" }}>
                Lead Timeline
              </h3>

              {/* Skeleton while loading */}
              {activitiesLoading && (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" style={{ background: "var(--color-border)" }} />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-3/4 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
                        <div className="h-2.5 w-1/3 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!activitiesLoading && activitiesFetched && activities.length === 0 && (
                <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                  No activity recorded for this lead yet.
                </p>
              )}

              {/* Timeline */}
              {!activitiesLoading && activities.length > 0 && (
                <ol className="relative space-y-0">
                  {activities.map((a, idx) => (
                    <li key={a.id} className="flex gap-3 pb-5 relative">
                      {/* Vertical connector line */}
                      {idx < activities.length - 1 && (
                        <div
                          className="absolute left-[4px] top-3 bottom-0 w-px"
                          style={{ background: "var(--color-border)" }}
                        />
                      )}
                      {/* Dot */}
                      <div
                        className="relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: leadActivityDotColor(a.type),
                          outline: "2px solid var(--color-surface)",
                          outlineOffset: "1px",
                        }}
                      />
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium leading-snug" style={{ color: "var(--color-text-primary)" }}>
                          {leadActivityLabel(a)}
                        </p>
                        {leadActivityDetailLines(a).map((line) => (
                          <p key={line} className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                            {line}
                          </p>
                        ))}
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          {a.by_user?.full_name ?? "System"} · {relativeTime(a.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          </>
          )}
        </div>

        {/* ── Footer — hidden while hold / follow-up forms fill the modal body ── */}
        {footerMode !== "hold" && footerMode !== "follow_up" && (
        <div
          className="shrink-0 px-5 py-4 space-y-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {/* Reject sub-form */}
          {footerMode === "reject" && (
            <div
              className="flex flex-col gap-3 rounded-[10px] border p-4"
              style={{ background: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--color-danger-text-deep)" }}>
                Reject this lead — this is terminal and cannot be undone by Sales.
              </p>
              <Select
                value={rejForm.rejection_reason}
                onValueChange={(v) => setRejForm((f) => ({ ...f, rejection_reason: v ?? "" }))}
              >
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="Rejection reason *">
                    {rejectReasons.find((r) => r.value === rejForm.rejection_reason)?.label ?? "Rejection reason *"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {rejectReasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <textarea
                rows={2}
                value={rejForm.rejection_notes}
                onChange={(e) => setRejForm((f) => ({ ...f, rejection_notes: e.target.value }))}
                placeholder="Notes (optional)…"
                className="w-full rounded-[6px] border px-3 py-2 text-sm outline-none resize-none"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-danger-border)", color: "var(--color-text-primary)" }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setFooterMode("actions")}
                  disabled={saving}
                  className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={!rejForm.rejection_reason || saving}
                  className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--color-danger)" }}
                >
                  {saving ? "Saving…" : "Confirm Reject"}
                </button>
              </div>
            </div>
          )}

          {/* Main action buttons */}
          {footerMode === "actions" && !isReadOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCreateQuote}
                disabled={saving}
                className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
                style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
              >
                {saving ? "Saving…" : "Create Quote / Order"}
              </button>
              {isSalesDeferred ? (
                <button
                  onClick={handleResume}
                  disabled={saving}
                  className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                >
                  Resume
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setFooterMode("follow_up")}
                    disabled={saving}
                    className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    Follow Up Later
                  </button>
                  <button
                    onClick={() => setFooterMode("hold")}
                    disabled={saving}
                    className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    On Hold
                  </button>
                </>
              )}
              <button
                onClick={() => setFooterMode("reject")}
                disabled={saving}
                className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium text-white transition-all"
                style={{ background: "var(--color-danger)" }}
              >
                Reject
              </button>
              <div className="flex-1" />
              <button
                onClick={handleClose}
                disabled={saving}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                Close
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          {/* Close button — read-only mode only */}
          {isReadOnly && (
            <button
              onClick={handleClose}
              className="w-full rounded-[6px] border py-2 text-[13px] font-medium transition-all"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              Close
            </button>
          )}
        </div>
        )}
      </div>
      </div>
    </>
  );
}
