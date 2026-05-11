"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Search, RefreshCw, X, User, Clock, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { UrgencyPill } from "@/components/ui/urgency-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { StatusPill } from "@/components/ui/status-pill";
import { VerifyDrawer } from "@/components/verify-drawer";
import { Lead, Customer, LookupMap } from "@/lib/types";
import { holdReasonLabel } from "@/lib/constants/hold-reasons";
import { formatPhone } from "@/lib/utils/phone";
import { validatePhone } from "@/lib/utils/phone";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "all" | "hold" | "routed" | "rejected";

interface Toast {
  message: string;
  type: "success" | "error";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function displayName(lead: Lead): string {
  const c = lead.customer;
  const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
  return name || "—";
}

// ─── Toast ────────────────────────────────────────────────────────────────────

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
                className="h-4 animate-pulse rounded"
                style={{ width: j === 0 ? 120 : 80, background: "var(--color-border)" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Add Lead Modal ───────────────────────────────────────────────────────────

interface AddLeadModalProps {
  open: boolean;
  lookups: LookupMap;
  onClose: () => void;
  onCreated: (lead: Lead) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

const AUTHORITY_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const URGENCY_OPTIONS = [
  { value: "not_defined", label: "Not Defined" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const labelCls = "block text-[11px] font-medium uppercase tracking-[0.06em] mb-1";
const labelStyle = { color: "var(--color-text-muted)" };
const inputCls = "w-full h-9 rounded-[6px] border px-3 text-sm outline-none transition-all";
const inputStyle = {
  background: "var(--color-surface)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

interface AddForm {
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
  initial_interest: string;
  sdr_comment: string;
}

const EMPTY_FORM: AddForm = {
  phone: "", email: "", first_name: "", last_name: "",
  source: "", authority: "", company: "", industry: "",
  website: "", urgency: "", is_returning_customer: false,
  initial_interest: "", sdr_comment: "",
};

function AddLeadModal({ open, lookups, onClose, onCreated, showToast }: AddLeadModalProps) {
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Customer dedup state
  const [lookingUp, setLookingUp] = useState(false);
  const [matchedCustomers, setMatchedCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showPickModal, setShowPickModal] = useState(false);
  const [dedupBanner, setDedupBanner] = useState<"single" | "none">("none");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    setForm(EMPTY_FORM);
    setPhoneError(null);
    setError(null);
    setMatchedCustomers([]);
    setSelectedCustomer(null);
    setDedupBanner("none");
    setShowPickModal(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Phone-based customer lookup with 600ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const digits = form.phone;
    if (digits.length < 10) {
      setMatchedCustomers([]);
      setDedupBanner("none");
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLookingUp(true);
      const res = await fetch(`/api/customers/lookup?phone=${digits}`);
      const data = await res.json();
      setLookingUp(false);
      const customers: Customer[] = data.customers ?? [];
      setMatchedCustomers(customers);
      if (customers.length === 1) setDedupBanner("single");
      else if (customers.length > 1) setShowPickModal(true);
      else setDedupBanner("none");
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.phone]);

  function applyCustomer(c: Customer) {
    setSelectedCustomer(c);
    setForm((f) => ({
      ...f,
      first_name: c.first_name ?? f.first_name,
      last_name: c.last_name ?? f.last_name,
      email: c.email ?? f.email,
      company: c.company ?? f.company,
      industry: c.industry ?? f.industry,
      website: c.website ?? f.website,
    }));
    setDedupBanner("none");
  }

  function clearCustomerSelection() {
    setSelectedCustomer(null);
    setDedupBanner("none");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const phoneErr = validatePhone(form.phone);
    if (phoneErr) { setPhoneError(phoneErr); return; }
    setPhoneError(null);

    if (!form.first_name.trim()) { setError("First name is required."); return; }
    if (!form.source) { setError("Source is required."); return; }
    if (!form.industry) { setError("Industry is required."); return; }

    setSaving(true);
    const res = await fetch("/api/leads/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        initial_interest: form.initial_interest.trim() || null,
        customer_id: selectedCustomer?.id ?? null,
        create_customer: !selectedCustomer,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error ?? "Failed to create lead."); return; }

    reset();
    onCreated(data.lead);
    showToast("Lead created.");
  }

  const sources = lookups.source ?? [];
  const industries = lookups.industry ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
          </DialogHeader>

          {/* Dedup banner — single match */}
          {dedupBanner === "single" && matchedCustomers[0] && (
            <div
              className="flex items-center gap-3 rounded-[8px] border px-4 py-3"
              style={{ background: "var(--color-info-bg)", borderColor: "var(--color-info-border)" }}
            >
              <User className="h-4 w-4 shrink-0 text-blue-600" />
              <div className="flex-1 text-sm" style={{ color: "var(--color-info-text-deep)" }}>
                <strong>Existing customer found:</strong>{" "}
                {[matchedCustomers[0].first_name, matchedCustomers[0].last_name]
                  .filter(Boolean)
                  .join(" ") || "—"}
                {matchedCustomers[0].company ? ` — ${matchedCustomers[0].company}` : ""}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => applyCustomer(matchedCustomers[0])}
                  className="rounded-[6px] border border-blue-300 px-2.5 py-1 text-[12px] font-medium text-blue-700 hover:bg-blue-50"
                >
                  Use their info
                </button>
                <button
                  type="button"
                  onClick={clearCustomerSelection}
                  className="rounded-[6px] border border-blue-200 px-2.5 py-1 text-[12px] font-medium text-blue-500 hover:bg-blue-50"
                >
                  Continue new
                </button>
              </div>
            </div>
          )}

          {/* Selected customer chip */}
          {selectedCustomer && (
            <div
              className="flex items-center gap-2 rounded-[6px] border px-3 py-2 text-[13px]"
              style={{ background: "var(--color-success-bg)", borderColor: "var(--color-success-border)", color: "var(--color-success)" }}
            >
              <User className="h-3.5 w-3.5" />
              Linked to:{" "}
              {[selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(" ")}
              <button
                type="button"
                onClick={clearCustomerSelection}
                className="ml-auto"
                  style={{ color: "var(--color-text-muted)" }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Phone */}
            <div>
              <label className={labelCls} style={labelStyle}>Phone *</label>
              <PhoneInput
                value={form.phone}
                onChange={(digits) => setForm((f) => ({ ...f, phone: digits }))}
                error={phoneError}
                showAction
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelCls} style={labelStyle}>Email</label>
              <EmailInput
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                showAction
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
                placeholder="First name"
                required
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
                placeholder="Last name"
              />
            </div>

            {/* Source */}
            <div>
              <label className={labelCls} style={labelStyle}>Source *</label>
              <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v ?? "" }))}>
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="Select source…">
                    {sources.find((s) => s.value === form.source)?.label ?? "Select source…"}
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
              <Select value={form.authority} onValueChange={(v) => setForm((f) => ({ ...f, authority: v ?? "" }))}>
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
                placeholder="Company name"
              />
            </div>

            {/* Industry */}
            <div>
              <label className={labelCls} style={labelStyle}>Industry *</label>
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

            {/* Website */}
            <div>
              <label className={labelCls} style={labelStyle}>Website / Social</label>
              <input
                className={inputCls}
                style={inputStyle}
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://"
              />
            </div>

            {/* Urgency */}
            <div>
              <label className={labelCls} style={labelStyle}>Urgency</label>
              <Select value={form.urgency} onValueChange={(v) => setForm((f) => ({ ...f, urgency: v ?? "" }))}>
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="Select…">
                    {URGENCY_OPTIONS.find((u) => u.value === form.urgency)?.label ?? "Select…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {URGENCY_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Initial Interest — full width */}
            <div className="sm:col-span-2">
              <label className={labelCls} style={labelStyle}>Initial Interest</label>
              <input
                className={inputCls}
                style={inputStyle}
                value={form.initial_interest}
                onChange={(e) => setForm((f) => ({ ...f, initial_interest: e.target.value }))}
                placeholder="e.g. Labels, custom boxes for product launch…"
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

            {/* Returning customer — full width */}
            <div className="sm:col-span-2">
              <label
                className="flex items-center gap-2.5 cursor-pointer rounded-[6px] p-2.5 transition-colors"
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
                  className="rounded"
                />
                <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                  Returning Customer (Existing Client)
                </span>
              </label>
              <p className="mt-1 px-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                Set by SDR based on what the caller says. Once orders &amp; quotes are live this will be auto-derived from actual purchase history.
              </p>
            </div>

            {/* SDR Comment — full width */}
            <div className="sm:col-span-2">
              <label className={labelCls} style={labelStyle}>Verify Lead Comment</label>
              <textarea
                rows={3}
                value={form.sdr_comment}
                onChange={(e) => setForm((f) => ({ ...f, sdr_comment: e.target.value }))}
                placeholder="Add verification notes before opening Order / Quote…"
                className="w-full rounded-[6px] border px-3 py-2 text-sm outline-none resize-none"
                style={{
                  background: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {error && (
              <div className="sm:col-span-2">
                <p className="text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>
              </div>
            )}

            <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Lead"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Multiple-match picker modal */}
      {showPickModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="relative w-full max-w-[420px] rounded-[12px] border p-6 shadow-2xl"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <p className="text-[15px] font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
              {matchedCustomers.length} existing customers found
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
              Choose one to link, or add as a new contact.
            </p>
            <div className="space-y-2 mb-4">
              {matchedCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { applyCustomer(c); setShowPickModal(false); }}
                  className="w-full text-left rounded-[8px] border px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                >
                  <span className="font-medium">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </span>
                  {c.company && (
                    <span style={{ color: "var(--color-text-muted)" }}> — {c.company}</span>
                  )}
                  {c.phone && (
                    <span className="block text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {formatPhone(c.phone)}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => { clearCustomerSelection(); setShowPickModal(false); }}
                className="w-full text-left rounded-[8px] border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                + Add as new customer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main LeadsPage component ─────────────────────────────────────────────────

export function LeadsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [lookups, setLookups] = useState<LookupMap>({});

  // Drawer state
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerReadOnly, setDrawerReadOnly] = useState(false);
  const [drawerLockedBy, setDrawerLockedBy] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Reassign modal state (admin only)
  const [sdrList, setSdrList] = useState<{ id: string; full_name: string }[]>([]);
  const [reassignLead, setReassignLead] = useState<Lead | null>(null);
  const [reassignUserId, setReassignUserId] = useState<string>("unassign");
  const [reassigning, setReassigning] = useState(false);

  // Owner filter (SDR users only): "all" = unclaimed + mine, "mine" = only my leads
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");

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
      // sensible defaults: created → desc (newest), urgency → asc (High first)
      setSortDir(field === "urgency" ? "asc" : "desc");
    }
  }

  // Mobile cycling: newest → oldest → urgency high → (repeat)
  function cycleMobileSort() {
    if (sortField === "created" && sortDir === "desc") { setSortField("created"); setSortDir("asc"); }
    else if (sortField === "created" && sortDir === "asc") { setSortField("urgency"); setSortDir("asc"); }
    else { setSortField("created"); setSortDir("desc"); }
  }
  const mobileSortLabel =
    sortField === "urgency" ? "Urgency: High first" :
    sortDir === "asc"       ? "Oldest first"        : "Newest first";

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
        setIsAdmin(roleName === "admin");
      }
    });
  }, []);

  // Fetch active SDR list (admin only — used by reassign modal)
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/users?role=sdr")
      .then((r) => r.json())
      .then((d) => setSdrList(d.users ?? []));
  }, [isAdmin]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  // Load lookups once
  useEffect(() => {
    fetch("/api/lookups?categories=source,industry,hold_reason,reject_reason")
      .then((r) => r.json())
      .then((d) => setLookups(d));
  }, []);

  // ── Tab config ────────────────────────────────────────────────────────────

  const TAB_CONFIG: {
    id: Tab;
    label: string;
    status: string | null;
    statuses?: string[];
    scope?: string;
  }[] = [
    { id: "all", label: "All Leads", status: null, statuses: ["Pending", "Validated"] },
    { id: "hold", label: "On Hold", status: "On Hold", scope: "mine" },
    { id: "routed", label: "Directed to Sales", status: "Routed to Sales", scope: "mine" },
    { id: "rejected", label: "Rejected", status: "Rejected", scope: "mine" },
  ];

  // ── Fetch leads ───────────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const tabConf = TAB_CONFIG.find((t) => t.id === activeTab)!;
    const params = new URLSearchParams();
    if (tabConf.status) params.set("status", tabConf.status);
    if (tabConf.scope) params.set("scope", tabConf.scope);
    if (search) params.set("search", search);

    const res = await fetch(`/api/leads/workspace?${params}`);
    const data = await res.json();
    let fetched: Lead[] = data.leads ?? [];

    // For "all" tab, filter to active statuses client-side
    if (activeTab === "all" && tabConf.statuses) {
      fetched = fetched.filter((l) => tabConf.statuses!.includes(l.status));
    }

    setLeads(fetched);
    setLoading(false);
  }, [activeTab, search]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // ── Open drawer ───────────────────────────────────────────────────────────

  async function handleWorkLead(lead: Lead) {
    const res = await fetch(`/api/leads/${lead.id}/lock`, { method: "POST" });
    const data = await res.json();

    if (res.status === 409) {
      // Locked by another user — open read-only
      setDrawerLead(lead);
      setDrawerReadOnly(true);
      setDrawerLockedBy(data.locked_by?.full_name ?? "Another user");
    } else {
      setDrawerLead(lead);
      setDrawerReadOnly(false);
      setDrawerLockedBy(null);
    }
  }

  function handleViewLead(lead: Lead) {
    // Admin view — no lock acquired, opens read-only
    setDrawerLead(lead);
    setDrawerReadOnly(true);
    setDrawerLockedBy(null);
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

  // ─────────────────────────────────────────────────────────────────────────

  // Tab counts (fetched independently so all tabs show their number upfront)
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  function fetchCounts() {
    fetch("/api/leads/workspace/counts")
      .then((r) => r.json())
      .then((d) => { if (d.counts) setTabCounts(d.counts); });
  }

  useEffect(() => { fetchCounts(); }, []);

  // Refresh counts whenever the active tab's data reloads or a lead changes
  useEffect(() => {
    if (!loading) fetchCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Realtime-driven silent table refresh.
  // When the sidebar's leads subscription detects any change, this fires and
  // silently re-fetches the current tab's data without showing the loading skeleton.
  // If a drawer is open, we skip the refresh to avoid interrupting the user.
  useEffect(() => {
    function onLeadsChanged() {
      if (drawerLead) return;
      const tabConf = TAB_CONFIG.find((t) => t.id === activeTab);
      if (!tabConf) return;
      const params = new URLSearchParams();
      if (tabConf.status) params.set("status", tabConf.status);
      if (tabConf.scope) params.set("scope", tabConf.scope);
      if (search) params.set("search", search);
      fetch(`/api/leads/workspace?${params}`)
        .then((r) => r.json())
        .then((d) => {
          let fetched: Lead[] = d.leads ?? [];
          if (activeTab === "all" && tabConf.statuses) {
            fetched = fetched.filter((l) => tabConf.statuses!.includes(l.status));
          }
          setLeads(fetched);
        })
        .catch(() => {});
      fetchCounts();
    }
    window.addEventListener("bazaar:leads-changed", onLeadsChanged);
    return () => window.removeEventListener("bazaar:leads-changed", onLeadsChanged);
  }, [drawerLead, activeTab, search]);

  // Tabs
  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All Leads" },
    { id: "hold", label: "On Hold" },
    { id: "routed", label: "Directed to Sales" },
    { id: "rejected", label: "Rejected" },
  ];

  // Filtered leads (client-side search + owner filter)
  const searchFiltered = search
    ? leads.filter((l) => {
        const q = search.toLowerCase();
        const c = l.customer;
        return (
          c?.first_name?.toLowerCase().includes(q) ||
          c?.last_name?.toLowerCase().includes(q) ||
          c?.email?.toLowerCase().includes(q) ||
          c?.phone?.includes(q) ||
          c?.company?.toLowerCase().includes(q)
        );
      })
    : leads;

  // "My Leads" filter — SDR only, applied on All Leads tab only
  const ownerFiltered =
    activeTab === "all" && !isAdmin && ownerFilter === "mine"
      ? searchFiltered.filter((l) => l.locked_by_id === userId)
      : searchFiltered;

  // Client-side sort
  const URGENCY_ORDER: Record<string, number> = { High: 1, Medium: 2, Low: 3 };
  const filtered = [...ownerFiltered].sort((a, b) => {
    if (sortField === "urgency") {
      const ua = URGENCY_ORDER[a.urgency ?? ""] ?? 4;
      const ub = URGENCY_ORDER[b.urgency ?? ""] ?? 4;
      const primary = sortDir === "asc" ? ua - ub : ub - ua;
      if (primary !== 0) return primary;
      // tie-break: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // created
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDir === "asc" ? diff : -diff;
  });

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
          <Plus className="h-4 w-4 mr-1.5" />
          Add Lead
        </Button>
      </div>

      {/* Tab bar */}
      <div
        className="flex overflow-x-auto border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
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

      {/* Search + Owner filter + Refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1" style={{ maxWidth: 320 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* My Leads / All Leads toggle — SDR only, All Leads tab only */}
        {activeTab === "all" && !isAdmin && (
          <div
            className="flex rounded-[6px] overflow-hidden border text-[12px] font-medium"
            style={{ borderColor: "var(--color-border)" }}
          >
            {(["all", "mine"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setOwnerFilter(opt)}
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

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchLeads} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── All Leads tab ── */}
      {activeTab === "all" && (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {(["Name", "Company", "Source", "Initial Interest", "Phone", "Urgency", "Status", "Owner", "Created", "Action"] as const).map((h) => {
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
                  <TableSkeleton cols={10} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
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
                        {displayName(lead)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.company || "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {lead.source || "—"}
                      </td>
                      <td className="px-3 py-2.5 max-w-[160px]" style={{ color: "var(--color-text-muted)" }}>
                        <span className="block truncate" title={lead.initial_interest ?? undefined}>
                          {lead.initial_interest || "—"}
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
                              onClick={() => handleViewLead(lead)}
                              className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                            >
                              View
                            </button>
                            {lead.locked_by_id && (
                              <button
                                onClick={() => { setReassignLead(lead); setReassignUserId("unassign"); }}
                                className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                              >
                                Reassign
                              </button>
                            )}
                          </div>
                        ) : lead.locked_by_id === userId ? (
                          <button
                            onClick={() => handleWorkLead(lead)}
                            className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          >
                            View
                          </button>
                        ) : (
                          <button
                            onClick={() => handleWorkLead(lead)}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                          >
                            Claim
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
                      <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayName(lead)}</p>
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
                    {lead.customer?.phone && (
                      <div className="flex justify-between"><span>Phone</span><span className="normal-case tracking-normal">{formatPhone(lead.customer.phone)}</span></div>
                    )}
                    <div className="flex justify-between"><span>Source</span><span className="normal-case tracking-normal">{lead.source || "—"}</span></div>
                    {lead.initial_interest && (
                      <div className="flex justify-between gap-2">
                        <span className="shrink-0">Initial Interest</span>
                        <span className="normal-case tracking-normal text-right truncate max-w-[160px]">{lead.initial_interest}</span>
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
                        onClick={() => handleViewLead(lead)}
                        className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                      >
                        View
                      </button>
                      {lead.locked_by_id && (
                        <button
                          onClick={() => { setReassignLead(lead); setReassignUserId("unassign"); }}
                          className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                        >
                          Reassign
                        </button>
                      )}
                    </div>
                  ) : lead.locked_by_id === userId ? (
                    <button
                      onClick={() => handleWorkLead(lead)}
                      className="w-full rounded-[6px] border py-1.5 text-[13px] font-medium"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      View
                    </button>
                  ) : (
                    <button
                      onClick={() => handleWorkLead(lead)}
                      className="w-full rounded-[6px] py-1.5 text-[13px] font-medium"
                      style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                    >
                      Claim
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
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
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
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
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
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(lead)}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{holdReasonLabel(lead.hold_reason)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.hold_until ? new Date(lead.hold_until).toLocaleDateString() : "—"}
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
                            onClick={() => isAdmin ? handleViewLead(lead) : handleWorkLead(lead)}
                            className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          >
                            View
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
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayName(lead)}</p>
                    <StatusPill status="On Hold" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{holdReasonLabel(lead.hold_reason)}</span></div>
                    <div className="flex justify-between"><span>Until</span><span className="normal-case tracking-normal">{lead.hold_until ? new Date(lead.hold_until).toLocaleDateString() : "—"}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleResumeLead(lead)} className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium" style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}>Resume</button>
                    <button onClick={() => isAdmin ? handleViewLead(lead) : handleWorkLead(lead)} className="flex-1 rounded-[6px] border py-1.5 text-[13px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>View</button>
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
          {/* Desktop table */}
          <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Name", "Company", "Phone", "Sales Status", "Sales Rep", "Routed"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton cols={6} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No leads directed to sales.</td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      style={{
                        background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                    >
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>{displayName(lead)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {lead.customer?.phone ? formatPhone(lead.customer.phone) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {lead.sales_status
                          ? <StatusPill status={lead.sales_status} />
                          : <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Unclaimed</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-primary)" }}>
                        {(lead.sales_owner as { full_name?: string | null } | undefined)?.full_name ?? (
                          <span style={{ color: "var(--color-text-muted)" }}>—</span>
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
              <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>No leads directed to sales.</div>
            ) : (
              filtered.map((lead) => (
                <div key={lead.id} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayName(lead)}</p>
                      {lead.customer?.company && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer.company}</p>
                      )}
                    </div>
                    {lead.sales_status
                      ? <StatusPill status={lead.sales_status} />
                      : <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}>Unclaimed</span>}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    {lead.customer?.phone && (
                      <div className="flex justify-between"><span>Phone</span><span className="normal-case tracking-normal">{formatPhone(lead.customer.phone)}</span></div>
                    )}
                    <div className="flex justify-between">
                      <span>Sales Rep</span>
                      <span className="normal-case tracking-normal" style={{ color: "var(--color-text-primary)" }}>
                        {(lead.sales_owner as { full_name?: string | null } | undefined)?.full_name ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between"><span>Routed</span><span className="normal-case tracking-normal">{relativeTime(lead.updated_at)}</span></div>
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
                  {["Name", "Company", "Rejection Reason", "Rejected", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton cols={5} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No rejected leads.</td>
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
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(lead)}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text-muted)" }}>{lead.customer?.company || "—"}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{lead.rejection_reason || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>{relativeTime(lead.updated_at)}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => isAdmin ? handleViewLead(lead) : handleWorkLead(lead)} className="rounded-[6px] border px-2.5 py-1 text-[12px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>View</button>
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
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{displayName(lead)}</p>
                    <StatusPill status="Rejected" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                    <div className="flex justify-between"><span>Reason</span><span className="normal-case tracking-normal">{lead.rejection_reason || "—"}</span></div>
                  </div>
                  <button onClick={() => isAdmin ? handleViewLead(lead) : handleWorkLead(lead)} className="w-full rounded-[6px] border py-1.5 text-[13px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>View</button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Add Lead Modal */}
      <AddLeadModal
        open={addOpen}
        lookups={lookups}
        onClose={() => setAddOpen(false)}
        onCreated={(lead) => {
          setAddOpen(false);
          if (activeTab === "all") {
            setLeads((prev) => [lead, ...prev]);
          }
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
          onClose={() => setDrawerLead(null)}
          onLeadUpdated={(updated) => {
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

      {/* Reassign modal (admin only) */}
      <Dialog open={!!reassignLead} onOpenChange={(o) => { if (!o) setReassignLead(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reassign Lead</DialogTitle>
          </DialogHeader>
          {reassignLead && (
            <div className="space-y-4 pt-1">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {displayName(reassignLead)}
              </p>
              <div>
                <label
                  className="block text-[11px] font-medium uppercase tracking-[0.06em] mb-1.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Assign to SDR
                </label>
                <Select value={reassignUserId} onValueChange={(v) => setReassignUserId(v ?? "unassign")}>
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassign">— Unassign (remove from SDR)</SelectItem>
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
                <Button onClick={handleReassign} disabled={reassigning}>
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
    </div>
  );
}
