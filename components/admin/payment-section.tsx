"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { validatePhone } from "@/lib/utils/phone";
import { validateEmail } from "@/lib/utils/email";

interface PayConfig {
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_routing_number: string;
  zelle_phone: string;
  zelle_email: string;
}

interface FieldErrors {
  zelle_phone?: string | null;
  zelle_email?: string | null;
}

const DEFAULTS: PayConfig = {
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_routing_number: "",
  zelle_phone: "",
  zelle_email: "",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-wider mb-3"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </p>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        className="block text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border px-3 py-2 text-sm transition-[border-color,box-shadow] focus:outline-none";
const inputStyle = {
  background: "var(--color-surface)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

function inputFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--color-accent)";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
}
function inputBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--color-border)";
  e.currentTarget.style.boxShadow = "none";
}

/** Strip all non-digit characters */
function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

export function PaymentSection() {
  const [cfg, setCfg] = useState<PayConfig>(DEFAULTS);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("company_settings")
      .select(
        "bank_name, bank_account_name, bank_account_number, bank_routing_number, zelle_phone, zelle_email",
      )
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) {
          setCfg({
            bank_name: data.bank_name ?? "",
            bank_account_name: data.bank_account_name ?? "",
            bank_account_number: data.bank_account_number ?? "",
            bank_routing_number: data.bank_routing_number ?? "",
            zelle_phone: data.zelle_phone ?? "",
            zelle_email: data.zelle_email ?? "",
          });
        }
        setLoading(false);
      });
  }, []);

  function validateFields(): FieldErrors {
    const errors: FieldErrors = {};
    // Only validate if the field has a value (both are optional)
    if (cfg.zelle_phone) {
      const err = validatePhone(cfg.zelle_phone);
      if (err) errors.zelle_phone = "Enter a valid 10-digit phone number.";
    }
    if (cfg.zelle_email) {
      const err = validateEmail(cfg.zelle_email);
      if (err) errors.zelle_email = err;
    }
    return errors;
  }

  async function handleSave() {
    const errors = validateFields();
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const { error: err } = await supabase
      .from("company_settings")
      .update({
        bank_name: cfg.bank_name || null,
        bank_account_name: cfg.bank_account_name || null,
        bank_account_number: cfg.bank_account_number || null,
        bank_routing_number: cfg.bank_routing_number || null,
        zelle_phone: cfg.zelle_phone || null,
        zelle_email: cfg.zelle_email || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setSaving(false);

    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse mt-2">
        {[200, 160, 240, 180].map((w) => (
          <div
            key={w}
            className="h-8 rounded-lg"
            style={{ width: w, background: "var(--color-border)" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-8 mt-2">

      {/* Bank / Wire & ACH Details */}
      <div>
        <SectionLabel>Bank / Wire &amp; ACH Details</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
          Shown to customers when Wire or ACH is selected as a payment channel on a quote.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank Name">
            <input
              type="text"
              placeholder="e.g. Chase Bank"
              value={cfg.bank_name}
              onChange={(e) => setCfg((p) => ({ ...p, bank_name: e.target.value }))}
              className={inputCls}
              style={inputStyle}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />
          </Field>
          <Field label="Account Name">
            <input
              type="text"
              placeholder="e.g. Bazaar Printing Inc"
              value={cfg.bank_account_name}
              onChange={(e) => setCfg((p) => ({ ...p, bank_account_name: e.target.value }))}
              className={inputCls}
              style={inputStyle}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />
          </Field>
          <Field label="Account Number">
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1234567890"
              value={cfg.bank_account_number}
              onChange={(e) =>
                setCfg((p) => ({ ...p, bank_account_number: digitsOnly(e.target.value) }))
              }
              className={inputCls}
              style={inputStyle}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />
          </Field>
          <Field label="Routing Number">
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 322271627"
              value={cfg.bank_routing_number}
              onChange={(e) =>
                setCfg((p) => ({
                  ...p,
                  bank_routing_number: digitsOnly(e.target.value).slice(0, 9),
                }))
              }
              className={inputCls}
              style={inputStyle}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />
          </Field>
        </div>
      </div>

      {/* Zelle Contact */}
      <div>
        <SectionLabel>Zelle Contact</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
          Fill one or both — all filled fields are shown to customers when Zelle is selected on a quote.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Zelle Phone">
            <PhoneInput
              value={cfg.zelle_phone}
              onChange={(digits) => {
                setCfg((p) => ({ ...p, zelle_phone: digits }));
                if (fieldErrors.zelle_phone) {
                  setFieldErrors((prev) => ({ ...prev, zelle_phone: null }));
                }
              }}
              error={fieldErrors.zelle_phone}
              placeholder="(747) 348-4444"
            />
          </Field>
          <Field label="Zelle Email">
            <EmailInput
              value={cfg.zelle_email}
              onChange={(e) => {
                setCfg((p) => ({ ...p, zelle_email: e.target.value }));
                if (fieldErrors.zelle_email) {
                  setFieldErrors((prev) => ({ ...prev, zelle_email: null }));
                }
              }}
              onBlur={() => {
                if (cfg.zelle_email) {
                  const err = validateEmail(cfg.zelle_email);
                  setFieldErrors((prev) => ({ ...prev, zelle_email: err }));
                }
              }}
              error={fieldErrors.zelle_email}
              placeholder="bazarprint@gmail.com"
              showAction
            />
          </Field>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p
          className="text-sm"
          role="alert"
          style={{ color: "var(--color-danger)" }}
        >
          {error}
        </p>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            background: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save Payment Settings"}
        </button>
        {saved && (
          <span className="text-sm" style={{ color: "var(--color-success)" }}>
            Saved successfully
          </span>
        )}
      </div>
    </div>
  );
}
