import type { QuoteSku } from "@/lib/utils/ticket-math";
import type { FormLineVariant } from "@/components/quotes/shared/line-item-variants";

type SkuWithVariants = QuoteSku & { variants?: FormLineVariant[] };

/**
 * Validates line items on the quote/order form.
 * Returns an error map keyed by field anchor (lineItems, lineItem-N, lineVariants-N).
 * Used by both validateAndAdvance (tab navigation) and handleRouteToSalesClick (final save).
 */
export function validateLineItems(skus: SkuWithVariants[]): Record<string, string> {
  const errors: Record<string, string> = {};

  const hasFullItem = skus.some(
    (s) => s.product_type?.trim() && (s.quantity ?? 0) > 0 && (s.unit_price ?? 0) > 0,
  );
  if (!hasFullItem) {
    errors.lineItems =
      "Please fill in at least one complete line item (product, quantity, and unit price).";
  }

  for (let i = 0; i < skus.length; i++) {
    const s = skus[i];
    const missing: string[] = [];
    if (!s.product_type?.trim()) missing.push("product type");
    if (!s.material?.trim()) missing.push("material");
    if (!(s.width != null && s.width > 0)) missing.push("width");
    if (!(s.height != null && s.height > 0)) missing.push("height");
    if (!((s.quantity ?? 0) > 0)) missing.push("quantity");
    if (!((s.unit_price ?? 0) > 0)) missing.push("unit price");
    if (missing.length > 0) {
      errors[`lineItem-${i}`] =
        `Line ${i + 1}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`;
    }
  }

  for (let i = 0; i < skus.length; i++) {
    const variants = skus[i].variants ?? [];
    for (let j = 0; j < variants.length; j++) {
      const v = variants[j];
      if (!String(v.name ?? "").trim()) {
        errors[`lineVariants-${i}`] = `Additional SKU ${j + 1}: name is required.`;
        break;
      }
      const qty = Number(v.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        errors[`lineVariants-${i}`] = `Additional SKU ${j + 1}: quantity must be greater than 0.`;
        break;
      }
    }
  }

  return errors;
}
