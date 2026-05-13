"use client";

import { type HoldForm, type LookupValue } from "@/lib/types";

interface HoldSubFormProps {
  form: HoldForm;
  reasons: LookupValue[];
  onChange: (form: HoldForm) => void;
  onConfirm: () => void;
  onCancel: () => void;
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

export function HoldSubForm({
  form,
  reasons,
  onChange,
  onConfirm,
  onCancel,
  saving,
}: HoldSubFormProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] border p-4"
      style={{ background: "var(--color-row-alt)", borderColor: "var(--color-border)" }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        Put on hold
      </p>

      {/* Hold Reason — radio grid */}
      <div>
        <label style={labelStyle}>Hold Reason *</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {reasons.map((r) => {
            const selected = form.hold_reason === r.value;
            return (
              <label
                key={r.value}
                className="flex items-center gap-2.5 cursor-pointer rounded-[8px] border px-3 py-2.5 text-sm transition-all"
                style={{
                  borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                  background: selected ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              >
                <input
                  type="radio"
                  name="hold_reason"
                  value={r.value}
                  checked={selected}
                  onChange={() => onChange({ ...form, hold_reason: r.value })}
                  className="accent-[var(--color-accent)] shrink-0"
                />
                {r.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea
          rows={2}
          value={form.hold_notes}
          onChange={(e) => onChange({ ...form, hold_notes: e.target.value })}
          placeholder="Any additional context…"
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {/* Hold Until */}
      <div>
        <label style={labelStyle}>Hold Until (optional)</label>
        <input
          type="date"
          value={form.hold_until}
          onChange={(e) => onChange({ ...form, hold_until: e.target.value })}
          style={inputStyle}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-all"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
            background: "transparent",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!form.hold_reason || saving}
          className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
          style={{
            background: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
        >
          {saving ? "Saving…" : "Confirm Hold"}
        </button>
      </div>
    </div>
  );
}
