/** Shared types and helpers used by both bulk-import-leads and bulk-import-customers. */

export interface LookupOption {
  value: string;
  label: string;
}

/** Convert a snake_case slug to Title Case label (e.g. "trade_show" → "Trade Show"). */
export function slugToLookupLabel(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Format up to `max` lookup options as a hint string for validation error messages. */
export function formatLookupOptionsHint(options: LookupOption[], max = 12): string {
  const slice = options.slice(0, max);
  const formatted = slice.map((o) => `${o.value} (${o.label})`).join(", ");
  const more = options.length > max ? `, … +${options.length - max} more` : "";
  return formatted + more;
}
