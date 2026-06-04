"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, RotateCcw, Save, X } from "lucide-react";
import {
  EMAIL_TEMPLATE_GROUPS,
  type EmailPlaceholderKey,
  type EmailTemplateKey,
} from "@/lib/integrations/email-template-catalog";

type TemplateRow = {
  key: EmailTemplateKey;
  label: string;
  description: string;
  group: (typeof EMAIL_TEMPLATE_GROUPS)[number]["id"];
  placeholders: EmailPlaceholderKey[];
  defaultSubject: string;
  defaultBody: string;
  defaultCtaLabel: string;
  subject: string;
  body: string;
  ctaLabel: string;
  isCustom: boolean;
};

type DraftRow = { subject: string; body: string; ctaLabel: string };

const PLACEHOLDER_LABELS: Record<EmailPlaceholderKey, string> = {
  firstName: "Customer first name",
  companyName: "Company name",
  ref: "Order / quote reference",
  link: "Customer portal or permit link",
  total: "Formatted order or quote total (e.g. $1,234.56)",
  amount: "Payment or order amount confirmed",
  statusLine: "Invoice link intro (filled automatically when resending portal link)",
  previousTotal: "Previous order total (tax-exempt total changed)",
  otpCode: "6-digit verification code (tax-exempt permit only)",
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

export function EmailTemplatesSection() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [draft, setDraft] = useState<Record<EmailTemplateKey, DraftRow>>(
    {} as Record<EmailTemplateKey, DraftRow>,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [dbAvailable, setDbAvailable] = useState(true);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/email-templates");
    const data = await res.json();
    if (!res.ok) {
      setToast({ message: data.error ?? "Failed to load templates", type: "error" });
      setLoading(false);
      return;
    }
    setDbAvailable(data.dbAvailable !== false);
    setMigrationHint(typeof data.migrationHint === "string" ? data.migrationHint : null);
    const rows = data.templates as TemplateRow[];
    setTemplates(rows);
    setDraft(
      Object.fromEntries(
        rows.map((t) => [t.key, { subject: t.subject, body: t.body, ctaLabel: t.ctaLabel }]),
      ) as Record<EmailTemplateKey, DraftRow>,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = templates.some((t) => {
    const d = draft[t.key];
    if (!d) return false;
    return d.subject !== t.subject || d.body !== t.body || d.ctaLabel !== t.ctaLabel;
  });

  function patchDraft(key: EmailTemplateKey, patch: Partial<DraftRow>) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  }

  function restoreDefault(key: EmailTemplateKey) {
    const def = templates.find((t) => t.key === key);
    if (def) {
      patchDraft(key, {
        subject: def.defaultSubject,
        body: def.defaultBody,
        ctaLabel: def.defaultCtaLabel,
      });
    }
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/admin/email-templates", {
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
    setToast({ message: "Email templates saved", type: "success" });
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 rounded-[10px]" style={{ background: "var(--color-row-alt)" }} />
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
          <Mail className="h-4 w-4" style={{ color: "var(--color-badge-text)" }} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Email Templates
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Edit subject, message body, and button label for customer emails. Placeholders in curly
            braces are replaced when a message is sent. Staff cannot override this text when requesting
            resubmits.
          </p>
        </div>
      </div>

      {!dbAvailable && migrationHint && (
        <div
          className="rounded-[10px] border px-4 py-3 text-[13px]"
          style={{
            background: "var(--color-warning-bg)",
            borderColor: "var(--color-warning-border)",
            color: "var(--color-warning-text-deep)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--color-warning)" }}>
            Database migration required
          </p>
          <p className="mt-1 leading-relaxed">{migrationHint}</p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Showing coded defaults below. Saving will work after you run the migration.
          </p>
        </div>
      )}

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
          Use curly-brace placeholders listed under each template. They are replaced when a message is
          sent.
        </p>
      </div>

      {EMAIL_TEMPLATE_GROUPS.map((group) => {
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
              const d = draft[t.key] ?? { subject: "", body: "", ctaLabel: "" };

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

                  <div>
                    <label
                      className="block text-[11px] font-medium uppercase tracking-wide mb-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Subject line
                    </label>
                    <input
                      type="text"
                      value={d.subject}
                      onChange={(e) => patchDraft(t.key, { subject: e.target.value })}
                      className="w-full h-9 rounded-[6px] border px-3 text-sm"
                      style={{
                        borderColor: "var(--color-border)",
                        background: "var(--color-bg)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block text-[11px] font-medium uppercase tracking-wide mb-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Message body
                    </label>
                    <textarea
                      value={d.body}
                      onChange={(e) => patchDraft(t.key, { body: e.target.value })}
                      rows={5}
                      className="w-full rounded-md border px-3 py-2 text-sm resize-y min-h-[100px]"
                      style={{
                        background: "var(--color-surface)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block text-[11px] font-medium uppercase tracking-wide mb-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Button label
                    </label>
                    <input
                      type="text"
                      value={d.ctaLabel}
                      onChange={(e) => patchDraft(t.key, { ctaLabel: e.target.value })}
                      className="w-full h-9 rounded-[6px] border px-3 text-sm"
                      style={{
                        borderColor: "var(--color-border)",
                        background: "var(--color-bg)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </div>

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
                </div>
              );
            })}
          </section>
        );
      })}

      <div className="flex items-center gap-3 pb-4">
        <button
          type="button"
          disabled={saving || !dirty || !dbAvailable}
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
