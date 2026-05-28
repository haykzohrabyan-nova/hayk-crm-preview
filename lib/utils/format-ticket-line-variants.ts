export interface TicketLineVariantDisplay {
  name: string;
  quantity: number;
}

/** Single line for UI/email/PDF, e.g. "SKU-A · Qty 500". */
export function formatTicketLineVariantLabel(v: TicketLineVariantDisplay): string {
  const qty = Number(v.quantity);
  const qtyStr = Number.isFinite(qty) && qty % 1 === 0 ? String(Math.round(qty)) : String(qty);
  return `${v.name.trim()} · Qty ${qtyStr}`;
}

export function formatTicketLineVariantsList(variants: TicketLineVariantDisplay[]): string {
  if (!variants.length) return "";
  return variants.map(formatTicketLineVariantLabel).join(", ");
}
