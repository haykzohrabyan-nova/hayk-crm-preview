export const REJECT_REASONS = [
  { value: "wrong_number_fake", label: "Wrong Number / Fake" },
  { value: "spam_bot", label: "Spam / Bot" },
  { value: "budget_too_low", label: "Budget Too Low" },
  { value: "existing_customer", label: "Existing Customer" },
  { value: "timing_not_right", label: "Timing Not Right" },
  { value: "not_a_fit", label: "Not a Fit / Other" },
] as const;

/** Resolve a stored reject-reason value to its display label, falling back to the raw value. */
export function rejectReasonLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return REJECT_REASONS.find((r) => r.value === value)?.label ?? value;
}
