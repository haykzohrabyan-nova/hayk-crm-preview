export const HOLD_REASONS = [
  { value: "awaiting_customer_response", label: "Awaiting customer response" },
  { value: "awaiting_artwork_files", label: "Awaiting artwork / files" },
  { value: "awaiting_payment_confirmation", label: "Awaiting payment confirmation" },
  { value: "pricing_review_needed", label: "Pricing review needed" },
  { value: "vacation_customer_unavailable", label: "Vacation / customer unavailable" },
  { value: "other", label: "Other" },
] as const;

export type HoldReasonValue = (typeof HOLD_REASONS)[number]["value"];

/** Resolve a stored value to its display label, falling back to the raw value. */
export function holdReasonLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return HOLD_REASONS.find((r) => r.value === value)?.label ?? value;
}
