"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Upload, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { formatDateTime } from "@/lib/utils/format";
import { getChannelLabel } from "@/lib/utils/compute-checkout";
import {
  listRefundablePaymentSlots,
  type RefundablePaymentSlot,
  type RefundableSlotTicket,
  type TicketRefundRow,
} from "@/lib/payments/refundable-payment-slots";
import type { LookupValue } from "@/lib/types";
import type { PaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";

export interface RecordRefundForm {
  payment_mode: PaymentEvidenceMode | "";
  refund_reason: string;
  refund_notes: string;
  refund_method: string;
  amount_mode: "full" | "partial";
  amount: string;
  evidence_file: File | null;
}

const REFUND_METHODS = ["cash", "wire", "ach", "zelle", "check", "card", "offline", "other"] as const;

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

export function RecordRefundModal({
  open,
  ticket,
  priorRefunds,
  reasons,
  form,
  onChange,
  onConfirm,
  onClose,
  processing,
}: {
  open: boolean;
  ticket: RefundableSlotTicket;
  priorRefunds?: TicketRefundRow[];
  reasons: LookupValue[];
  form: RecordRefundForm;
  onChange: (form: RecordRefundForm) => void;
  onConfirm: () => void;
  onClose: () => void;
  processing?: boolean;
}) {
  const [step, setStep] = useState<"sure" | "details">("sure");
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  const slots = useMemo(
    () => listRefundablePaymentSlots(ticket, priorRefunds),
    [ticket, priorRefunds],
  );

  const selectedSlot = slots.find((s) => s.mode === form.payment_mode) ?? null;

  useEffect(() => {
    if (!open) return;
    setStep("sure");
    if (slots.length === 1) {
      const s = slots[0]!;
      onChange({
        ...form,
        payment_mode: s.mode,
        refund_method: s.refundChannel === "stripe" ? "card" : s.method,
        amount_mode: "full",
        amount: String(s.maxRefundable),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset step when modal opens
  }, [open]);

  if (!open) return null;

  const partialAmount = Number(form.amount);
  const maxPartial = selectedSlot?.maxRefundable ?? 0;
  const partialValid =
    form.amount_mode === "full" ||
    (Number.isFinite(partialAmount) &&
      partialAmount >= 0.01 &&
      partialAmount <= maxPartial + 0.001);

  const canSubmit =
    !!form.payment_mode &&
    !!selectedSlot &&
    !!form.refund_reason &&
    reasons.length > 0 &&
    partialValid &&
    (selectedSlot.refundChannel === "stripe" || !!form.refund_method);

  function selectSlot(s: RefundablePaymentSlot) {
    onChange({
      ...form,
      payment_mode: s.mode,
      refund_method: s.refundChannel === "stripe" ? "card" : s.method,
      amount_mode: "full",
      amount: String(s.maxRefundable),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={processing ? undefined : onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-[12px] p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === "sure" ? (
          <>
            <div className="flex gap-3 mb-4">
              <AlertTriangle size={24} className="shrink-0" style={{ color: "var(--color-warning)" }} />
              <div>
                <h2 className="text-base font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                  Refund payment?
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  You will choose which payment to refund (deposit, balance, or full). Card payments
                  are processed through Stripe; cash, Zelle, wire, and other methods are recorded manually
                  in the CRM.
                </p>
              </div>
            </div>
            <p
              className="text-sm font-medium rounded-lg border px-3 py-2 mb-5"
              style={{
                borderColor: "var(--color-warning-border)",
                background: "var(--color-warning-bg)",
                color: "var(--color-warning-text-deep)",
              }}
            >
              Only continue if you have verified the refund and did not click by mistake.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep("details")}
                disabled={slots.length === 0}
                className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium"
                style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
              Refund payment
            </h2>

            <div className="flex flex-col gap-4">
              <div>
                <label style={labelStyle}>Which payment to refund? *</label>
                <div className="flex flex-col gap-2 mt-1">
                  {slots.map((s) => (
                    <label
                      key={s.mode}
                      className="flex flex-col gap-0.5 cursor-pointer rounded-[8px] border px-3 py-2.5 text-sm"
                      style={{
                        borderColor:
                          form.payment_mode === s.mode ? "var(--color-accent)" : "var(--color-border)",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="payment_slot"
                          checked={form.payment_mode === s.mode}
                          onChange={() => selectSlot(s)}
                        />
                        <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {s.label} — {formatCurrency(s.maxRefundable)}
                        </span>
                      </span>
                      <span className="text-xs ml-6" style={{ color: "var(--color-text-muted)" }}>
                        {getChannelLabel(s.method)}
                        {s.paidAt ? ` · ${formatDateTime(s.paidAt)}` : ""}
                        {s.refundChannel === "stripe" ? " · Stripe" : " · Manual refund"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {selectedSlot && (
                <>
                  <div>
                    <label style={labelStyle}>Amount for this payment *</label>
                    <div className="flex flex-col gap-2 mt-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          checked={form.amount_mode === "full"}
                          onChange={() =>
                            onChange({
                              ...form,
                              amount_mode: "full",
                              amount: String(selectedSlot.maxRefundable),
                            })
                          }
                        />
                        Full amount ({formatCurrency(selectedSlot.maxRefundable)})
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          checked={form.amount_mode === "partial"}
                          onChange={() => onChange({ ...form, amount_mode: "partial" })}
                        />
                        Partial amount
                      </label>
                    </div>
                    {form.amount_mode === "partial" && (
                      <input
                        type="number"
                        min={0.01}
                        max={maxPartial}
                        step={0.01}
                        value={form.amount}
                        onChange={(e) => onChange({ ...form, amount: e.target.value })}
                        className="mt-2"
                        style={inputStyle}
                      />
                    )}
                  </div>

                  {selectedSlot.refundChannel === "manual" && (
                    <div>
                      <label style={labelStyle}>How refunded *</label>
                      <select
                        value={form.refund_method}
                        onChange={(e) => onChange({ ...form, refund_method: e.target.value })}
                        style={inputStyle}
                      >
                        {REFUND_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {getChannelLabel(m)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedSlot.refundChannel === "stripe" && (
                    <p className="text-sm rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-info-border)", background: "var(--color-info-bg)", color: "var(--color-info-text-deep)" }}>
                      This refund will be sent to the customer&apos;s card through Stripe.
                    </p>
                  )}

                  <div>
                    <label style={labelStyle}>Refund reason *</label>
                    <select
                      value={form.refund_reason}
                      onChange={(e) => onChange({ ...form, refund_reason: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Select…</option>
                      {reasons.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Notes (optional)</label>
                    <textarea
                      rows={2}
                      value={form.refund_notes}
                      onChange={(e) => onChange({ ...form, refund_notes: e.target.value })}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Evidence (optional)</label>
                    <input
                      ref={evidenceInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        onChange({
                          ...form,
                          evidence_file: e.target.files?.[0] ?? null,
                        });
                        e.target.value = "";
                      }}
                    />
                    <div
                      className="rounded-lg border border-dashed p-4 space-y-3"
                      style={{
                        borderColor: "var(--color-border)",
                        background: "var(--color-bg)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => evidenceInputRef.current?.click()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90 active:scale-[0.97] sm:w-auto"
                        style={{
                          background: "var(--color-btn-primary-bg)",
                          color: "var(--color-btn-primary-text)",
                        }}
                      >
                        <Upload size={16} />
                        {form.evidence_file ? "Replace file" : "Upload image or PDF"}
                      </button>
                      {form.evidence_file ? (
                        <div
                          className="flex items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-sm"
                          style={{
                            borderColor: "var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          <span className="truncate min-w-0">{form.evidence_file.name}</span>
                          <button
                            type="button"
                            onClick={() => onChange({ ...form, evidence_file: null })}
                            className="shrink-0 inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] font-medium"
                            style={{ color: "var(--color-danger)" }}
                            aria-label="Remove file"
                          >
                            <X size={14} />
                            Remove
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-center sm:text-left" style={{ color: "var(--color-text-muted)" }}>
                          No file selected yet
                        </p>
                      )}
                    </div>
                    <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                      Image or PDF. Admin and accountant can view anytime on this order.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setStep("sure")} disabled={processing} className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                Back
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canSubmit || processing}
                className="inline-flex items-center gap-2 rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
                style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                {processing ? "Processing…" : "Process refund"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
