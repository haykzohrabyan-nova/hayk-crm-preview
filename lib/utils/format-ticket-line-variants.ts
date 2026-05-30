export interface TicketLineVariantDisplay {
  name: string;
  quantity: number;
}

/** 1-based index → `SKU1.` */
export function additionalSkuPrefix(index: number): string {
  return `SKU${index}.`;
}

/** Display name with SKU prefix, e.g. `SKU1. Widget`. */
export function formatAdditionalSkuDisplayName(index: number, name: string): string {
  const n = name.trim() || "—";
  return `${additionalSkuPrefix(index)} ${n}`;
}

/** Single line for UI/email/PDF, e.g. `SKU1. Widget · Qty 500`. */
export function formatTicketLineVariantLabel(
  v: TicketLineVariantDisplay,
  /** 1-based SKU number; when set, prefixes the name with `SKU{n}.` */
  skuIndex?: number,
): string {
  const qty = Number(v.quantity);
  const qtyStr = Number.isFinite(qty) && qty % 1 === 0 ? String(Math.round(qty)) : String(qty);
  const namePart =
    skuIndex != null ? formatAdditionalSkuDisplayName(skuIndex, v.name) : v.name.trim() || "—";
  return `${namePart} · Qty ${qtyStr}`;
}

export function formatTicketLineVariantsList(variants: TicketLineVariantDisplay[]): string {
  if (!variants.length) return "";
  return variants.map((v, i) => formatTicketLineVariantLabel(v, i + 1)).join(", ");
}
