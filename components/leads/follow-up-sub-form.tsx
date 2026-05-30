"use client";

import { type FollowUpForm, type LookupValue } from "@/lib/types";
import { isOtherCancelReason } from "@/lib/utils/cancel-reason-category";

interface FollowUpSubFormProps {
  form: FollowUpForm;
  reasons: LookupValue[];
  onChange: (form: FollowUpForm) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving?: boolean;
  fullScreen?: boolean;
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

export function FollowUpSubForm({
  form,
  reasons,
  onChange,
  onConfirm,
  onCancel,
  saving,
  fullScreen = false,
}: FollowUpSubFormProps) {
  const otherSelected = isOtherCancelReason(form.follow_up_reason);
  const otherDetailValid = !otherSelected || form.follow_up_notes.trim().length > 0;
  const canConfirm = !!form.follow_up_reason && otherDetailValid && reasons.length > 0;

  return (
    <div
      className={
        fullScreen
          ? "flex flex-1 flex-col gap-5 min-h-0"
          : "flex flex-col gap-3 rounded-[10px] border p-4"
      }
      style={
        fullScreen
          ? undefined
          : { background: "var(--color-row-alt)", borderColor: "var(--color-border)" }
      }
    >
      <p
        className={fullScreen ? "text-base font-semibold shrink-0" : "text-sm font-medium"}
        style={{ color: "var(--color-text-primary)" }}
      >
        Follow up later
      </p>

      <div className={fullScreen ? "flex-1 flex flex-col gap-5 min-h-0 overflow-y-auto" : "flex flex-col gap-3"}>
        <div>
          <label style={labelStyle}>Reason *</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {reasons.map((r) => {
              const selected = form.follow_up_reason === r.value;
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
                    name="follow_up_reason"
                    value={r.value}
                    checked={selected}
                    onChange={() =>
                      onChange({
                        ...form,
                        follow_up_reason: r.value,
                        follow_up_notes: isOtherCancelReason(r.value) ? form.follow_up_notes : "",
                      })
                    }
                    className="accent-[var(--color-accent)] shrink-0"
                  />
                  {r.label}
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>
            {otherSelected ? "Please specify *" : "Notes (optional)"}
          </label>
          <textarea
            rows={fullScreen ? 4 : 2}
            value={form.follow_up_notes}
            onChange={(e) => onChange({ ...form, follow_up_notes: e.target.value })}
            placeholder={
              otherSelected
                ? "Describe why follow-up is needed…"
                : "Any additional context…"
            }
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div>
          <label style={labelStyle}>Follow up on (optional)</label>
          <input
            type="date"
            value={form.follow_up_until}
            onChange={(e) => onChange({ ...form, follow_up_until: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>

      <div className={`flex justify-end gap-2 shrink-0 ${fullScreen ? "pt-2" : "pt-1"}`}>
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
          disabled={!canConfirm || saving}
          className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all disabled:opacity-50"
          style={{
            background: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
