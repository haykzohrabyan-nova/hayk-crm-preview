"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, X } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { digitsOnly, validatePhone } from "@/lib/utils/phone";

// ─── Types ────────────────────────────────────────────────────────────────────

type CompanySettings = {
  id: number;
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  default_tax_rate: number;
  high_value_threshold: number;
  rush_surcharge_percent: number | null;
  session_idle_timeout_minutes: number;
  updated_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-start gap-3 rounded-[10px] px-4 py-3 shadow-lg text-[13px] font-medium max-w-sm"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeftWidth: "4px",
        borderLeftColor: type === "success" ? "var(--color-success)" : "var(--color-danger)",
        color: "var(--color-text-primary)",
      }}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-medium uppercase tracking-[0.06em] mb-1"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </label>
  );
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isValidUrl(v: string) {
  return /^https?:\/\/.+/.test(v);
}
// ZIP: 5 digits or ZIP+4 (90001 or 90001-1234)
function isValidZip(v: string) {
  return /^\d{5}(-\d{4})?$/.test(v);
}
// Strip anything that isn't a digit or dash
function sanitizeZip(v: string) {
  return v.replace(/[^\d-]/g, "").slice(0, 10);
}

function FieldInput({
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  inputMode,
  min,
  max,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  min?: number;
  max?: number;
  error?: string;
}) {
  return (
    <div>
      <input
        type={type}
        inputMode={inputMode}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          if (!error) {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "none";
          }
          onBlur?.();
        }}
        placeholder={placeholder}
        className="w-full rounded-[6px] border px-3 py-2 text-[13px] outline-none transition-colors"
        style={{
          borderColor: error ? "var(--color-danger)" : "var(--color-border)",
          background: "var(--color-bg)",
          color: "var(--color-text-primary)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = error ? "var(--color-danger)" : "var(--color-accent)";
          e.currentTarget.style.boxShadow = error
            ? "0 0 0 3px rgba(220,38,38,0.12)"
            : "0 0 0 3px rgba(232,201,122,0.18)";
        }}
      />
      {error && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--color-danger)" }}>{error}</p>
      )}
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="pt-2">
      <p
        className="text-[11px] font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompanySection() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [form, setForm] = useState<Partial<CompanySettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CompanySettings, string>>>({});
  // Separate string state for idle timeout so the field can be cleared while typing
  const [idleTimeoutRaw, setIdleTimeoutRaw] = useState<string>("");

  function setError(key: keyof CompanySettings, msg: string | undefined) {
    setErrors((e) => ({ ...e, [key]: msg }));
  }
  function validateEmail() {
    const v = form.email ?? "";
    if (v && !isValidEmail(v)) setError("email", "Enter a valid email address");
    else setError("email", undefined);
  }
  function validateWebsite() {
    const v = form.website ?? "";
    if (v && !isValidUrl(v)) setError("website", "Must start with http:// or https://");
    else setError("website", undefined);
  }
  function validateZip() {
    const v = form.zip ?? "";
    if (v && !isValidZip(v)) setError("zip", "Enter a valid ZIP (e.g. 90001 or 90001-1234)");
    else setError("zip", undefined);
  }
  const hasErrors = Object.values(errors).some(Boolean);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => setToast({ message, type }),
    []
  );

  useEffect(() => {
    fetch("/api/admin/company")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setForm(d.settings ?? {});
        setIdleTimeoutRaw(String(d.settings?.session_idle_timeout_minutes ?? 20));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function set(key: keyof CompanySettings, value: string | number | null) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    const newErrors: Partial<Record<keyof CompanySettings, string>> = {};
    const emailVal = form.email ?? "";
    if (emailVal && !isValidEmail(emailVal)) newErrors.email = "Enter a valid email address";
    const phoneVal = form.phone ?? "";
    const phoneErr = phoneVal ? validatePhone(phoneVal) : null;
    if (phoneErr) newErrors.phone = phoneErr;
    const websiteVal = form.website ?? "";
    if (websiteVal && !isValidUrl(websiteVal)) newErrors.website = "Must start with http:// or https://";
    const zipVal = form.zip ?? "";
    if (zipVal && !isValidZip(zipVal)) newErrors.zip = "Enter a valid ZIP (e.g. 90001 or 90001-1234)";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setSaving(true);
    const res = await fetch("/api/admin/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error, "error"); return; }
    setSettings(data.settings);
    setDirty(false);
    showToast("Company settings saved", "success");
  }

  function handleDiscard() {
    if (settings) {
      setForm(settings);
      setIdleTimeoutRaw(String(settings.session_idle_timeout_minutes ?? 20));
    }
    setDirty(false);
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 rounded-[6px] animate-pulse" style={{ background: "var(--color-row-alt)" }} />
        ))}
      </div>
    );
  }

  const s = form;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-6">
        <div
          className="h-8 w-8 rounded-[8px] flex items-center justify-center"
          style={{ background: "var(--color-badge-bg)" }}
        >
          <Building2 className="h-4 w-4" style={{ color: "var(--color-badge-text)" }} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Company Info
          </h2>
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Used in PDF headers, quote documents, and OrderDrawer defaults.
          </p>
        </div>
      </div>

      <div
        className="rounded-[10px] border p-5 space-y-4"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        {/* ── Branding ── */}
        <SectionDivider title="Branding" />

        <div>
          <FieldLabel>Company Name</FieldLabel>
          <FieldInput
            value={s.company_name ?? ""}
            onChange={(v) => set("company_name", v)}
            placeholder="e.g. BAZAARPRINTING"
          />
        </div>

        <div>
          <FieldLabel>Logo URL</FieldLabel>
          <FieldInput
            value={s.logo_url ?? ""}
            onChange={(v) => set("logo_url", v || null)}
            placeholder="https://… (shown in PDF header)"
          />
          {s.logo_url && (
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.logo_url}
                alt="Logo preview"
                className="h-10 rounded object-contain border"
                style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Preview</span>
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Website</FieldLabel>
          <FieldInput
            value={s.website ?? ""}
            onChange={(v) => set("website", v || null)}
            onBlur={validateWebsite}
            placeholder="https://bazaarprinting.com"
            error={errors.website}
          />
        </div>

        {/* ── Contact ── */}
        <SectionDivider title="Contact" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Phone</FieldLabel>
            <PhoneInput
              value={digitsOnly(s.phone ?? "")}
              onChange={(digits) => { set("phone", digits || null); setError("phone", undefined); }}
              showAction
              error={errors.phone}
            />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <EmailInput
              value={s.email ?? ""}
              onChange={(e) => { set("email", e.target.value || null); setError("email", undefined); }}
              onBlur={validateEmail}
              placeholder="info@bazaarprinting.com"
              error={errors.email}
              showAction
            />
          </div>
        </div>

        {/* ── Address ── */}
        <SectionDivider title="Address" />

        <div>
          <FieldLabel>Address Line 1</FieldLabel>
          <FieldInput
            value={s.address_line1 ?? ""}
            onChange={(v) => set("address_line1", v || null)}
            placeholder="Street address"
          />
        </div>

        <div>
          <FieldLabel>Address Line 2</FieldLabel>
          <FieldInput
            value={s.address_line2 ?? ""}
            onChange={(v) => set("address_line2", v || null)}
            placeholder="Suite, unit, floor (optional)"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <FieldLabel>City</FieldLabel>
            <FieldInput
              value={s.city ?? ""}
              onChange={(v) => set("city", v || null)}
              placeholder="Los Angeles"
            />
          </div>
          <div>
            <FieldLabel>State</FieldLabel>
            <FieldInput
              value={s.state ?? ""}
              onChange={(v) => set("state", v || null)}
              placeholder="CA"
            />
          </div>
          <div>
            <FieldLabel>ZIP</FieldLabel>
            <FieldInput
              inputMode="numeric"
              value={s.zip ?? ""}
              onChange={(v) => set("zip", sanitizeZip(v) || null)}
              onBlur={validateZip}
              placeholder="90001"
              error={errors.zip}
            />
          </div>
        </div>

        {/* ── Order / Quote Defaults ── */}
        <SectionDivider title="Order / Quote Defaults" />

        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          These values appear as defaults in the OrderDrawer. Reps can override the tax rate per quote.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Default Tax Rate (%)</FieldLabel>
            <FieldInput
              type="number"
              min={0}
              max={100}
              value={String(s.default_tax_rate ?? "")}
              onChange={(v) => set("default_tax_rate", parseFloat(v) || 0)}
              placeholder="8.25"
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              e.g. 8.25 = 8.25% sales tax
            </p>
          </div>

          <div>
            <FieldLabel>High-Value Threshold ($)</FieldLabel>
            <FieldInput
              type="number"
              value={String(s.high_value_threshold ?? "")}
              onChange={(v) => set("high_value_threshold", parseFloat(v) || 0)}
              placeholder="5000"
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              When SDR quote total exceeds this, they can only route to Sales — not send the quote.
            </p>
          </div>
        </div>

        <div>
          <FieldLabel>Rush Surcharge (%)</FieldLabel>
          <FieldInput
            type="number"
            min={0}
            max={100}
            value={s.rush_surcharge_percent != null ? String(s.rush_surcharge_percent) : ""}
            onChange={(v) => set("rush_surcharge_percent", v ? parseFloat(v) : null)}
            placeholder="Leave blank if rush is badge-only (no price impact)"
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            If blank, the Rush toggle on a ticket shows a badge only and does not affect the total.
          </p>
        </div>

        {/* ── Session & Security ── */}
        <SectionDivider title="Session & Security" />

        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          Users are automatically signed out after this many minutes of inactivity. A warning
          appears 2 minutes before sign-out. Sessions are logged and visible to admins.{" "}
          <a
            href="/policy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--color-accent)" }}
          >
            View privacy policy
          </a>
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Idle Sign-Out Timeout (minutes)</FieldLabel>
            <FieldInput
              type="number"
              value={idleTimeoutRaw}
              onChange={(v) => {
                setIdleTimeoutRaw(v);
                const n = parseInt(v);
                if (!isNaN(n)) {
                  set("session_idle_timeout_minutes", n);
                }
              }}
              onBlur={() => {
                const n = parseInt(idleTimeoutRaw);
                const clamped = isNaN(n) ? 20 : Math.min(480, Math.max(5, n));
                setIdleTimeoutRaw(String(clamped));
                set("session_idle_timeout_minutes", clamped);
              }}
              placeholder="20"
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Any value between 5 and 480 minutes (8 hours)
            </p>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <button
            onClick={handleSave}
            disabled={saving || !dirty || hasErrors}
            className="rounded-[6px] px-5 py-2 text-[13px] font-medium disabled:opacity-40 transition-opacity"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {dirty && (
            <button
              onClick={handleDiscard}
              className="rounded-[6px] px-4 py-2 text-[13px] border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              Discard
            </button>
          )}
          {!dirty && settings && (
            <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Last saved {new Date(settings.updated_at).toLocaleDateString("en-US")}
            </span>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
