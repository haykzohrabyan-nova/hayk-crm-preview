import { getChannelLabel } from "@/lib/utils/compute-checkout";
import {
  paymentEvidenceTypeLabel,
  type PaymentEvidenceMode,
} from "@/lib/utils/payment-evidence-type";

export type PaymentReceivedFields = {
  stripe_payment_intent_id?: string | null;
  deposit_paid_at?: string | null;
  deposit_method?: string | null;
  payment_method_used?: string | null;
  payment_paid_at?: string | null;
  balance_paid_at?: string | null;
};

/** How the customer originally paid (for refunded-order lists). */
export function summarizePaymentReceived(t: PaymentReceivedFields): string {
  if (
    t.stripe_payment_intent_id &&
    !t.deposit_paid_at &&
    !t.payment_method_used
  ) {
    return "Card (Stripe)";
  }

  const parts: string[] = [];
  if (t.deposit_paid_at) {
    const label = t.deposit_method ? getChannelLabel(t.deposit_method) : "Recorded";
    parts.push(`Deposit · ${label}`);
  }
  if (t.payment_method_used && (t.balance_paid_at || t.payment_paid_at)) {
    parts.push(getChannelLabel(t.payment_method_used));
  }
  if (!parts.length && t.stripe_payment_intent_id) {
    return "Card (Stripe)";
  }
  return parts.join(" · ") || "—";
}

/** How the refund was issued (latest ledger row). */
export function summarizeRefundIssued(
  method: string | null | undefined,
  source: string | null | undefined,
  paymentMode?: string | null,
): string {
  if (!method && !source) return "—";

  const channel = method
    ? getChannelLabel(method)
    : source === "stripe"
      ? "Card"
      : "—";
  const slot =
    paymentMode && ["deposit", "balance", "full"].includes(paymentMode)
      ? paymentEvidenceTypeLabel(paymentMode as PaymentEvidenceMode)
      : null;
  const via = source === "stripe" ? "via Stripe" : "manual";

  return [slot, channel, via].filter(Boolean).join(" · ");
}
