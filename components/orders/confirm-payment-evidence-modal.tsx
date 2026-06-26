"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";

export interface ConfirmPaymentEvidenceModalProps {
  open: boolean;
  referenceCode?: string | null;
  customerLabel?: string;
  /** Claimed amount from payment evidence — used as default for "Paid in full". */
  amount: number;
  paymentForLabel: string;
  methodLabel?: string;
  confirming?: boolean;
  error?: string | null;
  /** Called with the final accountant-approved amount. */
  onConfirm: (approvedAmount: number) => void;
  onClose: () => void;
  onRequestEvidence?: () => void;
}

export function ConfirmPaymentEvidenceModal({
  open,
  referenceCode,
  customerLabel,
  amount,
  paymentForLabel,
  methodLabel,
  confirming,
  error,
  onConfirm,
  onClose,
  onRequestEvidence,
}: ConfirmPaymentEvidenceModalProps) {
  const [isPartial, setIsPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState<string>(
    amount > 0 ? String(amount) : "",
  );
  const [partialError, setPartialError] = useState<string | null>(null);

  if (!open) return null;

  const approvedAmount = isPartial ? Number(partialAmount) : amount;

  function handlePartialAmountChange(val: string) {
    setPartialAmount(val);
    const n = Number(val);
    if (!val || isNaN(n) || n <= 0) {
      setPartialError("Enter a valid amount greater than $0.");
    } else if (n > amount) {
      setPartialError(`Cannot exceed the claimed amount of ${formatCurrency(amount)}.`);
    } else {
      setPartialError(null);
    }
  }

  function handleConfirm() {
    if (isPartial) {
      const n = Number(partialAmount);
      if (!partialAmount || isNaN(n) || n <= 0) {
        setPartialError("Enter a valid amount greater than $0.");
        return;
      }
      if (n > amount) {
        setPartialError(`Cannot exceed the claimed amount of ${formatCurrency(amount)}.`);
        return;
      }
    }
    onConfirm(approvedAmount);
  }

  const canConfirm = isPartial
    ? !partialError && !!partialAmount && Number(partialAmount) > 0
    : amount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={confirming ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[520px] rounded-[12px] p-6"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-payment-evidence-title"
      >
        <div className="flex gap-3 mb-4">
          <AlertTriangle
            size={24}
            className="shrink-0"
            style={{ color: "var(--color-warning)" }}
          />
          <div className="min-w-0">
            <h2
              id="confirm-payment-evidence-title"
              className="text-base font-semibold mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Confirm payment evidence?
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Select whether the customer paid in full or made a partial payment
              {methodLabel ? (
                <>
                  {" "}via{" "}
                  <strong style={{ color: "var(--color-text-primary)" }}>{methodLabel}</strong>
                </>
              ) : null}
              {" "}for{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {paymentForLabel.toLowerCase()}
              </strong>
              .
            </p>
          </div>
        </div>

        {(referenceCode || customerLabel) && (
          <dl
            className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4 rounded-lg border px-3 py-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
          >
            {referenceCode && (
              <>
                <dt style={{ color: "var(--color-text-muted)" }}>Order</dt>
                <dd className="font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {referenceCode}
                </dd>
              </>
            )}
            {customerLabel && (
              <>
                <dt style={{ color: "var(--color-text-muted)" }}>Customer</dt>
                <dd className="font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                  {customerLabel}
                </dd>
              </>
            )}
          </dl>
        )}

        {/* Payment type selector */}
        <div
          className="rounded-lg border mb-4 overflow-hidden"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* Paid in full option */}
          <button
            type="button"
            disabled={confirming}
            onClick={() => { setIsPartial(false); setPartialError(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors disabled:opacity-60"
            style={{
              background: !isPartial ? "var(--color-badge-bg)" : "var(--color-bg)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <span
              className="mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
              style={{
                borderColor: !isPartial ? "var(--color-tab-active)" : "var(--color-border)",
              }}
            >
              {!isPartial && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--color-tab-active)" }}
                />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                Paid in full
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Confirm the full claimed amount of{" "}
                <span className="font-semibold">{formatCurrency(amount)}</span>
              </p>
            </div>
          </button>

          {/* Partial payment option */}
          <button
            type="button"
            disabled={confirming}
            onClick={() => { setIsPartial(true); setPartialError(null); }}
            className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors disabled:opacity-60"
            style={{ background: isPartial ? "var(--color-badge-bg)" : "var(--color-bg)" }}
          >
            <span
              className="mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
              style={{
                borderColor: isPartial ? "var(--color-tab-active)" : "var(--color-border)",
              }}
            >
              {isPartial && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--color-tab-active)" }}
                />
              )}
            </span>
            <div className="min-w-0 w-full">
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                Partial payment
              </p>
              <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--color-text-muted)" }}>
                Customer paid less than the full amount — enter what was actually received.
                The remaining balance will stay due on the public link and order.
              </p>

              {isPartial && (
                <div onClick={(e) => e.stopPropagation()}>
                  <label
                    className="block mb-1"
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Amount confirmed ($)
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    max={amount}
                    step={0.01}
                    value={partialAmount}
                    onChange={(e) => handlePartialAmountChange(e.target.value)}
                    disabled={confirming}
                    placeholder="0.00"
                    className="w-full rounded-[6px] border px-3 py-1.5 text-sm disabled:opacity-60"
                    style={{
                      borderColor: partialError ? "var(--color-danger)" : "var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text-primary)",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      if (!partialError) {
                        e.currentTarget.style.borderColor = "var(--color-accent)";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = partialError
                        ? "var(--color-danger)"
                        : "var(--color-border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                    aria-invalid={!!partialError}
                    aria-describedby={partialError ? "partial-amount-error" : undefined}
                  />
                  {partialError && (
                    <p
                      id="partial-amount-error"
                      className="mt-1 text-[12px] font-medium"
                      style={{ color: "var(--color-danger)" }}
                      role="alert"
                    >
                      {partialError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </button>
        </div>

        <p
          className="text-sm font-medium rounded-lg border px-3 py-2 mb-4"
          style={{
            borderColor: "var(--color-warning-border)",
            background: "var(--color-warning-bg)",
            color: "var(--color-warning-text-deep)",
          }}
        >
          Are you sure? Only confirm if you have verified the payment evidence and did not click by mistake.
        </p>

        {error && (
          <div
            className="rounded-[6px] border px-3 py-2 text-sm mb-4"
            style={{
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {onRequestEvidence && (
            <button
              type="button"
              disabled={confirming}
              onClick={onRequestEvidence}
              className="inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60 mr-auto"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
                background: "var(--color-surface)",
              }}
            >
              <Mail size={14} />
              Request updated proof
            </button>
          )}
          <button
            type="button"
            disabled={confirming}
            onClick={onClose}
            className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
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
            disabled={confirming || !canConfirm}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-60"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            {confirming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Yes, confirm payment
          </button>
        </div>
      </div>
    </div>
  );
}
