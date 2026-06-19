import type { TaxExemptApprovalFields } from "@/lib/utils/tax-exempt-approval";
import { isTaxExemptApprovalPending } from "@/lib/utils/tax-exempt-approval";

export const TAX_EXEMPT_PENDING_LABEL = "Tax-exempt pending approval";
export const TAX_EXEMPT_APPROVED_LABEL = "Tax-exempt approved";

/** Shorter variants for use in compact list/table views */
export const TAX_EXEMPT_PENDING_LABEL_SHORT = "Pending Tax Review";
export const TAX_EXEMPT_APPROVED_LABEL_SHORT = "Tax Exempt";

export function taxExemptListLabel(ticket: TaxExemptApprovalFields): string | null {
  if (!ticket.tax_exempt) return null;
  if (isTaxExemptApprovalPending(ticket)) return TAX_EXEMPT_PENDING_LABEL;
  if (ticket.sales_permit_reviewed_at) return TAX_EXEMPT_APPROVED_LABEL;
  return null;
}

export function taxExemptListStyle(ticket: TaxExemptApprovalFields): { bg: string; text: string } | null {
  const label = taxExemptListLabel(ticket);
  if (!label) return null;
  if (isTaxExemptApprovalPending(ticket)) {
    return {
      bg: "var(--color-warning-bg)",
      text: "var(--color-warning-text-deep)",
    };
  }
  return {
    bg: "var(--color-success-bg)",
    text: "var(--color-success)",
  };
}
