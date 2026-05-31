"use client";

import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";

export function PartialRefundCancelWarningModal({
  open,
  totalRefunded,
  amountStillOnFile,
  onClose,
  onProceedToCancel,
  onRefundFirst,
}: {
  open: boolean;
  totalRefunded?: number | null;
  amountStillOnFile?: number | null;
  onClose: () => void;
  onProceedToCancel: () => void;
  onRefundFirst?: () => void;
}) {
  if (!open) return null;

  const refunded = Number(totalRefunded ?? 0);
  const onFile = Number(amountStillOnFile ?? 0);

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
        <div className="flex gap-3 mb-4">
          <AlertTriangle size={24} className="shrink-0" style={{ color: "var(--color-warning)" }} />
          <div>
            <h2 className="text-base font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
              Order is not fully refunded
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              This order is only partially refunded. Please finish refunding all payments before
              cancelling, or proceed if you intentionally need to cancel with money still on file.
            </p>
          </div>
        </div>

        {(refunded > 0.01 || onFile > 0.01) && (
          <p
            className="text-sm rounded-lg border px-3 py-2 mb-5"
            style={{
              borderColor: "var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text-deep)",
            }}
          >
            {refunded > 0.01 && (
              <span className="font-medium">{formatCurrency(refunded)} refunded</span>
            )}
            {refunded > 0.01 && onFile > 0.01 && " · "}
            {onFile > 0.01 && (
              <span>{formatCurrency(onFile)} still on file</span>
            )}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] border px-3 py-2 text-[13px] font-medium"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
              background: "var(--color-surface)",
            }}
          >
            Cancel
          </button>
          {onRefundFirst && (
            <button
              type="button"
              onClick={onRefundFirst}
              className="rounded-[6px] border px-3 py-2 text-[13px] font-medium"
              style={{
                borderColor: "var(--color-warning-border)",
                color: "var(--color-warning-text-deep)",
                background: "var(--color-warning-bg)",
              }}
            >
              Refund payment first
            </button>
          )}
          <button
            type="button"
            onClick={onProceedToCancel}
            className="rounded-[6px] px-3 py-2 text-[13px] font-medium"
            style={{
              background: "var(--color-danger)",
              color: "white",
            }}
          >
            Proceed to cancel
          </button>
        </div>
      </div>
    </div>
  );
}
