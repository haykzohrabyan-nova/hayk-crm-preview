import {
  inferPaymentEvidenceMode,
  paymentEvidenceTypeDescription,
  paymentEvidenceTypeLabel,
  type PaymentEvidenceModeFields,
} from "@/lib/utils/payment-evidence-type";

export function PaymentTypeBadge({
  ticket,
  showDescription = false,
}: {
  ticket: PaymentEvidenceModeFields;
  showDescription?: boolean;
}) {
  const mode = inferPaymentEvidenceMode(ticket);
  const label = paymentEvidenceTypeLabel(mode);
  const description = paymentEvidenceTypeDescription(mode);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
        style={{
          background:
            mode === "deposit"
              ? "var(--color-info-bg)"
              : mode === "balance"
                ? "var(--color-warning-bg)"
                : "var(--color-badge-bg)",
          color:
            mode === "deposit"
              ? "var(--color-info-text-deep)"
              : mode === "balance"
                ? "var(--color-warning-text-deep)"
                : "var(--color-badge-text)",
          border: `1px solid ${
            mode === "deposit"
              ? "var(--color-info-border)"
              : mode === "balance"
                ? "var(--color-warning-border)"
                : "var(--color-neutral-border)"
          }`,
        }}
      >
        {label}
      </span>
      {showDescription && (
        <span className="text-xs leading-snug" style={{ color: "var(--color-text-muted)" }}>
          {description}
        </span>
      )}
    </span>
  );
}
