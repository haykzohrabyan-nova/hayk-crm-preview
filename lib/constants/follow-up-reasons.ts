export const FOLLOW_UP_REASONS = [
  { value: "callback_requested", label: "Customer asked to call back later" },
  { value: "awaiting_decision", label: "Awaiting decision / budget" },
  { value: "wrong_time_to_reach", label: "Wrong time — try again later" },
  { value: "left_voicemail", label: "Left voicemail — follow up" },
  { value: "other", label: "Other" },
] as const;

/** Resolve a stored value to its display label, falling back to the raw value. */
export function followUpReasonLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return FOLLOW_UP_REASONS.find((r) => r.value === value)?.label ?? value;
}
