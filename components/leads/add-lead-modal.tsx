"use client";

import { useState, useEffect, useRef } from "react";
import { User, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Customer, Lead, LookupMap } from "@/lib/types";
import { formatPhone, validatePhone } from "@/lib/utils/phone";
import { validateEmail } from "@/lib/utils/email";
import { normalizeWebsite, validateWebsite, WEBSITE_FIELD_PLACEHOLDER } from "@/lib/utils/website";
import { scrollToFormField } from "@/lib/utils/scroll-field-into-view";

export interface AddLeadModalProps {
  open: boolean;
  lookups: LookupMap;
  onClose: () => void;
  onCreated: (lead: Lead) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
  /** Pre-link customer from CRM profile — skips phone dedup lookup. */
  linkedCustomer?: Customer | null;
}

const AUTHORITY_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const URGENCY_NOT_DEFINED = { value: "not_defined", label: "Not Defined" };

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
  sdr_comment: string;
}

const EMPTY_FORM: AddForm = {
  phone: "", email: "", first_name: "", last_name: "",
  source: "", authority: "", company: "", industry: "",
  website: "", urgency: "", is_returning_customer: false,
  sdr_comment: "",
};

interface ProductInterestRow {
  product: string;
  quantity: string;
  has_design: boolean;
}

function formFromCustomer(customer: Customer): AddForm {
  return {
    phone: (customer.phone ?? "").replace(/\D/g, ""),
    email: customer.email ?? "",
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    company: customer.company ?? "",
    industry: customer.industry ?? "",
    website: customer.website ?? "",
    authority: customer.authority ?? "",
    source: "",
    urgency: "",
    is_returning_customer: true,
    sdr_comment: "",
  };
}

export function AddLeadModal({
  open,
  lookups,
  onClose,
  onCreated,
  showToast,
  linkedCustomer = null,
}: AddLeadModalProps) {
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [industryError, setIndustryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productRows, setProductRows] = useState<ProductInterestRow[]>([]);

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

  // Customer dedup state
  const [lookingUp, setLookingUp] = useState(false);
  const [matchedCustomers, setMatchedCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showPickModal, setShowPickModal] = useState(false);
  const [dedupBanner, setDedupBanner] = useState<"single" | "none">("none");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function failField(
    anchor: string,
    setFieldError: (msg: string | null) => void,
    message: string,
  ) {
    setFieldError(message);
    scrollToFormField(formRef, anchor);
  }

  function reset() {
    setForm(linkedCustomer ? formFromCustomer(linkedCustomer) : EMPTY_FORM);
    setPhoneError(null);
    setEmailError(null);
    setWebsiteError(null);
    setFirstNameError(null);
    setSourceError(null);
    setIndustryError(null);
    setError(null);
    setProductRows([]);
    setMatchedCustomers([]);
    setSelectedCustomer(linkedCustomer);
    setDedupBanner("none");
    setShowPickModal(false);
  }

  useEffect(() => {
    if (!open) return;
    reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linkedCustomer?.id]);

  function addProductRow() {
    setProductRows((rows) => [...rows, { product: "", quantity: "", has_design: false }]);
  }

  function updateProductRow(idx: number, patch: Partial<ProductInterestRow>) {
    setProductRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeProductRow(idx: number) {
    setProductRows((rows) => rows.filter((_, i) => i !== idx));
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Phone-based customer lookup with 600ms debounce (skipped when customer is pre-linked)
  useEffect(() => {
    if (linkedCustomer) return;
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
  }, [form.phone, linkedCustomer]);

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
      authority: c.authority ?? f.authority,
    }));
    setDedupBanner("none");
  }

  function clearCustomerSelection() {
    if (linkedCustomer) return;
    setSelectedCustomer(null);
    setDedupBanner("none");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFirstNameError(null);
    setSourceError(null);
    setIndustryError(null);

    const phoneErr = validatePhone(form.phone);
    if (phoneErr) { failField("phone", setPhoneError, phoneErr); return; }
    setPhoneError(null);

    const eErr = form.email.trim() ? validateEmail(form.email) : null;
    if (eErr) { failField("email", setEmailError, eErr); return; }
    setEmailError(null);

    const wErr = validateWebsite(form.website);
    if (wErr) { failField("website", setWebsiteError, wErr); return; }
    setWebsiteError(null);

    if (!form.first_name.trim()) {
      failField("firstName", setFirstNameError, "First name is required.");
      return;
    }
    if (!form.source) {
      failField("source", setSourceError, "Source is required.");
      return;
    }
    if (!form.industry) {
      failField("industry", setIndustryError, "Industry is required.");
      return;
    }

    setSaving(true);
    const validRows = productRows.filter((r) => r.product.trim() !== "");
    const interests = Object.fromEntries(validRows.map((r) => [r.product, true]));
    const quantities = Object.fromEntries(validRows.map((r) => [r.product, r.quantity]));
    const has_design = Object.fromEntries(validRows.map((r) => [r.product, r.has_design]));

    const res = await fetch("/api/leads/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        website: normalizeWebsite(form.website),
        interests,
        quantities,
        has_design,
        customer_id: selectedCustomer?.id ?? null,
        create_customer: !selectedCustomer,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      const msg = data.error ?? "Failed to create lead.";
      if (msg === "Phone is required.") failField("phone", setPhoneError, msg);
      else if (msg === "First name is required.") failField("firstName", setFirstNameError, msg);
      else if (msg === "Source is required.") failField("source", setSourceError, msg);
      else if (msg === "Industry is required.") failField("industry", setIndustryError, msg);
      else if (msg.includes("website") || msg.includes("URL")) failField("website", setWebsiteError, msg);
      else setError(msg);
      return;
    }

    reset();
    onCreated(data.lead);
    showToast("Lead created.");
  }

  const sources = lookups.source ?? [];
  const industries = lookups.industry ?? [];
  const urgencyOptions = [URGENCY_NOT_DEFINED, ...(lookups.urgency ?? [])];

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
          </DialogHeader>

          {/* Dedup banner — single match */}
          {!linkedCustomer && dedupBanner === "single" && matchedCustomers[0] && (
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
              {!linkedCustomer && (
                <button
                  type="button"
                  onClick={clearCustomerSelection}
                  className="ml-auto"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          <form ref={formRef} noValidate onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Phone */}
            <div data-field-anchor="phone">
              <label className={labelCls} style={labelStyle}>Phone *</label>
              <PhoneInput
                value={form.phone}
                onChange={(digits) => setForm((f) => ({ ...f, phone: digits }))}
                error={phoneError}
                showAction
              />
            </div>

            {/* Email */}
            <div data-field-anchor="email">
              <label className={labelCls} style={labelStyle}>Email</label>
              <EmailInput
                value={form.email}
                onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setEmailError(null); }}
                error={emailError}
                showAction
              />
            </div>

            {/* First Name */}
            <div data-field-anchor="firstName">
              <label className={labelCls} style={labelStyle}>First Name *</label>
              <input
                className={inputCls}
                style={{
                  ...inputStyle,
                  borderColor: firstNameError ? "var(--color-danger)" : "var(--color-border)",
                }}
                value={form.first_name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, first_name: e.target.value }));
                  setFirstNameError(null);
                }}
                placeholder="First name"
                aria-invalid={!!firstNameError}
              />
              {firstNameError && (
                <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
                  {firstNameError}
                </p>
              )}
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
            <div data-field-anchor="source">
              <label className={labelCls} style={labelStyle}>Source *</label>
              <Select
                value={form.source}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, source: v ?? "" }));
                  setSourceError(null);
                }}
              >
                <SelectTrigger
                  className="h-9 text-sm w-full"
                  style={sourceError ? { borderColor: "var(--color-danger)" } : undefined}
                  aria-invalid={!!sourceError}
                >
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
              {sourceError && (
                <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
                  {sourceError}
                </p>
              )}
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
            <div data-field-anchor="industry">
              <label className={labelCls} style={labelStyle}>Industry *</label>
              <Select
                value={form.industry}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, industry: v ?? "" }));
                  setIndustryError(null);
                }}
              >
                <SelectTrigger
                  className="h-9 text-sm w-full"
                  style={industryError ? { borderColor: "var(--color-danger)" } : undefined}
                  aria-invalid={!!industryError}
                >
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
              {industryError && (
                <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
                  {industryError}
                </p>
              )}
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
                placeholder={WEBSITE_FIELD_PLACEHOLDER}
                aria-invalid={!!websiteError}
                aria-describedby={websiteError ? "add-lead-website-error" : undefined}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
                }}
              />
              {websiteError && (
                <p
                  id="add-lead-website-error"
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
              <Select value={form.urgency} onValueChange={(v) => setForm((f) => ({ ...f, urgency: v ?? "" }))}>
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

            {/* Product Interests — full width, row-based */}
            <div className="sm:col-span-2 space-y-2">
              <label className={labelCls} style={labelStyle}>Product Interests</label>

              {productRows.length > 0 && (
                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_100px_auto_28px] gap-2 items-center px-0.5">
                    <span className={labelCls} style={labelStyle}>Product</span>
                    <span className={labelCls} style={labelStyle}>Quantity</span>
                    <span className={labelCls} style={labelStyle}>Has Design</span>
                    <span />
                  </div>

                  {productRows.map((row, idx) => {
                    const selectedProducts = productRows
                      .filter((_, i) => i !== idx)
                      .map((r) => r.product)
                      .filter(Boolean);
                    const availableTypes = productTypes.filter(
                      (pt) => !selectedProducts.includes(pt.name)
                    );

                    return (
                      <div key={idx} className="grid grid-cols-[1fr_100px_auto_28px] gap-2 items-center">
                        {/* Product select */}
                        <Select
                          value={row.product}
                          onValueChange={(v) => updateProductRow(idx, { product: v ?? "" })}
                        >
                          <SelectTrigger className="h-9 text-sm w-full">
                            <SelectValue placeholder="Select product…">
                              {row.product || "Select product…"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {availableTypes.map((pt) => (
                              <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Quantity */}
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.quantity}
                          onChange={(e) =>
                            updateProductRow(idx, {
                              quantity: e.target.value.replace(/[^0-9]/g, "").replace(/^0+([1-9])/, "$1"),
                            })
                          }
                          placeholder="0"
                          className={inputCls}
                          style={inputStyle}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-accent)";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-border)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        />

                        {/* Has Design toggle */}
                        <button
                          type="button"
                          onClick={() => updateProductRow(idx, { has_design: !row.has_design })}
                          className="flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap"
                          style={
                            row.has_design
                              ? {
                                  background: "var(--color-badge-bg)",
                                  borderColor: "var(--color-tab-underline)",
                                  color: "var(--color-tab-active)",
                                }
                              : {
                                  background: "var(--color-surface)",
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text-muted)",
                                }
                          }
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              background: row.has_design
                                ? "var(--color-tab-active)"
                                : "var(--color-text-muted)",
                            }}
                          />
                          {row.has_design ? "Yes" : "No"}
                        </button>

                        {/* Remove row */}
                        <button
                          type="button"
                          onClick={() => removeProductRow(idx)}
                          className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors"
                          style={{ color: "var(--color-text-muted)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-danger)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
                          aria-label="Remove product interest"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add row button */}
              <button
                type="button"
                onClick={addProductRow}
                disabled={productTypes.length > 0 && productRows.filter(r => r.product).length >= productTypes.length}
                className="flex items-center gap-1.5 rounded-[6px] border border-dashed px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-muted)",
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Product Interest
              </button>
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
      {!linkedCustomer && showPickModal && (
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
