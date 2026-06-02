/** Tax-exempt permit document review (per ticket). */

import { isPaymentEvidencePending, type PaymentEvidencePendingFields } from "@/lib/utils/payment-evidence-pending";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Totals if tax-exempt is removed and sales tax applies to the current pre-tax amount. */
export function computeTotalsIfTaxExemptDenied(
  preTaxTotal: number,
  taxRatePercent: number,
): { tax_amount: number; final_total: number } {
  const pre = roundMoney(preTaxTotal);
  const tax_amount = roundMoney(pre * (taxRatePercent / 100));
  const final_total = roundMoney(pre + tax_amount);
  return { tax_amount, final_total };
}

export interface TaxExemptApprovalFields {
  tax_exempt?: boolean;
  sales_permit_number?: string | null;
  sales_permit_storage_path?: string | null;
  sales_permit_reviewed_at?: string | null;
}

/** Pre–permit-file migration: tax exempt + permit # but no uploaded document. */
export function isLegacyTaxExemptMissingPermitFile(
  ticket: TaxExemptApprovalFields,
): boolean {
  return (
    !!ticket.tax_exempt &&
    !ticket.sales_permit_storage_path &&
    !!(ticket.sales_permit_number?.trim())
  );
}

/** Appears on Payments → Tax-exempt pending (file on file awaiting review, or legacy missing file). */
export function isTaxExemptReviewQueueItem(ticket: TaxExemptApprovalFields): boolean {
  if (!ticket.tax_exempt || ticket.sales_permit_reviewed_at) return false;
  if (ticket.sales_permit_storage_path) return true;
  return isLegacyTaxExemptMissingPermitFile(ticket);
}

export function requiresTaxExemptAccountantReview(ticket: TaxExemptApprovalFields): boolean {
  return !!ticket.tax_exempt && !!ticket.sales_permit_storage_path;
}

export function isTaxExemptApprovalPending(ticket: TaxExemptApprovalFields): boolean {
  return requiresTaxExemptAccountantReview(ticket) && !ticket.sales_permit_reviewed_at;
}

export function canMarkTicketCompleted(
  ticket: TaxExemptApprovalFields & PaymentEvidencePendingFields,
  opts: { acknowledgeTaxExemptUnapproved?: boolean },
): boolean {
  if (isPaymentEvidencePending(ticket)) return false;
  if (isTaxExemptApprovalPending(ticket) && !opts.acknowledgeTaxExemptUnapproved) return false;
  return true;
}

/** Fields that invalidate ticket-level tax-exempt approval when changed. */
export const TAX_EXEMPT_APPROVAL_INVALIDATING_FIELDS = [
  "tax_exempt",
  "sales_permit_number",
  "quote_subtotal",
  "quote_shipping",
  "discount_type",
  "discount_value",
  "quote_pre_tax_total",
  "quote_tax_rate_percent",
  "quote_tax_amount",
  "quote_final_total",
] as const;
