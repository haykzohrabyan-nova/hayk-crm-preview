/** Normalize decision-maker values to yes/no or null. */
export function normalizeAuthority(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const lower = value.trim().toLowerCase();
  if (lower === "yes" || lower === "no") return lower;
  return value.trim();
}

export const AUTHORITY_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
};

export function authorityLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return AUTHORITY_LABELS[value] ?? value;
}
