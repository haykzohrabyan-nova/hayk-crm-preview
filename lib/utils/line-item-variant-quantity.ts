/** Parse quantity from an additional-SKU row (form string or stored number). */
export function parseVariantQuantity(value: string | number | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value).trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Sum quantities across additional SKUs on one line item. */
export function sumVariantQuantities(
  variants: { quantity: string | number }[],
): number {
  return variants.reduce((sum, v) => sum + parseVariantQuantity(v.quantity), 0);
}

/** Default quantity string when adding a new additional SKU row. */
export function defaultNewVariantQuantity(
  variants: { quantity: string }[],
  lineQuantity?: number,
): string {
  if (variants.length > 0) {
    const first = variants[0].quantity?.trim();
    if (first) return first;
  }
  if (lineQuantity != null && lineQuantity > 0) {
    return Number.isInteger(lineQuantity) ? String(lineQuantity) : String(lineQuantity);
  }
  return "";
}

/** Line item catalog quantity to persist when additional SKUs exist (total of SKU qtys). */
export function lineQuantityFromVariants(
  variants: { quantity: string | number }[],
): number | undefined {
  if (variants.length === 0) return undefined;
  const total = sumVariantQuantities(variants);
  return total > 0 ? total : undefined;
}
