"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit2, X, Merge, Search, AlertTriangle, FileText, Package, FilePlus } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { formatPhone, validatePhone } from "@/lib/utils/phone";
import { validateEmail } from "@/lib/utils/email";
import { quoteDetailPath } from "@/lib/utils/reference-codes";
import { newQuoteUrlFromCustomer } from "@/lib/utils/new-quote-from-customer";
import { authorityLabel } from "@/lib/utils/authority";
import { lookupLabel } from "@/lib/utils/lookups";
import { LeadHistoryTable } from "@/components/leads/lead-history-table";
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

interface LeadSummary {
  id: string;
  status: string;
  sales_status: string | null;
  source: string | null;
  urgency: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  tickets?: {
    id: string;
    reference_code: string | null;
    ticket_kind: string | null;
    ticket_status: string | null;
  }[];
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

interface ProfileData {
  customer: Customer;
  leads: LeadSummary[];
  lead_count: number;
  customer_status: "new" | "known" | "returning";
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

  async function handleSave() {
    const pErr = form.phone.trim() ? validatePhone(form.phone) : null;
    const eErr = form.email.trim() ? validateEmail(form.email) : null;
    setPhoneError(pErr);
    setEmailError(eErr);
    if (pErr || eErr) return;

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
        website: form.website || null,
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
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] p-6 shadow-2xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Edit Customer</h2>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>First Name</label>
            <input className={inputCls} style={inputStyle} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="First name" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Last Name</label>
            <input className={inputCls} style={inputStyle} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} placeholder="Last name" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Phone</label>
            <PhoneInput value={form.phone} onChange={(v) => { setForm((f) => ({ ...f, phone: v })); setPhoneError(null); }} error={phoneError} />
          </div>
          <div>
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
          <div className="col-span-2">
            <label className={labelCls} style={labelStyle}>Website / Social</label>
            <input className={inputCls} style={inputStyle} value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://" />
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

// ─── Merge Duplicate Modal ────────────────────────────────────────────────────

interface MergeCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
}

function MergeModal({
  source,
  onClose,
  onMerged,
}: {
  source: Customer;
  onClose: () => void;
  onMerged: (survivingId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MergeCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MergeCustomer | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearching(false);
      // Exclude the current customer from results
      setResults((data.customers ?? []).filter((c: MergeCustomer) => c.id !== source.id));
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, source.id]);

  async function handleMerge() {
    if (!selected) return;
    setMerging(true);
    setError("");
    const res = await fetch(`/api/customers/${source.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: selected.id }),
    });
    const data = await res.json();
    setMerging(false);
    if (!res.ok) { setError(data.error ?? "Merge failed."); return; }
    onMerged(data.surviving_id);
  }

  const sourceName = [source.first_name, source.last_name].filter(Boolean).join(" ") || "This customer";
  const targetName = selected ? ([selected.first_name, selected.last_name].filter(Boolean).join(" ") || "Selected customer") : "";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] p-6 shadow-2xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Merge Duplicate Customer
          </h2>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}><X className="h-4 w-4" /></button>
        </div>

        {!confirmed ? (
          <>
            <p className="text-[13px] mb-4" style={{ color: "var(--color-text-muted)" }}>
              Search for the customer to keep. All leads from <strong style={{ color: "var(--color-text-primary)" }}>{sourceName}</strong> will be moved to the customer you select, then this record will be deleted.
            </p>

            {/* Search input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
              <input
                className="w-full h-9 rounded-[6px] border pl-9 pr-3 text-sm outline-none"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                placeholder="Search by name, phone, or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
                autoFocus
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  Searching…
                </span>
              )}
            </div>

            {/* Results list */}
            {results.length > 0 && (
              <div className="rounded-[8px] border overflow-hidden mb-4" style={{ borderColor: "var(--color-border)" }}>
                {results.slice(0, 6).map((c, idx) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
                  const isSelected = selected?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(c)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors"
                      style={{
                        background: isSelected ? "var(--color-row-hover)" : idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{name}</p>
                        <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
                          {[c.company, c.phone, c.email].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5" style={{ background: "var(--color-accent)", color: "var(--color-btn-primary-text)" }}>
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {search.length >= 2 && !searching && results.length === 0 && (
              <p className="text-[12px] mb-4" style={{ color: "var(--color-text-muted)" }}>No other customers found.</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => setConfirmed(true)}
                disabled={!selected}
                className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-40"
                style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Confirmation step */}
            <div
              className="flex items-start gap-3 rounded-[8px] border p-4 mb-5"
              style={{ background: "var(--color-warning-bg)", borderColor: "var(--color-warning-border)" }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--color-warning-text-deep)" }} />
              <p className="text-[13px]" style={{ color: "var(--color-warning-text-deep)" }}>
                All leads from <strong>{sourceName}</strong> will be moved to <strong>{targetName}</strong> and this record will be permanently deleted. This cannot be undone.
              </p>
            </div>

            {error && <p className="text-[12px] font-medium mb-3" style={{ color: "var(--color-danger)" }}>{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmed(false)}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                Back
              </button>
              <button
                onClick={handleMerge}
                disabled={merging}
                className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
                style={{ background: "var(--color-danger)", color: "var(--color-text-inverse)" }}
              >
                {merging ? "Merging…" : "Merge & Delete This Record"}
              </button>
            </div>
          </>
        )}
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
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [sourceLabels, setSourceLabels] = useState<Record<string, string>>({});
  const [industries, setIndustries] = useState<LookupOption[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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
  }

  function handleMerged(survivingId: string) {
    setMergeOpen(false);
    showToast("Customers merged successfully.");
    // Navigate to the surviving customer profile after a short delay
    setTimeout(() => router.push(`/crm/customers/${survivingId}`), 1200);
  }

  if (loading) return <ProfileSkeleton />;
  if (!data) return (
    <div className="py-24 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
      Customer not found.
    </div>
  );

  const { customer: c, leads, lead_count, customer_status } = data;
  const statusStyle = CUSTOMER_STATUS_STYLE[customer_status];

  return (
    <div className="space-y-6">

      {/* Back button */}
      <button
        onClick={() => router.push("/crm")}
        className="flex items-center gap-1.5 text-[13px] font-medium transition-opacity hover:opacity-70"
        style={{ color: "var(--color-text-muted)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to CRM
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
            <button
              onClick={() => router.push(newQuoteUrlFromCustomer(c))}
              className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all hover:opacity-80 active:scale-[0.97]"
              style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
            >
              <FilePlus className="h-3.5 w-3.5" />
              Add Quote
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

      <LeadHistoryTable
        leads={leads}
        sourceLabels={sourceLabels}
      />

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
        <MergeModal
          source={c}
          onClose={() => setMergeOpen(false)}
          onMerged={handleMerged}
        />
      )}

      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
