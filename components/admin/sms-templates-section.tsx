"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RotateCcw, Save, X } from "lucide-react";
import {
  SMS_TEMPLATE_GROUPS,
  type SmsPlaceholderKey,
  type SmsTemplateKey,
} from "@/lib/integrations/sms-template-catalog";

type TemplateRow = {
  key: SmsTemplateKey;
  label: string;
  description: string;
  group: (typeof SMS_TEMPLATE_GROUPS)[number]["id"];
  placeholders: SmsPlaceholderKey[];
  defaultBody: string;
  body: string;
  isCustom: boolean;
};

const PLACEHOLDER_LABELS: Record<SmsPlaceholderKey, string> = {
  firstName: "Customer first name",
  companyName: "Company name",
  ref: "Order / quote reference",
  total: "Formatted total (USD)",
  link: "Customer portal link",
  amount: "Payment amount confirmed",
  pickupBlock: 'Pickup address line (e.g. " Pick up at: …")',
  phoneBlock: 'Support phone line (e.g. " Questions? Call …")',
};

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
      <button type="button" onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SmsTemplatesSection() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [draft, setDraft] = useState<Record<SmsTemplateKey, string>>({} as Record<SmsTemplateKey, string>);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/sms-templates");
    const data = await res.json();
    if (!res.ok) {
      setToast({ message: data.error ?? "Failed to load templates", type: "error" });
      setLoading(false);
      return;
    }
    const rows = data.templates as TemplateRow[];
    setTemplates(rows);
    setDraft(Object.fromEntries(rows.map((t) => [t.key, t.body])) as Record<SmsTemplateKey, string>);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = templates.some((t) => (draft[t.key] ?? "") !== t.body);

  function setBody(key: SmsTemplateKey, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function restoreDefault(key: SmsTemplateKey) {
    const def = templates.find((t) => t.key === key);
    if (def) setBody(key, def.defaultBody);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/admin/sms-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templates: draft }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setToast({ message: data.error ?? "Save failed", type: "error" });
      return;
    }
    setToast({ message: "SMS templates saved", type: "success" });
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-[10px]"
            style={{ background: "var(--color-row-alt)" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start gap-2.5">
        <div
          className="h-8 w-8 shrink-0 rounded-[8px] flex items-center justify-center"
          style={{ background: "var(--color-badge-bg)" }}
        >
          <MessageSquare className="h-4 w-4" style={{ color: "var(--color-badge-text)" }} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            SMS Templates
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Edit the text sent via Twilio SMS and WhatsApp. Use placeholders in curly braces — they are
            replaced when a message is sent. Resubmit requests always use these templates (staff choose
            channel and recipient only).
          </p>
        </div>
      </div>

      <div
        className="rounded-[10px] border px-4 py-3 text-[13px]"
        style={{
          background: "var(--color-info-bg)",
          borderColor: "var(--color-info-border)",
          color: "var(--color-info-text-deep)",
        }}
      >
        <p className="font-medium" style={{ color: "var(--color-info-text)" }}>
          Placeholders
        </p>
        <p className="mt-1">
          Keep messages concise (carrier limits apply). Required placeholders per template are listed
          under each field — do not remove them unless you intentionally change the wording.
        </p>
      </div>

      {SMS_TEMPLATE_GROUPS.map((group) => {
        const items = templates.filter((t) => t.group === group.id);
        if (items.length === 0) return null;

        return (
          <section key={group.id} className="space-y-4">
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              {group.label}
            </h3>

            {items.map((t) => {
              const body = draft[t.key] ?? "";
              const charCount = body.length;

              return (
                <div
                  key={t.key}
                  className="rounded-[10px] border p-4 space-y-3"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {t.label}
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        {t.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreDefault(t.key)}
                      className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium transition-opacity hover:opacity-80"
                      style={{ color: "var(--color-tab-active)" }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset default
                    </button>
                  </div>

                  <textarea
                    value={body}
                    onChange={(e) => setBody(t.key, e.target.value)}
                    rows={3}
                    className="w-full rounded-md border px-3 py-2 text-sm resize-y min-h-[72px] transition-[border-color,box-shadow] focus:outline-none"
                    style={{
                      background: "var(--color-surface)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-accent)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {t.placeholders.map((ph) => (
                        <span
                          key={ph}
                          className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium"
                          style={{
                            background: "var(--color-badge-bg)",
                            color: "var(--color-badge-text)",
                          }}
                          title={PLACEHOLDER_LABELS[ph]}
                        >
                          {`{${ph}}`}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {charCount} characters
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      <div className="flex items-center gap-3 pb-4">
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            background: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save all templates"}
        </button>
        {!dirty && (
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No unsaved changes
          </span>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
