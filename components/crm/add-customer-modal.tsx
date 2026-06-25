"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validatePhone } from "@/lib/utils/phone";
import { validateEmail } from "@/lib/utils/email";
import { normalizeWebsite, validateWebsite, WEBSITE_FIELD_PLACEHOLDER } from "@/lib/utils/website";
import { scrollToFormField } from "@/lib/utils/scroll-field-into-view";

import type { LookupOption } from "@/components/quotes/shared/types";

const AUTHORITY_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const HEAT_TAG_OPTIONS = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

/** Isolates modal fields from list search so Chrome autofill does not cross-fill. */
const AC = "section-bazaar-add-customer";

import { labelCls, labelStyle, inputCls, inputStyle } from "@/lib/utils/form-field-styles";
import { reportApiError } from "@/lib/utils/report-api-error";

interface CustomerForm {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  company: string;
  industry: string;
  website: string;
  authority: string;
  heat_tag: string;
}

const EMPTY_FORM: CustomerForm = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  company: "",
  industry: "",
  website: "",
  authority: "",
  heat_tag: "",
};

export function AddCustomerModal({
  open,
  industries,
  onClose,
  onCreated,
}: {
  open: boolean;
  industries: LookupOption[];
  onClose: () => void;
  onCreated: (customerId: string) => void;
}) {
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [industryError, setIndustryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setPhoneError(null);
    setEmailError(null);
    setWebsiteError(null);
    setIndustryError(null);
    setError(null);
    setSaving(false);
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    setError(null);

    const pErr = !form.phone.trim() ? "Phone is required." : validatePhone(form.phone);
    const eErr = form.email.trim() ? validateEmail(form.email) : null;
    const iErr = !form.industry ? "Industry is required." : null;
    const wErr = validateWebsite(form.website);

    setPhoneError(pErr);
    setEmailError(eErr);
    setIndustryError(iErr);
    setWebsiteError(wErr);

    if (pErr || eErr || iErr || wErr) {
      // Scroll to the first field with an error (top-to-bottom order)
      if (pErr) scrollToFormField(formRef, "phone");
      else if (eErr) scrollToFormField(formRef, "email");
      else if (iErr) scrollToFormField(formRef, "industry");
      else if (wErr) scrollToFormField(formRef, "website");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name.trim() || null,
          last_name: form.last_name.trim() || null,
          phone: form.phone,
          email: form.email.trim() || null,
          company: form.company.trim() || null,
          industry: form.industry || null,
          website: form.website.trim() ? normalizeWebsite(form.website) : null,
          authority: form.authority || null,
          heat_tag: form.heat_tag || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to create customer.";
        setError(msg);
        reportApiError(msg, res, "AddCustomerModal");
        return;
      }
      onCreated(data.customer.id as string);
      onClose();
    } catch (err) {
      const msg = "Network error — please try again.";
      setError(msg);
      reportApiError(msg, { status: 0, url: "/api/customers" }, "AddCustomerModal", { originalError: String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[520px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-[12px] p-6 shadow-2xl overflow-y-auto"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        role="dialog"
        aria-labelledby="add-customer-title"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="add-customer-title" className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Add Customer
          </h2>
          <button type="button" onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          id="add-customer-form"
          ref={formRef}
          className="grid grid-cols-2 gap-3"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <div>
            <label className={labelCls} style={labelStyle}>First Name</label>
            <input
              className={inputCls}
              style={inputStyle}
              name="bazaar-add-customer-given-name"
              autoComplete={`${AC} given-name`}
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              placeholder="First name"
            />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Last Name</label>
            <input
              className={inputCls}
              style={inputStyle}
              name="bazaar-add-customer-family-name"
              autoComplete={`${AC} family-name`}
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              placeholder="Last name"
            />
          </div>
          <div data-field-anchor="phone">
            <label className={labelCls} style={labelStyle}>Phone *</label>
            <PhoneInput
              name="bazaar-add-customer-tel"
              autoComplete={`${AC} tel`}
              value={form.phone}
              onChange={(v) => { setForm((f) => ({ ...f, phone: v })); setPhoneError(null); }}
              error={phoneError}
            />
          </div>
          <div data-field-anchor="email">
            <label className={labelCls} style={labelStyle}>Email</label>
            <EmailInput
              name="bazaar-add-customer-email"
              autoComplete={`${AC} email`}
              value={form.email}
              onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setEmailError(null); }}
              error={emailError}
            />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Company</label>
            <input
              className={inputCls}
              style={inputStyle}
              name="bazaar-add-customer-organization"
              autoComplete={`${AC} organization`}
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              placeholder="Company name"
            />
          </div>
          <div data-field-anchor="industry">
            <label className={labelCls} style={labelStyle}>Industry *</label>
            <div
              className="rounded-lg"
              style={industryError ? { outline: "1.5px solid var(--color-danger)", outlineOffset: "0px", borderRadius: "8px" } : undefined}
            >
              <Select
                value={form.industry}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, industry: v ?? "" }));
                  setIndustryError(null);
                }}
              >
                <SelectTrigger className="h-9 text-sm w-full" aria-invalid={!!industryError}>
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
            {industryError && (
              <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
                {industryError}
              </p>
            )}
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
                {AUTHORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Heat Tag</label>
            <Select value={form.heat_tag} onValueChange={(v) => setForm((f) => ({ ...f, heat_tag: v ?? "" }))}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="Select…">
                  {HEAT_TAG_OPTIONS.find((o) => o.value === form.heat_tag)?.label ?? "Select…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {HEAT_TAG_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
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
              name="bazaar-add-customer-url"
              autoComplete={`${AC} url`}
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
        </form>

        {error && (
          <p className="mt-3 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-customer-form"
            disabled={saving}
            className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            {saving ? "Saving…" : "Add Customer"}
          </button>
        </div>
      </div>
    </>
  );
}
