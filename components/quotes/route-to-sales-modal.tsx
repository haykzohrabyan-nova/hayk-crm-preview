"use client";

import { isOtherCancelReason } from "@/lib/utils/cancel-reason-category";
import { labelStyleInline as labelStyle, inputStyleInline as inputStyle } from "@/lib/utils/form-field-styles";

export interface RouteToSalesForm {
  routed_reason: string;
  routed_notes: string;
}

interface RouteReasonOption {
  value: string;
  label: string;
}

interface RouteToSalesModalProps {
  reasons: RouteReasonOption[];
  form: RouteToSalesForm;
  onChange: (form: RouteToSalesForm) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving?: boolean;
}


export function RouteToSalesModal({
  reasons,
  form,
  onChange,
  onConfirm,
  onCancel,
  saving,
}: RouteToSalesModalProps) {
  const otherSelected = isOtherCancelReason(form.routed_reason);
  const otherDetailValid = !otherSelected || form.routed_notes.trim().length > 0;
  const canConfirm = !!form.routed_reason && otherDetailValid && reasons.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="rounded-2xl p-6 max-w-lg w-full mx-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
          Route to Sales
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--color-text-muted)" }}>
          Choose why this quote should be handled by Sales. The quote will be saved and appear in the
          Routed to Sales tab.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Reason *</label>
            {reasons.length === 0 ? (
              <p
                className="text-sm rounded-lg border px-3 py-2 mt-1"
                style={{
                  borderColor: "var(--color-warning-border)",
                  background: "var(--color-warning-bg)",
                  color: "var(--color-warning-text-deep)",
                }}
              >
                No route reasons configured. Add them in Admin → Settings → Dropdown Options.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {reasons.map((r) => {
                  const selected = form.routed_reason === r.value;
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
                        name="route_reason"
                        value={r.value}
                        checked={selected}
                        onChange={() =>
                          onChange({
                            ...form,
                            routed_reason: r.value,
                            routed_notes: isOtherCancelReason(r.value) ? form.routed_notes : "",
                          })
                        }
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
              value={form.routed_notes}
              onChange={(e) => onChange({ ...form, routed_notes: e.target.value })}
              placeholder={
                otherSelected
                  ? "Describe why this quote should go to Sales…"
                  : "Any additional context…"
              }
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-[6px] border px-4 py-2 text-[13px] font-medium transition-all"
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
            className="rounded-[6px] px-4 py-2 text-[13px] font-medium transition-all disabled:opacity-50"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            {saving ? "Routing…" : "Confirm — Route to Sales"}
          </button>
        </div>
      </div>
    </div>
  );
}
