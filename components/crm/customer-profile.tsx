"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Edit2, X, Merge, FileText, Package, FilePlus, UserPlus, ScrollText } from "lucide-react";
import { MergeCustomerModal } from "@/components/crm/merge-customer-modal";
import { CustomerTaxExemptModal } from "@/components/crm/customer-tax-exempt-modal";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { formatPhone, validatePhone } from "@/lib/utils/phone";
import { validateEmail } from "@/lib/utils/email";
import { normalizeWebsite, validateWebsite, WEBSITE_FIELD_PLACEHOLDER } from "@/lib/utils/website";
import { scrollToFormField } from "@/lib/utils/scroll-field-into-view";
import { quoteDetailPath } from "@/lib/utils/reference-codes";
import { newQuoteUrlFromCustomer } from "@/lib/utils/new-quote-from-customer";
import { authorityLabel } from "@/lib/utils/authority";
import { lookupLabel } from "@/lib/utils/lookups";
import { AddLeadModal } from "@/components/leads/add-lead-modal";
import { resolveCustomerProfileBack } from "@/lib/utils/customer-profile-href";
import { createClient } from "@/lib/supabase/client";
import { Customer as AppCustomer, Lead, LookupMap } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  website: string | null;
  authority: string | null;
  heat_tag: "hot" | "warm" | "cold" | null;
  created_at: string;
  updated_at: string;
}

interface ProfileData {
  customer: Customer;
  lead_count: number;
  customer_status: "new" | "known" | "returning";
}

interface TicketSummary {
  id: string;
  ticket_kind: "quote" | "order";
  ticket_status: string;
  title: string | null;
  reference_code: string | null;
  quote_final_total: number | null;
  quote_source: string | null;
  linked_lead_id: string | null;
  rush: boolean;
  created_at: string;
  lead?: { source: string | null } | null;
}

interface LookupOption {
  value: string;
  label: string;
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

function fullName(c: Customer): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
}

function sourceLabel(value: string | null | undefined, labels: Record<string, string>): string | null {
  if (!value) return null;
  return labels[value] ?? value;
}

function ticketSource(t: TicketSummary, labels: Record<string, string>): string | null {
  return sourceLabel(t.quote_source ?? t.lead?.source ?? null, labels);
}

const CUSTOMER_STATUS_STYLE = {
  new: { bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)", label: "New Contact" },
  known: { bg: "var(--color-info-bg)", text: "var(--color-info-text)", label: "Known Customer" },
  returning: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)", label: "Returning Customer" },
};

const HEAT_STYLE: Record<string, { bg: string; text: string }> = {
  hot: { bg: "var(--color-danger-bg)", text: "var(--color-danger)" },
  warm: { bg: "var(--color-warning-bg)", text: "var(--color-warning)" },
  cold: { bg: "var(--color-info-bg)", text: "var(--color-info-text)" },
};

const labelCls = "block text-[11px] font-medium uppercase tracking-[0.06em] mb-1";
const labelStyle = { color: "var(--color-text-muted)" };
const inputCls = "w-full h-9 rounded-[6px] border px-3 text-sm outline-none transition-all";
const inputStyle = {
  background: "var(--color-surface)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

const HEAT_OPTIONS = [
  { value: "", label: "None" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

const AUTHORITY_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

// ─── Toast ───────────────────────────────────────────────────────────────────

function ToastBanner({ message, type, onDismiss }: { message: string; type: "success" | "error"; onDismiss: () => void }) {
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
      <button onClick={onDismiss} style={{ color: "var(--color-text-muted)" }}><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ─── Edit Customer Modal ──────────────────────────────────────────────────────

interface EditForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  industry: string;
  website: string;
  authority: string;
  heat_tag: string;
}

function EditCustomerModal({
  customer,
  industries,
  onClose,
  onSaved,
}: {
  customer: Customer;
  industries: LookupOption[];
  onClose: () => void;
  onSaved: (updated: Customer) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    company: customer.company ?? "",
    industry: customer.industry ?? "",
    website: customer.website ?? "",
    authority: customer.authority ?? "",
    heat_tag: customer.heat_tag ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const editFormRef = useRef<HTMLDivElement>(null);

  function failField(
    anchor: string,
    setFieldError: (msg: string | null) => void,
    message: string,
  ) {
    setFieldError(message);
    scrollToFormField(editFormRef, anchor);
  }

  async function handleSave() {
    const pErr = form.phone.trim() ? validatePhone(form.phone) : null;
    const eErr = form.email.trim() ? validateEmail(form.email) : null;
    const wErr = validateWebsite(form.website);
    setPhoneError(null);
    setEmailError(null);
    setWebsiteError(null);
    if (pErr) { failField("phone", setPhoneError, pErr); return; }
    if (eErr) { failField("email", setEmailError, eErr); return; }
    if (wErr) { failField("website", setWebsiteError, wErr); return; }

    setSaving(true);
    setError("");
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        industry: form.industry || null,
        website: normalizeWebsite(form.website),
        authority: form.authority || null,
        heat_tag: form.heat_tag || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
    onSaved(data.customer);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[520px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-[12px] p-6 shadow-2xl overflow-y-auto"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Edit Customer</h2>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}><X className="h-4 w-4" /></button>
        </div>

        <div ref={editFormRef} className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>First Name</label>
            <input className={inputCls} style={inputStyle} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="First name" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Last Name</label>
            <input className={inputCls} style={inputStyle} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} placeholder="Last name" />
          </div>
          <div data-field-anchor="phone">
            <label className={labelCls} style={labelStyle}>Phone</label>
            <PhoneInput value={form.phone} onChange={(v) => { setForm((f) => ({ ...f, phone: v })); setPhoneError(null); }} error={phoneError} />
          </div>
          <div data-field-anchor="email">
            <label className={labelCls} style={labelStyle}>Email</label>
            <EmailInput value={form.email} onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setEmailError(null); }} error={emailError} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Company</label>
            <input className={inputCls} style={inputStyle} value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Company name" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Industry</label>
            <Select value={form.industry} onValueChange={(v) => setForm((f) => ({ ...f, industry: v ?? "" }))}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="Select industry…">
                  {industries.find((i) => i.value === form.industry)?.label ?? "Select industry…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {industries.map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Decision Maker?</label>
            <Select value={form.authority} onValueChange={(v) => setForm((f) => ({ ...f, authority: v ?? "" }))}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="Select…">
                  {AUTHORITY_OPTIONS.find((o) => o.value === form.authority)?.label ?? "Select…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AUTHORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2" data-field-anchor="website">
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
              onBlur={(e) => setWebsiteError(validateWebsite(e.target.value))}
              placeholder={WEBSITE_FIELD_PLACEHOLDER}
              aria-invalid={!!websiteError}
            />
            {websiteError && (
              <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
                {websiteError}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Heat Tag</label>
            <Select value={form.heat_tag} onValueChange={(v) => setForm((f) => ({ ...f, heat_tag: v ?? "" }))}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="None">
                  {HEAT_OPTIONS.find((o) => o.value === form.heat_tag)?.label ?? "None"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {HEAT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] font-medium" style={{ color: "var(--color-danger)" }}>{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Profile Skeleton ─────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-32 rounded" style={{ background: "var(--color-border)" }} />
      <div className="rounded-[10px] border p-6 space-y-4" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="h-6 w-48 rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 rounded" style={{ background: "var(--color-border)" }} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CustomerProfile({ customerId }: { customerId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnFrom = searchParams.get("from");
  const back = resolveCustomerProfileBack(returnFrom);
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [sourceLabels, setSourceLabels] = useState<Record<string, string>>({});
  const [industries, setIndustries] = useState<LookupOption[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [taxExemptModalOpen, setTaxExemptModalOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [isSdr, setIsSdr] = useState(false);
  const [leadLookups, setLeadLookups] = useState<LookupMap>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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
      const roleName = (profile?.roles as unknown as { name: string } | null)?.name;
      setIsSdr(roleName === "sdr");
    });
  }, []);

  useEffect(() => {
    if (!isSdr) return;
    fetch("/api/lookups?categories=source,industry,urgency,hold_reason,reject_reason,route_reason,sales_drop_reason")
      .then((r) => r.json())
      .then((d) => setLeadLookups(d))
      .catch(() => {});
  }, [isSdr]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/customers/${customerId}`).then((r) => r.json()),
      fetch(`/api/tickets?customer_id=${customerId}`).then((r) => r.json()),
      fetch("/api/lookups?categories=source,industry").then((r) => r.json()),
    ])
      .then(([customerData, ticketData, lookupData]) => {
        setData(customerData);
        setTickets(ticketData.tickets ?? []);
        const sourceOpts: LookupOption[] = lookupData?.source ?? [];
        setSourceLabels(Object.fromEntries(sourceOpts.map((o) => [o.value, o.label])));
        setIndustries(lookupData?.industry ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [customerId]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  function handleCustomerSaved(updated: Customer) {
    setData((prev) => prev ? { ...prev, customer: updated } : prev);
    showToast("Customer updated.");
    window.dispatchEvent(new Event("bazaar:customers-changed"));
  }

  function handleMerged(survivingId: string) {
    setMergeOpen(false);
    showToast("Customers merged successfully.");
    window.dispatchEvent(new Event("bazaar:customers-changed"));
    // Navigate to the surviving customer profile after a short delay
    setTimeout(() => router.push(`/crm/customers/${survivingId}`), 1200);
  }

  async function refreshProfile() {
    const customerData = await fetch(`/api/customers/${customerId}`).then((r) => r.json());
    if (customerData?.customer) setData(customerData);
  }

  function handleLeadCreated(_lead: Lead) {
    setAddLeadOpen(false);
    showToast("Lead created.");
    void refreshProfile();
    window.dispatchEvent(new Event("bazaar:refresh-counts"));
  }

  if (loading) return <ProfileSkeleton />;
  if (!data) return (
    <div className="py-24 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
      Customer not found.
    </div>
  );

  const { customer: c, lead_count, customer_status } = data;
  const statusStyle = CUSTOMER_STATUS_STYLE[customer_status];

  return (
    <div className="space-y-6">

      {/* Back button */}
      <button
        onClick={() => router.push(back.href)}
        className="flex items-center gap-1.5 text-[13px] font-medium transition-opacity hover:opacity-70"
        style={{ color: "var(--color-text-muted)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {back.label}
      </button>

      {/* Customer Header */}
      <div
        className="rounded-[10px] border p-6"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {fullName(c)}
              </h1>
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium"
                style={{ background: statusStyle.bg, color: statusStyle.text }}
              >
                {statusStyle.label}
              </span>
              {c.heat_tag && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium capitalize"
                  style={{ background: HEAT_STYLE[c.heat_tag].bg, color: HEAT_STYLE[c.heat_tag].text }}
                >
                  {c.heat_tag} heat
                </span>
              )}
            </div>
            {c.company && (
              <p className="text-[14px] font-medium" style={{ color: "var(--color-text-muted)" }}>{c.company}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMergeOpen(true)}
              className="flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all hover:opacity-80"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              <Merge className="h-3.5 w-3.5" />
              Merge Duplicate
            </button>
            {isSdr && (
              <button
                onClick={() => setAddLeadOpen(true)}
                className="flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all hover:opacity-80 active:scale-[0.97]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Lead
              </button>
            )}
            <button
              onClick={() => router.push(newQuoteUrlFromCustomer(c))}
              className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all hover:opacity-80 active:scale-[0.97]"
              style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
            >
              <FilePlus className="h-3.5 w-3.5" />
              Add Quote
            </button>
            <button
              onClick={() => setTaxExemptModalOpen(true)}
              className="flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all hover:opacity-80"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
            >
              <ScrollText className="h-3.5 w-3.5" />
              See more
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all hover:opacity-80"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
        </div>

        {/* Contact fields grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-1" style={{ color: "var(--color-text-muted)" }}>Company</p>
            <p className="text-[13px] font-medium" style={{ color: c.company ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
              {c.company || "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-1" style={{ color: "var(--color-text-muted)" }}>Phone</p>
            {c.phone
              ? <a href={`tel:${c.phone}`} className="text-[13px] hover:opacity-70 transition-opacity" style={{ color: "var(--color-text-primary)" }}>{formatPhone(c.phone)}</a>
              : <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>—</p>}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-1" style={{ color: "var(--color-text-muted)" }}>Email</p>
            {c.email
              ? <a href={`mailto:${c.email}`} className="text-[13px] break-all hover:opacity-70 transition-opacity" style={{ color: "var(--color-text-primary)" }}>{c.email}</a>
              : <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>—</p>}
          </div>
          {[
            { label: "Industry", value: lookupLabel(industries, c.industry, "—") },
            { label: "Decision Maker", value: authorityLabel(c.authority) },
            { label: "Website", value: c.website },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</p>
              <p className="text-[13px]" style={{ color: value ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                {value || "—"}
              </p>
            </div>
          ))}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-1" style={{ color: "var(--color-text-muted)" }}>Total Leads</p>
            <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{lead_count}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-1" style={{ color: "var(--color-text-muted)" }}>Customer Since</p>
            <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>{new Date(c.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Quotes & Orders */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--color-text-muted)" }}>
          Quotes &amp; Orders
          {tickets.length > 0 && (
            <span className="ml-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold normal-case tracking-normal"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
              {tickets.length}
            </span>
          )}
        </h2>

        {tickets.length === 0 ? (
          <div className="rounded-[10px] border p-8 text-center"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No quotes or orders yet.</p>
          </div>
        ) : (
          <div className="rounded-[10px] border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            {tickets.map((t, idx) => (
              <div
                key={t.id}
                onClick={() => router.push(quoteDetailPath(t))}
                className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer transition-colors hover:opacity-80"
                style={{
                  background: "var(--color-surface)",
                  borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {t.ticket_kind === "order"
                    ? <Package className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
                    : <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-muted)" }} />
                  }
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                      {t.title || "Untitled"}
                      {t.rush && <span className="ml-1.5 text-[10px]" style={{ color: "var(--color-accent)" }}>⚡ Rush</span>}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {t.reference_code ? `${t.reference_code} · ` : ""}
                      {relativeTime(t.created_at)}
                      {(() => {
                        const src = ticketSource(t, sourceLabels);
                        return src ? ` · Source: ${src}` : "";
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {t.quote_final_total != null && (
                    <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      ${t.quote_final_total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
                    style={{
                      background: t.ticket_status === "approved" ? "var(--color-success-bg)"
                        : t.ticket_status === "cancelled" ? "var(--color-danger-bg)"
                        : t.ticket_status === "sent" ? "var(--color-info-bg)"
                        : "var(--color-neutral-bg)",
                      color: t.ticket_status === "approved" ? "var(--color-success)"
                        : t.ticket_status === "cancelled" ? "var(--color-danger)"
                        : t.ticket_status === "sent" ? "var(--color-info-text)"
                        : "var(--color-neutral-text)",
                    }}
                  >
                    {t.ticket_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit modal */}
      {editOpen && (
        <EditCustomerModal
          customer={c}
          industries={industries}
          onClose={() => setEditOpen(false)}
          onSaved={handleCustomerSaved}
        />
      )}

      {/* Merge modal */}
      {mergeOpen && (
        <MergeCustomerModal
          source={c}
          onClose={() => setMergeOpen(false)}
          onMerged={handleMerged}
        />
      )}

      {isSdr && (
        <AddLeadModal
          open={addLeadOpen}
          lookups={leadLookups}
          linkedCustomer={c as AppCustomer}
          onClose={() => setAddLeadOpen(false)}
          onCreated={handleLeadCreated}
          showToast={showToast}
        />
      )}

      <CustomerTaxExemptModal
        customerId={customerId}
        open={taxExemptModalOpen}
        onClose={() => setTaxExemptModalOpen(false)}
      />

      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
