import type { LookupValue } from "@/lib/types";

/** Resolve a stored lookup value to its display label, or fall back to the raw value. */
export function lookupLabel(
  options: LookupValue[] | undefined,
  value: string | null | undefined,
  fallback = "—",
): string {
  if (!value) return fallback;
  return options?.find((o) => o.value === value)?.label ?? value;
}
