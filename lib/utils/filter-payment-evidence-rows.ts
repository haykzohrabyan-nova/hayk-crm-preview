import { formatCurrency } from "@/lib/utils/format";
import {
  inferPaymentEvidenceMode,
  paymentEvidenceTypeDescription,
  paymentEvidenceTypeLabel,
  type PaymentEvidenceModeFields,
} from "@/lib/utils/payment-evidence-type";

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
