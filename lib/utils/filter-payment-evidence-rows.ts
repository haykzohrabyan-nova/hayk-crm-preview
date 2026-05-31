import { formatCurrency } from "@/lib/utils/format";
import {
  inferPaymentEvidenceMode,
  paymentEvidenceTypeDescription,
  paymentEvidenceTypeLabel,
  type PaymentEvidenceModeFields,
} from "@/lib/utils/payment-evidence-type";
import {
  summarizePaymentReceived,
  summarizeRefundIssued,
} from "@/lib/utils/payment-refund-list-labels";
import { getChannelLabel } from "@/lib/utils/compute-checkout";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wire: "Wire Transfer",
  ach: "ACH / Bank",
  zelle: "Zelle",
  check: "Check",
  card: "Card",
  cash: "Cash",
  offline: "Offline",
  other: "Other",
};

export type PaymentEvidenceSearchRow = PaymentEvidenceModeFields & {
  id: string;
  reference_code?: string | null;
  title?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  payment_method_used?: string | null;
  payment_status?: string | null;
  ticket_status?: string | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
  } | null;
  created_by?: { full_name?: string | null } | null;
  refund_status?: string | null;
  total_refunded_amount?: number | null;
  last_refunded_by?: { full_name?: string | null } | null;
  deposit_method?: string | null;
  balance_paid_at?: string | null;
  payment_paid_at?: string | null;
  stripe_payment_intent_id?: string | null;
  deposit_paid_at?: string | null;
  last_refund_method?: string | null;
  last_refund_source?: string | null;
  last_refund_payment_mode?: string | null;
};

function amountTokens(value: number | null | undefined): string[] {
  if (value == null || !Number.isFinite(value)) return [];
  const n = Number(value);
  const fixed = n.toFixed(2);
  const plain = String(n);
  return [fixed, plain, formatCurrency(n), formatCurrency(n).replace(/\$/g, "")];
}

function buildPaymentEvidenceHaystack(row: PaymentEvidenceSearchRow): string {
  const mode = inferPaymentEvidenceMode(row);
  const methodKey = row.payment_method_used ?? "";
  const methodLabel = PAYMENT_METHOD_LABELS[methodKey] ?? methodKey;

  const parts: string[] = [
    row.id,
    row.reference_code ?? "",
    row.title ?? "",
    row.contact_name ?? "",
    row.contact_email ?? "",
    row.customer?.first_name ?? "",
    row.customer?.last_name ?? "",
    row.customer?.company ?? "",
    row.created_by?.full_name ?? "",
    row.payment_method_used ?? "",
    methodLabel,
    row.payment_status ?? "",
    row.ticket_status ?? "",
    row.ticket_payment_strategy ?? "",
    paymentEvidenceTypeLabel(mode),
    paymentEvidenceTypeDescription(mode),
    ...amountTokens(row.quote_final_total),
    ...amountTokens(row.payment_evidence_amount),
    ...amountTokens(row.payment_amount_received),
    ...amountTokens(row.total_refunded_amount),
    row.refund_status ?? "",
    row.ticket_status === "cancelled" ? "cancelled" : "",
    row.last_refunded_by?.full_name ?? "",
    row.deposit_method ?? "",
    getChannelLabel(row.deposit_method ?? ""),
    summarizePaymentReceived(row),
    summarizeRefundIssued(
      row.last_refund_method,
      row.last_refund_source,
      row.last_refund_payment_mode,
    ),
    row.last_refund_method ?? "",
    row.last_refund_source ?? "",
    row.last_refund_payment_mode ?? "",
    row.stripe_payment_intent_id ? "stripe" : "",
  ];

  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Client-side filter for payment evidence queues — matches any visible ticket field. */
export function filterPaymentEvidenceRows<T extends PaymentEvidenceSearchRow>(
  rows: T[],
  search: string,
): T[] {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => buildPaymentEvidenceHaystack(row).includes(term));
}
