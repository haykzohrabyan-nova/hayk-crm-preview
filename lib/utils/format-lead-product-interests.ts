/** Display lead product interests as "Booklets[1111], Labels[500]". */

export function listLeadProductInterestLabels(
  interests: Record<string, boolean> | null | undefined,
  quantities: Record<string, string | number> | null | undefined,
): string[] {
  return Object.entries(interests ?? {})
    .filter(([, selected]) => selected)
    .map(([product]) => {
      const raw = quantities?.[product];
      const qty = raw != null ? String(raw).trim() : "";
      return qty ? `${product}[${qty}]` : product;
    });
}

export function formatLeadProductInterests(
  interests: Record<string, boolean> | null | undefined,
  quantities: Record<string, string | number> | null | undefined,
): string {
  const items = listLeadProductInterestLabels(interests, quantities);
  return items.length > 0 ? items.join(", ") : "—";
}
