/**
 * ticket-math.ts
 * Pure helpers for computing quote/order pricing from raw form values.
 * All inputs are strings (as stored in job_tickets) — parsing happens here.
 */

export interface QuoteSku {
  product_type: string;
  description?: string;
  material?: string;
  lamination?: string;
  color_mode?: string;
  sides?: string;
  roll_direction?: string;
  width?: number;
  height?: number;
  quantity?: number;
  unit_price?: number;
  line_total?: number;   // Manual override — when set, used instead of qty × unit_price
  design_required?: boolean;
  die_cut?: boolean;
  spot_uv?: boolean;
  foil?: boolean;
  perforation?: boolean;
  comment?: string;
}

export interface PricingInputs {
  skus?: QuoteSku[];
  quote_shipping?: number | null;
  discount_type?: "percent" | "fixed" | null;
  discount_value?: string | null;
  quote_tax_rate_percent?: number | null;
  tax_exempt?: boolean;
}

export interface PricingResult {
  subtotal: number;
  shipping: number;
  discount_amount: number;
  pre_tax_total: number;
  tax_amount: number;
  final_total: number;
}

/** Compute the line total for a single SKU.
 *  If line_total is explicitly set by the user, use that as the override.
 *  Otherwise fall back to qty × unit_price.
 */
export function skuLineTotal(sku: QuoteSku): number {
  if (sku.line_total != null) return round2(sku.line_total);
  const qty = sku.quantity ?? 0;
  const price = sku.unit_price ?? 0;
  return round2(qty * price);
}

/** Full quote pricing calculation. */
export function computePricing(inputs: PricingInputs): PricingResult {
  const skus = inputs.skus ?? [];
  const subtotal = round2(skus.reduce((sum, s) => sum + skuLineTotal(s), 0));
  const shipping = round2(inputs.quote_shipping ?? 0);
  const subtotalPlusShipping = round2(subtotal + shipping);

  let discount_amount = 0;
  if (!inputs.tax_exempt) {
    const dv = parseFloat(inputs.discount_value ?? "0") || 0;
    if (inputs.discount_type === "percent") {
      discount_amount = round2(subtotalPlusShipping * (dv / 100));
    } else if (inputs.discount_type === "fixed") {
      discount_amount = round2(Math.min(dv, subtotalPlusShipping));
    }
  }

  const pre_tax_total = round2(subtotalPlusShipping - discount_amount);

  let tax_amount = 0;
  if (!inputs.tax_exempt) {
    const taxRate = inputs.quote_tax_rate_percent ?? 0;
    tax_amount = round2(pre_tax_total * (taxRate / 100));
  }

  const final_total = round2(pre_tax_total + tax_amount);

  return { subtotal, shipping, discount_amount, pre_tax_total, tax_amount, final_total };
}

/** Format a dollar amount for display. */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
