"use client";

import { useState, useEffect, useRef } from "react";
import { X, Lock } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { HoldForm, Lead } from "@/lib/types";
import { formatPhone } from "@/lib/utils/phone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Constants ───────────────────────────────────────────────────────────────

const SALES_STATUS_OPTIONS = [
  { value: "Ongoing", label: "Ongoing" },
  { value: "Quote Sent", label: "Quote Sent" },
];

const SALES_HOLD_REASONS = [
  { value: "waiting_client_decision", label: "Waiting for client decision" },
  { value: "budget_not_confirmed", label: "Budget not confirmed" },
  { value: "seasonal_timing", label: "Seasonal / timing" },
  { value: "other", label: "Other" },
];

const REJECT_REASONS = [
  { value: "not_a_fit", label: "Not a fit" },
  { value: "no_budget", label: "No budget" },
  { value: "competitor", label: "Competitor" },
  { value: "bad_timing", label: "Bad timing" },
  { value: "other", label: "Other" },
];

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
  sales_status: string;
  quote_total: string;
}

interface SalesDrawerProps {
  lead: Lead;
  readOnly?: boolean;
  lockedByName?: string | null;
  onClose: () => void;
  onLeadUpdated: (lead: Lead) => void;
  onLeadRemoved: (leadId: string) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

function formFromLead(lead: Lead): SalesForm {
  return {
    sales_status: lead.sales_status ?? "Ongoing",
    quote_total: lead.quote_total != null ? String(lead.quote_total) : "",
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
  readOnly = false,
  lockedByName = null,
  onClose,
  onLeadUpdated,
  onLeadRemoved,
  showToast,
}: SalesDrawerProps) {
  const [lead, setLead] = useState<Lead>(initialLead);
  const [form, setForm] = useState<SalesForm>(() => formFromLead(initialLead));
  const [activeTab, setActiveTab] = useState<"info" | "order">("info");
  const [footerMode, setFooterMode] = useState<"actions" | "hold" | "reject">("actions");
  const [holdForm, setHoldForm] = useState<HoldForm>({ hold_reason: "", hold_notes: "", hold_until: "" });
  const [rejForm, setRejForm] = useState({ rejection_reason: "", rejection_notes: "" });
  const [saving, setSaving] = useState(false);
  const unlockRef = useRef(false);

  const isTerminal = lead.status === "Rejected" || lead.sales_status === "Won" || lead.sales_status === "Dropped";
  const isReadOnly = readOnly || isTerminal;

  useEffect(() => {
    return () => {
      if (!unlockRef.current && !readOnly) {
        fetch(`/api/leads/${lead.id}/unlock`, { method: "POST" }).catch(() => {});
        unlockRef.current = true;
      }
    };
  }, [lead.id, readOnly]);

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
    const payload: Record<string, unknown> = {
      sales_status: form.sales_status || null,
    };
    const qt = parseFloat(form.quote_total);
    payload.quote_total = isNaN(qt) ? null : qt;

    const updated = await patchLead(payload);
    setSaving(false);
    if (!updated) return;
    setLead(updated);
    setForm(formFromLead(updated));
    onLeadUpdated(updated);
    showToast("Lead saved.");
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

  // ── Action: Reject ───────────────────────────────────────────────────────

  async function handleRejectConfirm() {
    if (!rejForm.rejection_reason) return;
    setSaving(true);
    const updated = await patchLead({
      status: "Rejected",
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[600px] flex-col overflow-hidden shadow-2xl"
        style={{ background: "var(--color-surface)", borderLeft: "1px solid var(--color-border)" }}
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
                {lead.urgency && (
                  <span
                    className="text-[11px] font-medium"
                    style={{
                      color: lead.urgency === "High" ? "#DC2626" : lead.urgency === "Medium" ? "#D97706" : "#16A34A",
                    }}
                  >
                    {lead.urgency} urgency
                  </span>
                )}
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
            style={{ background: "#FEF2F2", color: "#DC2626", borderBottom: "1px solid #FECACA" }}
          >
            <Lock className="h-3.5 w-3.5" />
            {lockedByName} is currently working this lead — view only
          </div>
        )}
        {isTerminal && !lockedByName && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "#FEF2F2", color: "#DC2626", borderBottom: "1px solid #FECACA" }}
          >
            <Lock className="h-3.5 w-3.5" />
            This lead is in a terminal state and cannot be modified.
          </div>
        )}

        {/* Tab bar */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {(["info", "order"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2.5 text-[13px] font-medium transition-colors"
              style={{
                borderBottom: activeTab === tab ? "2px solid var(--color-tab-underline)" : "2px solid transparent",
                color: activeTab === tab ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
              }}
            >
              {tab === "info" ? "Lead Info" : "Order / Quote"}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

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
                      value={c?.industry || "—"}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Source</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={lead.source || "—"}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Decision Maker?</label>
                    <input
                      className={inputCls}
                      style={{ ...inputStyle, opacity: 0.75 }}
                      value={lead.authority === "yes" ? "Yes" : lead.authority === "no" ? "No" : "—"}
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
                      .map(([interest]) => (
                        <span
                          key={interest}
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium"
                          style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                        >
                          {interest}
                          {lead.quantities?.[interest] && (
                            <span className="ml-1 opacity-70">× {lead.quantities[interest]}</span>
                          )}
                        </span>
                      ))}
                  </div>
                </section>
              )}

              {/* ── Sales Fields ── */}
              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--color-text-muted)" }}>
                  Sales Fields
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  <div>
                    <label className={labelCls} style={labelStyle}>Sales Status</label>
                    <Select
                      value={form.sales_status}
                      onValueChange={(v) => setForm((f) => ({ ...f, sales_status: v ?? "" }))}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="Select status…">
                          {SALES_STATUS_OPTIONS.find((o) => o.value === form.sales_status)?.label ?? form.sales_status}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {SALES_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Quote Total ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className={inputCls}
                      style={inputStyle}
                      value={form.quote_total}
                      onChange={(e) => setForm((f) => ({ ...f, quote_total: e.target.value }))}
                      disabled={isReadOnly}
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "order" && (
            <section className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px]"
                style={{ background: "var(--color-badge-bg)" }}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--color-badge-text)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
                Order / Quote Builder
              </p>
              <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                Coming in the Tickets phase.
              </p>
            </section>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 px-5 py-4 space-y-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {/* Hold sub-form */}
          {footerMode === "hold" && (
            <div
              className="flex flex-col gap-3 rounded-[10px] border p-4"
              style={{ background: "var(--color-row-alt)", borderColor: "var(--color-border)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                Put on hold
              </p>
              <div>
                <label className={labelCls} style={labelStyle}>Hold Reason *</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {SALES_HOLD_REASONS.map((r) => {
                    const selected = holdForm.hold_reason === r.value;
                    return (
                      <label
                        key={r.value}
                        className="flex items-center gap-2.5 cursor-pointer rounded-[8px] border px-3 py-2.5 text-sm transition-all"
                        style={{
                          borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                          background: selected ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "var(--color-surface)",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        <input
                          type="radio"
                          name="sales_hold_reason"
                          value={r.value}
                          checked={selected}
                          onChange={() => setHoldForm((f) => ({ ...f, hold_reason: r.value }))}
                          className="accent-[var(--color-accent)] shrink-0"
                        />
                        {r.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Notes (optional)</label>
                <textarea
                  rows={2}
                  value={holdForm.hold_notes}
                  onChange={(e) => setHoldForm((f) => ({ ...f, hold_notes: e.target.value }))}
                  placeholder="Any additional context…"
                  className="w-full rounded-[6px] border px-3 py-2 text-[13px] outline-none resize-none"
                  style={{ ...inputStyle, height: "auto" }}
                />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Hold Until (optional)</label>
                <input
                  type="date"
                  value={holdForm.hold_until}
                  onChange={(e) => setHoldForm((f) => ({ ...f, hold_until: e.target.value }))}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFooterMode("actions")}
                  disabled={saving}
                  className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleHoldConfirm}
                  disabled={!holdForm.hold_reason || saving}
                  className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
                  style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                >
                  {saving ? "Saving…" : "Confirm Hold"}
                </button>
              </div>
            </div>
          )}

          {/* Reject sub-form */}
          {footerMode === "reject" && (
            <div
              className="flex flex-col gap-3 rounded-[10px] border p-4"
              style={{ background: "#FEF2F2", borderColor: "#FECACA" }}
            >
              <p className="text-sm font-medium" style={{ color: "#7F1D1D" }}>
                Reject this lead — this is terminal and cannot be undone by Sales.
              </p>
              <Select
                value={rejForm.rejection_reason}
                onValueChange={(v) => setRejForm((f) => ({ ...f, rejection_reason: v ?? "" }))}
              >
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="Rejection reason *">
                    {REJECT_REASONS.find((r) => r.value === rejForm.rejection_reason)?.label ?? "Rejection reason *"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {REJECT_REASONS.map((r) => (
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
                style={{ background: "var(--color-surface)", borderColor: "#FECACA", color: "var(--color-text-primary)" }}
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
                  style={{ background: "#DC2626" }}
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
                onClick={() => setFooterMode("hold")}
                disabled={saving}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                On Hold
              </button>
              <button
                onClick={() => setFooterMode("reject")}
                disabled={saving}
                className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium text-white transition-all"
                style={{ background: "#DC2626" }}
              >
                Reject
              </button>
              <div className="flex-1" />
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

          {/* Close button (always shown, or only button in read-only mode) */}
          {(isReadOnly || footerMode === "actions") && (
            <button
              onClick={handleClose}
              className="w-full rounded-[6px] border py-2 text-[13px] font-medium transition-all"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </>
  );
}
