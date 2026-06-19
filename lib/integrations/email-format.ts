import { formatCurrency } from "@/lib/utils/format";

/**
 * Shared currency formatter for outbound email templates.
 * Returns an empty string for null/undefined (intentional — emails omit missing amounts).
 * Use formatCurrency from lib/utils/format instead for UI display (returns "—").
 */
export function fmtEmailCurrency(n: number | null | undefined): string {
  if (n == null) return "";
  return formatCurrency(n);
}
