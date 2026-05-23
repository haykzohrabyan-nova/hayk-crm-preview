/** Lookup / form select value for unset urgency. */
export const URGENCY_NOT_DEFINED = { value: "not_defined", label: "Not Defined" } as const;

export type UrgencyFormValue = "not_defined" | "high" | "medium" | "low";
export type UrgencyDbValue = "High" | "Medium" | "Low";

/** Map DB urgency (High/Medium/Low) → form select value (high/medium/low). */
export function urgencyDbToForm(value: string | null | undefined): UrgencyFormValue | string {
  if (!value) return "not_defined";
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "not_defined";
}

/** Map form select value → DB urgency (High/Medium/Low) or null. */
export function urgencyFormToDb(value: string | null | undefined): UrgencyDbValue | null {
  if (!value || value === "not_defined") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return null;
}

/** Label for a form or DB urgency value (for SelectValue display). */
export function urgencyLabel(
  value: string | null | undefined,
  options: { value: string; label: string }[],
): string {
  const formValue = urgencyDbToForm(value);
  return options.find((u) => u.value === formValue)?.label ?? options.find((u) => u.value === value)?.label ?? "Select…";
}
