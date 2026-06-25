"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Lock,
  AlertTriangle,
  User,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
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
import { URGENCY_NOT_DEFINED, urgencyDbToForm, urgencyFormToDb } from "@/lib/utils/urgency-form";
import { formatPhone, validatePhone } from "@/lib/utils/phone";
import { relativeTime } from "@/lib/utils/format";
import { reportApiError } from "@/lib/utils/report-api-error";
import { validateEmail } from "@/lib/utils/email";
import { normalizeWebsite, validateWebsite, WEBSITE_FIELD_PLACEHOLDER } from "@/lib/utils/website";
import { scrollToFormField } from "@/lib/utils/scroll-field-into-view";
import {
  buildLeadProductInterestPayload,
  EMPTY_PRODUCT_ROW_ERRORS,
  remapProductRowErrors,
  rowErrorsFromValidation,
  type LeadProductInterestRow,
} from "@/lib/utils/validate-lead-product-interests";
import { ProductInterestRows } from "@/components/leads/product-interest-rows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DrawerForm {
  phone: string;
  email: string;
  first_name: string;
  last_name: string;
  source: string;
  authority: string;
  company: string;
  industry: string;
  website: string;
  urgency: string;
  is_returning_customer: boolean;
  sdr_comment: string;
  rejection_reason: string;
  rejection_notes: string;
}

interface VerifyDrawerProps {
  lead: Lead;
  lookups: LookupMap;
  readOnly?: boolean;
  lockedByName?: string | null;
  isAdmin?: boolean;
  onClose: () => void;
  onLeadUpdated: (lead: Lead) => void;
  onLeadRemoved: (leadId: string) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { labelCls, labelStyle, inputCls, inputStyle } from "@/lib/utils/form-field-styles";

const AUTHORITY_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const URGENCY_NOT_DEFINED_OPTION = URGENCY_NOT_DEFINED;

function formFromLead(lead: Lead): DrawerForm {
  const c = lead.customer;
  return {
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    source: lead.source ?? "",
    authority: c?.authority ?? lead.authority ?? "",
    company: c?.company ?? "",
    industry: c?.industry ?? "",
    website: c?.website ?? "",
    urgency: urgencyDbToForm(lead.urgency),
    is_returning_customer: lead.is_returning_customer,
    sdr_comment: lead.sdr_comment ?? "",
    rejection_reason: "",
    rejection_notes: "",
  };
}

function rowsFromLead(lead: Lead): LeadProductInterestRow[] {
  const interests = lead.interests ?? {};
  const quantities = lead.quantities ?? {};
  const has_design = lead.has_design ?? {};
  return Object.entries(interests)
    .filter(([, selected]) => selected)
    .map(([product]) => ({
      product,
      quantity: String(quantities[product] ?? ""),
      has_design: has_design[product] ?? false,
    }));
}


function hasContactChanged(lead: Lead, form: DrawerForm): boolean {
  const c = lead.customer;
  return (
    (c?.phone ?? "") !== form.phone ||
    (c?.email ?? "") !== form.email ||
    (c?.first_name ?? "") !== form.first_name ||
    (c?.last_name ?? "") !== form.last_name ||
    (c?.company ?? "") !== form.company ||
    (c?.industry ?? "") !== form.industry ||
    (c?.website ?? "") !== form.website ||
    (c?.authority ?? lead.authority ?? "") !== form.authority
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function VerifyDrawer({
  lead: initialLead,
  lookups,
  readOnly = false,
  lockedByName = null,
  isAdmin = false,
  onClose,
  onLeadUpdated,
  onLeadRemoved,
  showToast,
}: VerifyDrawerProps) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initialLead);
  const [form, setForm] = useState<DrawerForm>(() => formFromLead(initialLead));
  const [productRows, setProductRows] = useState<LeadProductInterestRow[]>(() => rowsFromLead(initialLead));
  const [productRowErrors, setProductRowErrors] = useState(EMPTY_PRODUCT_ROW_ERRORS);
  const [productInterestsError, setProductInterestsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "history">("info");
  const [footerMode, setFooterMode] = useState<"actions" | "follow_up" | "hold" | "reject">("actions");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesFetched, setActivitiesFetched] = useState(false);
  const [holdForm, setHoldForm] = useState<HoldForm>({ hold_reason: "", hold_notes: "", hold_until: "" });
  const [followUpForm, setFollowUpForm] = useState<FollowUpForm>({
    follow_up_reason: "",
    follow_up_notes: "",
    follow_up_until: "",
  });
  const [saving, setSaving] = useState(false);
  const [showUpdateCustomer, setShowUpdateCustomer] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const isRejected = lead.status === "Rejected";
  const isReadOnly = readOnly || (isRejected && !isAdmin);

  // Re-sync form when opening a different lead in the same drawer instance
  useEffect(() => {
    setLead(initialLead);
    setForm(formFromLead(initialLead));
    setProductRows(rowsFromLead(initialLead));
    setProductRowErrors(EMPTY_PRODUCT_ROW_ERRORS);
    setProductInterestsError(null);
    setFooterMode("actions");
    setActiveTab("info");
    setActivitiesFetched(false);
    setActivities([]);
  }, [initialLead]);

  // Product types from admin panel
  const [productTypes, setProductTypes] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/admin/product-types")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.product_types ?? []).filter((p: { is_active: boolean }) => p.is_active);
        setProductTypes(active);
      })
      .catch(() => {});
  }, []);

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
    // Soft lock model: closing the drawer does NOT release ownership.
    // The lead stays assigned to this SDR until they route, reject, or admin reassigns.
    onClose();
  }

  function addProductRow() {
    setProductRows((rows) => [...rows, { product: "", quantity: "", has_design: false }]);
  }

  function updateProductRow(idx: number, patch: Partial<LeadProductInterestRow>) {
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    if (patch.product !== undefined || patch.quantity !== undefined) {
      setProductRowErrors((prev) => {
        const next = {
          product: new Set(prev.product),
          quantity: new Set(prev.quantity),
        };
        if (patch.product !== undefined) next.product.delete(idx);
        if (patch.quantity !== undefined) next.quantity.delete(idx);
        return next;
      });
      setProductInterestsError(null);
    }
  }

  function removeProductRow(idx: number) {
    setProductRows((rows) => rows.filter((_, i) => i !== idx));
    setProductRowErrors((prev) => remapProductRowErrors(prev, idx));
  }

  // ── Save helpers ──────────────────────────────────────────────────────────

  function fireCountsRefresh() {
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
  }

  async function patchLead(fields: Record<string, unknown>): Promise<Lead | null> {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error ?? "Something went wrong.";
      showToast(msg, "error");
      reportApiError(msg, res, "VerifyDrawer/patchLead");
      return null;
    }
    return data.lead as Lead;
  }

  async function maybeUpdateCustomer() {
    if (!lead.customer_id || !hasContactChanged(lead, form)) return;
    await fetch(`/api/customers/${lead.customer_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        industry: form.industry,
        website: normalizeWebsite(form.website),
      }),
    });
  }

  function buildLeadPayload():
    | { ok: true; payload: Record<string, unknown> }
    | { ok: false; error: string } {
    const built = buildLeadProductInterestPayload(productRows);
    if (!built.ok) {
      setProductRowErrors(
        rowErrorsFromValidation(
          built.invalidProductIndexes,
          built.invalidQuantityIndexes,
        ),
      );
      setProductInterestsError(built.error);
      scrollToFormField(scrollContainerRef, "productInterests");
      return { ok: false, error: built.error };
    }
    setProductRowErrors(EMPTY_PRODUCT_ROW_ERRORS);
    setProductInterestsError(null);
    const { interests, quantities, has_design } = built;
    return {
      ok: true,
      payload: {
        source: form.source || null,
        authority: form.authority || null,
        urgency: urgencyFormToDb(form.urgency),
        is_returning_customer: form.is_returning_customer,
        sdr_comment: form.sdr_comment || null,
        interests,
        quantities,
        has_design,
      },
    };
  }

  function validateContactFields(): boolean {
    const pErr = validatePhone(form.phone);
    const eErr = form.email.trim() ? validateEmail(form.email) : null;
    const wErr = validateWebsite(form.website);
    setPhoneError(pErr);
    setEmailError(eErr);
    setWebsiteError(wErr);
    if (pErr) scrollToFormField(scrollContainerRef, "phone");
    else if (eErr) scrollToFormField(scrollContainerRef, "email");
    else if (wErr) scrollToFormField(scrollContainerRef, "website");
    return !(pErr || eErr || wErr);
  }

  // ── Action: Save ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!validateContactFields()) return;
    const result = buildLeadPayload();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    const payload = result.payload;

    setSaving(true);
    if (lead.customer_id && hasContactChanged(lead, form)) {
      await maybeUpdateCustomer();
    }
    const updated = await patchLead(payload);
    setSaving(false);
    if (!updated) return;
    setLead(updated);
    onLeadUpdated(updated);
    showToast("Lead saved.");
    onClose();
  }

  // ── Action: Create Quote/Order — save lead silently then navigate ──────────

  async function handleCreateQuote() {
    if (!validateContactFields()) return;
    const result = buildLeadPayload();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    const payload = result.payload;
    setSaving(true);
    // Save any pending lead changes silently (no toast / no close)
    const updated = await patchLead(payload);
    setSaving(false);
    if (updated) {
      setLead(updated);
      onLeadUpdated(updated);
    }
    router.push(`/quotes/new?lead_id=${lead.id}`);
  }

  // ── Action flow with optional customer update prompt ──────────────────────

  function promptThenRun(action: () => Promise<void>) {
    if (lead.customer_id && hasContactChanged(lead, form)) {
      setPendingAction(() => action);
      setShowUpdateCustomer(true);
    } else {
      action();
    }
  }

  async function handleUpdateCustomerYes() {
    setShowUpdateCustomer(false);
    await maybeUpdateCustomer();
    if (pendingAction) await pendingAction();
    setPendingAction(null);
  }

  async function handleUpdateCustomerNo() {
    setShowUpdateCustomer(false);
    if (pendingAction) await pendingAction();
    setPendingAction(null);
  }

  // ── Action: Route to Sales ────────────────────────────────────────────────

  async function doRoute() {
    if (!validateContactFields()) return;
    const result = buildLeadPayload();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    const payload = result.payload;
    setSaving(true);
    const updated = await patchLead({
      ...payload,
      status: "Routed to Sales",
      sales_status: "Ongoing",
    });
    setSaving(false);
    if (!updated) return;
    // Ownership released — lead moves to Sales queue.
    fetch(`/api/leads/${lead.id}/unlock`, { method: "POST" }).catch(() => {});
    onLeadRemoved(lead.id);
    onLeadUpdated(updated);
    fireCountsRefresh();
    showToast("Lead routed to Sales.");
    onClose();
  }

  function handleRoute() {
    promptThenRun(doRoute);
  }

  // ── Action: Resume (from On Hold) ────────────────────────────────────────

  async function handleResume() {
    if (!validateContactFields()) return;
    const result = buildLeadPayload();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    const payload = result.payload;
    setSaving(true);
    // Save any edited form fields before resuming
    await patchLead(payload);
    const res = await fetch(`/api/leads/${lead.id}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "sdr" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { const m = data.error ?? "Something went wrong."; showToast(m, "error"); reportApiError(m, res, "VerifyDrawer/resume"); return; }
    setLead(data.lead);
    onLeadUpdated(data.lead);
    fireCountsRefresh();
    showToast("Lead resumed.");
  }

  // ── Action: Hold ──────────────────────────────────────────────────────────

  async function doHold() {
    if (!holdForm.hold_reason) return;
    if (!validateContactFields()) return;
    const result = buildLeadPayload();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    const payload = result.payload;
    setSaving(true);
    // Save any edited form fields before setting hold status
    await patchLead(payload);
    const res = await fetch(`/api/leads/${lead.id}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...holdForm, role: "sdr" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { const m = data.error ?? "Something went wrong."; showToast(m, "error"); reportApiError(m, res, "VerifyDrawer/hold"); return; }
    // Soft lock: SDR retains ownership while lead is on hold.
    onLeadRemoved(lead.id);
    onLeadUpdated(data.lead);
    fireCountsRefresh();
    showToast("Lead put on hold.");
    onClose();
  }

  function handleHoldConfirm() {
    promptThenRun(doHold);
  }

  // ── Action: Follow Up Later ───────────────────────────────────────────────

  async function doFollowUp() {
    if (!followUpForm.follow_up_reason) return;
    if (!validateContactFields()) return;
    const result = buildLeadPayload();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    const payload = result.payload;
    setSaving(true);
    await patchLead(payload);
    const res = await fetch(`/api/leads/${lead.id}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...followUpForm, role: "sdr" }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { const m = data.error ?? "Something went wrong."; showToast(m, "error"); reportApiError(m, res, "VerifyDrawer/followUp"); return; }
    onLeadRemoved(lead.id);
    onLeadUpdated(data.lead);
    fireCountsRefresh();
    showToast("Lead marked for follow-up.");
    onClose();
  }

  function handleFollowUpConfirm() {
    promptThenRun(doFollowUp);
  }

  // ── Action: Reject ────────────────────────────────────────────────────────

  async function doReject() {
    if (!form.rejection_reason) return;
    if (!validateContactFields()) return;
    const result = buildLeadPayload();
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    const payload = result.payload;
    setSaving(true);
    const updated = await patchLead({
      ...payload,
      status: "Rejected",
      rejection_reason: form.rejection_reason,
      rejection_notes: form.rejection_notes || null,
    });
    setSaving(false);
    if (!updated) return;
    // Ownership released — terminal state.
    fetch(`/api/leads/${lead.id}/unlock`, { method: "POST" }).catch(() => {});
    onLeadRemoved(lead.id);
    onLeadUpdated(updated);
    fireCountsRefresh();
    showToast("Lead rejected.");
    onClose();
  }

  function handleRejectConfirm() {
    promptThenRun(doReject);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const sources = lookups.source ?? [];
  const industries = lookups.industry ?? [];
  const urgencyOptions = [URGENCY_NOT_DEFINED_OPTION, ...(lookups.urgency ?? [])];
  const rejectReasons = lookups.reject_reason ?? [];
  const holdReasons = lookups.hold_reason ?? [];
  const followUpReasons = lookups.follow_up_reason ?? [];
  const isDeferredStatus =
    lead.status === "On Hold" || lead.status === "Follow Up Later";

  const displayName =
    `${form.first_name} ${form.last_name}`.trim() || "Lead Details";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.45)" }}
        aria-modal="true"
        role="dialog"
        onClick={saving ? undefined : handleClose}
      >
      <div
        className="flex w-full max-w-[780px] flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
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
                <StatusPill status={lead.status} />
                {lead.urgency && <UrgencyPill urgency={lead.urgency} />}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-muted disabled:opacity-50"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lock / terminal banners */}
        {lockedByName && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", borderBottom: "1px solid var(--color-danger-border)" }}
          >
            <Lock className="h-3.5 w-3.5" />
            {lockedByName} is currently working this lead — view only
          </div>
        )}
        {isRejected && !lockedByName && isAdmin && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)", borderBottom: "1px solid var(--color-warning-border)" }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin override — this lead was rejected. You can re-route or edit it.
          </div>
        )}
        {isRejected && !lockedByName && !isAdmin && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", borderBottom: "1px solid var(--color-danger-border)" }}
          >
            <Lock className="h-3.5 w-3.5" />
            This lead was rejected and cannot be modified.
          </div>
        )}
        {isReadOnly &&
          !lockedByName &&
          !isRejected &&
          (lead.status === "Routed to Sales" || lead.sales_status === "Won") && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
            style={{ background: "var(--color-info-bg)", color: "var(--color-info-text-deep)", borderBottom: "1px solid var(--color-info-border)" }}
          >
            <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-info-text)" }} />
            {lead.sales_status === "Won"
              ? "This lead is Won — details are view-only."
              : "This lead is directed to Sales — details are view-only."}
          </div>
        )}

        {/* Tab bar — hidden while deferral sub-forms are open */}
        {footerMode !== "hold" && footerMode !== "follow_up" && (
        <div
          className="flex shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
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
        <div ref={scrollContainerRef} className={`flex-1 min-h-0 overflow-y-auto px-5 py-5 ${footerMode === "hold" || footerMode === "follow_up" ? "flex flex-col" : "space-y-6"}`}>

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
              {/* Contact Information */}
              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--color-text-muted)" }}>
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-3">

                  {/* Phone */}
                  <div data-field-anchor="phone">
                    <label className={labelCls} style={labelStyle}>Phone *</label>
                    <PhoneInput
                      value={form.phone}
                      onChange={(digits) => { setForm((f) => ({ ...f, phone: digits })); setPhoneError(null); }}
                      disabled={isReadOnly}
                      showAction
                      error={phoneError}
                    />
                  </div>

                  {/* Email */}
                  <div data-field-anchor="email">
                    <label className={labelCls} style={labelStyle}>Email</label>
                    <EmailInput
                      value={form.email}
                      onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setEmailError(null); }}
                      disabled={isReadOnly}
                      showAction
                      error={emailError}
                    />
                  </div>

                  {/* First Name */}
                  <div>
                    <label className={labelCls} style={labelStyle}>First Name *</label>
                    <input
                      className={inputCls}
                      style={inputStyle}
                      value={form.first_name}
                      onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                      disabled={isReadOnly}
                      placeholder="First name"
                    />
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className={labelCls} style={labelStyle}>Last Name</label>
                    <input
                      className={inputCls}
                      style={inputStyle}
                      value={form.last_name}
                      onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                      disabled={isReadOnly}
                      placeholder="Last name"
                    />
                  </div>

                  {/* Source */}
                  <div>
                    <label className={labelCls} style={labelStyle}>Source *</label>
                    <Select
                      value={form.source}
                      onValueChange={(v) => setForm((f) => ({ ...f, source: v ?? "" }))}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="Select source…">
                          {(sources.find((s) => s.value === form.source)?.label ?? form.source) || "Select source…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {sources.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Authority */}
                  <div>
                    <label className={labelCls} style={labelStyle}>Decision Maker?</label>
                    <Select
                      value={form.authority}
                      onValueChange={(v) => setForm((f) => ({ ...f, authority: v ?? "" }))}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="Select…">
                          {AUTHORITY_OPTIONS.find((a) => a.value === form.authority)?.label ?? "Select…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {AUTHORITY_OPTIONS.map((a) => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Company */}
                  <div>
                    <label className={labelCls} style={labelStyle}>Company</label>
                    <input
                      className={inputCls}
                      style={inputStyle}
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                      disabled={isReadOnly}
                      placeholder="Company name"
                    />
                  </div>

                  {/* Industry */}
                  <div>
                    <label className={labelCls} style={labelStyle}>Industry *</label>
                    <Select
                      value={form.industry}
                      onValueChange={(v) => setForm((f) => ({ ...f, industry: v ?? "" }))}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="Select industry…">
                          {(industries.find((i) => i.value === form.industry)?.label ?? form.industry) || "Select industry…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {industries.map((i) => (
                          <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Website */}
                  <div data-field-anchor="website">
                    <label className={labelCls} style={labelStyle}>Website / Social</label>
                    <input
                      className={inputCls}
                      style={{
                        ...inputStyle,
                        borderColor: websiteError ? "var(--color-danger)" : "var(--color-border)",
                      }}
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      value={form.website}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, website: e.target.value }));
                        setWebsiteError(null);
                      }}
                      onBlur={(e) => {
                        const wErr = validateWebsite(e.target.value);
                        setWebsiteError(wErr);
                        e.currentTarget.style.borderColor = wErr ? "var(--color-danger)" : "var(--color-border)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                      disabled={isReadOnly}
                      placeholder={WEBSITE_FIELD_PLACEHOLDER}
                      aria-invalid={!!websiteError}
                      aria-describedby={websiteError ? "website-error" : undefined}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-accent)";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
                      }}
                    />
                    {websiteError && (
                      <p
                        id="website-error"
                        className="mt-1.5 text-[12px] font-medium"
                        style={{ color: "var(--color-danger)" }}
                        role="alert"
                      >
                        {websiteError}
                      </p>
                    )}
                  </div>

                  {/* Urgency */}
                  <div>
                    <label className={labelCls} style={labelStyle}>Urgency</label>
                    <Select
                      value={form.urgency}
                      onValueChange={(v) => setForm((f) => ({ ...f, urgency: v ?? "" }))}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="Select…">
                          {urgencyOptions.find((u) => u.value === form.urgency)?.label ?? "Select…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {urgencyOptions.map((u) => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                </div>

                {/* Returning customer */}
                <label
                  className="mt-3 flex items-center gap-2.5 cursor-pointer rounded-[6px] p-2.5 transition-colors"
                  style={{
                    background: form.is_returning_customer ? "rgba(37,99,235,0.07)" : "transparent",
                    border: "1px solid",
                    borderColor: form.is_returning_customer ? "var(--color-info-border)" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.is_returning_customer}
                    onChange={(e) => setForm((f) => ({ ...f, is_returning_customer: e.target.checked }))}
                    disabled={isReadOnly}
                    className="rounded"
                  />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Returning Customer (Existing Client)
                  </span>
                </label>
                <p className="mt-1 px-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  Set by SDR based on what the caller says. Once orders &amp; quotes are live this will be auto-derived from actual purchase history.
                </p>
              </section>

              {/* Product Interests */}
              <section className="space-y-2" data-field-anchor="productInterests">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                  Product Interests
                </h3>
                <ProductInterestRows
                  rows={productRows}
                  productTypes={productTypes}
                  errors={productRowErrors}
                  readOnly={isReadOnly}
                  onUpdateRow={updateProductRow}
                  onRemoveRow={removeProductRow}
                  onAddRow={addProductRow}
                  bannerError={productInterestsError}
                />
              </section>

              {/* SDR Comment */}
              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--color-text-muted)" }}>
                  Verify Lead Comment
                </h3>
                <textarea
                  rows={3}
                  value={form.sdr_comment}
                  onChange={(e) => setForm((f) => ({ ...f, sdr_comment: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Add verification notes before opening Order / Quote…"
                  className="w-full rounded-[6px] border px-3 py-2 text-sm outline-none transition-all resize-none"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </section>
            </>
          )}

          {activeTab === "history" && (
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] mb-4" style={{ color: "var(--color-text-muted)" }}>
                Lead Timeline
              </h3>

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

              {!activitiesLoading && activitiesFetched && activities.length === 0 && (
                <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                  No activity recorded for this lead yet.
                </p>
              )}

              {!activitiesLoading && activities.length > 0 && (
                <ol className="relative space-y-0">
                  {activities.map((a, idx) => (
                    <li key={a.id} className="flex gap-3 pb-5 relative">
                      {idx < activities.length - 1 && (
                        <div
                          className="absolute left-[4px] top-3 bottom-0 w-px"
                          style={{ background: "var(--color-border)" }}
                        />
                      )}
                      <div
                        className="relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: leadActivityDotColor(a.type),
                          outline: "2px solid var(--color-surface)",
                          outlineOffset: "1px",
                        }}
                      />
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

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {footerMode !== "hold" && footerMode !== "follow_up" && (
        <div
          className="shrink-0 px-5 py-4 space-y-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >

          {/* Update customer prompt */}
          {showUpdateCustomer && (
            <div
              className="flex flex-col gap-3 rounded-[10px] border p-4"
              style={{ background: "var(--color-info-bg)", borderColor: "var(--color-info-border)" }}
            >
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--color-info-text)" }} />
                <p className="text-sm" style={{ color: "var(--color-info-text-deep)" }}>
                  You&apos;ve updated the contact info. Update the customer profile too?
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateCustomerYes}
                  className="flex-1 rounded-[6px] border border-blue-300 px-3 py-1.5 text-[13px] font-medium text-blue-700 transition-all hover:bg-blue-50"
                >
                  Yes, update profile
                </button>
                <button
                  onClick={handleUpdateCustomerNo}
                  className="flex-1 rounded-[6px] border border-blue-200 px-3 py-1.5 text-[13px] font-medium text-blue-500 transition-all hover:bg-blue-50"
                >
                  No, keep existing
                </button>
              </div>
            </div>
          )}

          {/* Reject sub-form */}
          {footerMode === "reject" && (
            <div
              className="flex flex-col gap-3 rounded-[10px] border p-4"
              style={{ background: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--color-danger-text-deep)" }}>
                Reject this lead — this is terminal and cannot be undone by the SDR.
              </p>
              <Select
                value={form.rejection_reason}
                onValueChange={(v) => setForm((f) => ({ ...f, rejection_reason: v ?? "" }))}
              >
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="Rejection reason *">
                    {rejectReasons.find((r) => r.value === form.rejection_reason)?.label ?? "Rejection reason *"}
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
                value={form.rejection_notes}
                onChange={(e) => setForm((f) => ({ ...f, rejection_notes: e.target.value }))}
                placeholder="Notes (optional)…"
                className="w-full rounded-[6px] border px-3 py-2 text-sm outline-none resize-none"
                style={{
                  background: "var(--color-surface)",
                  borderColor: "var(--color-danger-border)",
                  color: "var(--color-text-primary)",
                }}
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
                  disabled={!form.rejection_reason || saving}
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
              {isAdmin ? (
                <>
                  <button
                    onClick={handleClose}
                    disabled={saving}
                    className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                  >
                    Close
                  </button>
                  <button
                    onClick={() => promptThenRun(handleSave)}
                    disabled={saving}
                    className="ml-auto rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
                    style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRoute}
                    disabled={saving}
                    className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
                    style={{
                      background: "var(--color-btn-primary-bg)",
                      color: "var(--color-btn-primary-text)",
                    }}
                  >
                    Route to Sales
                  </button>
                  <button
                    title="Available in the Tickets phase"
                    className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
                    style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                    onClick={handleCreateQuote}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Create Quote / Order"}
                  </button>
                  {isDeferredStatus ? (
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
                  <button
                    onClick={() => promptThenRun(handleSave)}
                    disabled={saving}
                    className="ml-auto rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
                    style={{
                      background: "var(--color-btn-verify-bg)",
                      color: "var(--color-btn-verify-text)",
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Read-only close button */}
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
