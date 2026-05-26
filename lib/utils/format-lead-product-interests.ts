/** Display lead product interests as "Booklets[1111], Labels[500]". */

export function formatLeadProductInterests(
  interests: Record<string, boolean> | null | undefined,
  quantities: Record<string, string | number> | null | undefined,
): string {
  const items = Object.entries(interests ?? {})
    .filter(([, selected]) => selected)
    .map(([product]) => {
      const raw = quantities?.[product];
      const qty = raw != null ? String(raw).trim() : "";
      return qty ? `${product}[${qty}]` : product;
    });

  return items.length > 0 ? items.join(", ") : "—";
}
