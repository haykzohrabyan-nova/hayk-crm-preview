"use client";

import { isOtherCancelReason } from "@/lib/utils/cancel-reason-category";
import { type LookupValue } from "@/lib/types";

export interface CancelTicketForm {
  cancel_reason: string;
  cancel_notes: string;
}

interface CancelTicketModalProps {
  open: boolean;
  title: string;
  reasons: LookupValue[];
  form: CancelTicketForm;
  onChange: (form: CancelTicketForm) => void;
  onConfirm: () => void;
  onClose: () => void;
  saving?: boolean;
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 4,
};

const inputStyle = {
  width: "100%",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
};

export function CancelTicketModal({
  open,
  title,
  reasons,
  form,
  onChange,
  onConfirm,
  onClose,
  saving,
}: CancelTicketModalProps) {
  if (!open) return null;

  const otherSelected = isOtherCancelReason(form.cancel_reason);
  const otherDetailValid = !otherSelected || form.cancel_notes.trim().length > 0;
  const canConfirm = !!form.cancel_reason && otherDetailValid && reasons.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[12px] p-6"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--color-text-muted)" }}>
          Select a reason before cancelling. This will be saved on the ticket record.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Cancellation reason *</label>
            {reasons.length === 0 ? (
              <p className="text-sm rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-warning-border)", background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)" }}>
                No active cancellation reasons configured. Add them in Admin → Settings → Dropdown Options.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {reasons.map((r) => {
                  const selected = form.cancel_reason === r.value;
                  return (
                    <label
                      key={r.value}
                      className="flex items-center gap-2.5 cursor-pointer rounded-[8px] border px-3 py-2.5 text-sm transition-all"
                      style={{
                        borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                        background: selected
                          ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                          : "var(--color-surface)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      <input
                        type="radio"
                        name="cancel_reason"
                        value={r.value}
                        checked={selected}
                        onChange={() => onChange({ ...form, cancel_reason: r.value, cancel_notes: isOtherCancelReason(r.value) ? form.cancel_notes : "" })}
                        className="accent-[var(--color-accent)] shrink-0"
                      />
                      {r.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>
              {otherSelected ? "Please specify *" : "Notes (optional)"}
            </label>
            <textarea
              rows={3}
              value={form.cancel_notes}
              onChange={(e) => onChange({ ...form, cancel_notes: e.target.value })}
              placeholder={
                otherSelected
                  ? "Describe why this quote or order is being cancelled…"
                  : "Any additional context…"
              }
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", background: "transparent" }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || saving}
            className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            style={{
              color: "var(--color-danger)",
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-bg)",
            }}
          >
            {saving ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
}
