"use client";

import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";

export interface ConfirmPaymentEvidenceModalProps {
  open: boolean;
  referenceCode?: string | null;
  customerLabel?: string;
  amount: number;
  paymentForLabel: string;
  methodLabel?: string;
  confirming?: boolean;
  error?: string | null;
  onConfirm: () => void;
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
  if (!open) return null;

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
              className="text-base font-semibold mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Confirm payment evidence?
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              This records{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {formatCurrency(amount)}
              </strong>{" "}
              as received for{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {paymentForLabel.toLowerCase()}
              </strong>
              {methodLabel ? (
                <>
                  {" "}
                  via <strong style={{ color: "var(--color-text-primary)" }}>{methodLabel}</strong>
                </>
              ) : null}
              . The customer may be notified and production gates may update.
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
            disabled={confirming || amount <= 0}
            onClick={onConfirm}
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
