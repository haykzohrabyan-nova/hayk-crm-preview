/**
 * quote-email-template.ts
 *
 * Design rules:
 * 1. No <p> or <div> — all text lives directly inside <td>. Breaks use <br>.
 * 2. No font-size:0 / line-height:0 tricks on wrapper tds. They cause
 *    inherited line-height bugs and aren't needed because nested <table> tags
 *    open immediately after the parent <td> with no whitespace between them.
 * 3. All spacing via explicit padding on <td> only.
 * 4. Every <table> has cellpadding="0" cellspacing="0" and
 *    style="border-collapse:collapse" to kill browser-default 2px gutters.
 * 5. line-height is always set explicitly on cells that contain <br> tags.
 * 6. The main inner content table is single-column so all rows are consistent.
 *    Multi-column sections (reference card, line items, pricing) use their
 *    own nested tables inside a single <td> of the inner content table.
 */

import type { QuoteSku } from "@/lib/types";

interface CompanySettings {
  company_name?: string | null;
  logo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

interface QuoteEmailData {
  customerName: string;
  title: string;
  referenceCode: string | null;
  skus: QuoteSku[];
  subtotal: number;
  shipping: number;
  discountAmount: number;
  preTaxTotal: number;
  taxAmount: number;
  finalTotal: number;
  taxRate: number;
  paymentTypes: string[];
  confirmUrl: string;
  company: CompanySettings;
  isOrder?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function skuSpecs(sku: QuoteSku): string {
  const parts: string[] = [];
  if (sku.material) parts.push(esc(sku.material));
  if (sku.width && sku.height) parts.push(`${sku.width}" &times; ${sku.height}"`);
  if (sku.color_mode) parts.push(esc(sku.color_mode));
  if (sku.sides) parts.push(esc(sku.sides));
  if (sku.lamination) parts.push(esc(sku.lamination));
  const addons: string[] = [];
  if (sku.spot_uv) addons.push("UV Coating");
  if (sku.foil) addons.push("Foil");
  if (sku.perforation) addons.push("Perforation");
  if (sku.die_cut) addons.push("Die Cut");
  if (addons.length) parts.push(addons.join(", "));
  return parts.join(" &middot; ");
}

const PAYMENT_LABELS: Record<string, string> = {
  card_default: "Credit / Debit Card",
  zelle: "Zelle",
  offline: "Cash / Check / Bank Transfer",
};

// 1px horizontal rule as a self-contained <tr> for use inside the inner content table.
const HR = `<tr><td bgcolor="#e5e7eb" style="background-color:#e5e7eb; padding:0; height:1px; font-size:1px; line-height:1px; mso-line-height-rule:exactly;">&nbsp;</td></tr>`;

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildQuoteEmail(data: QuoteEmailData): { subject: string; html: string } {
  const { customerName, title, referenceCode, skus, subtotal, shipping, discountAmount, taxAmount, finalTotal, taxRate, paymentTypes, confirmUrl, company, isOrder = false } = data;

  const companyName = company.company_name ?? "BazaarPrinting";
  const subject = isOrder ? `Your Order from ${companyName} — Payment Details` : `Your Quote from ${companyName} is Ready`;
  const firstName = customerName.split(" ")[0] || customerName;
  const refCode = referenceCode ?? title ?? "—";
  const ctaLabel = isOrder ? "View Order &amp; Payment Details" : "View &amp; Confirm Quote";

  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ");
  const footerLines = [
    company.address_line1, company.address_line2, cityLine,
    company.phone ? `Tel: ${esc(company.phone)}` : null,
    company.email ? esc(company.email) : null,
    company.website ? esc(company.website) : null,
  ].filter(Boolean) as string[];

  // ── Line item rows ─────────────────────────────────────────────────────────
  const skuRows = skus.map((sku, i) => {
    const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
    const specs = skuSpecs(sku);
    const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    const cell = `background-color:${bg}; padding:10px 14px; border-bottom:1px solid #e5e7eb; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.4; color:#111827; vertical-align:top;`;
    return `<tr><td bgcolor="${bg}" style="${cell}">${esc(sku.product_type)}${specs ? `<br><span style="font-size:12px; color:#6b7280;">${specs}</span>` : ""}${sku.comment ? `<br><span style="font-size:12px; color:#9ca3af; font-style:italic;">${esc(sku.comment)}</span>` : ""}</td><td bgcolor="${bg}" style="${cell} text-align:center; white-space:nowrap;">${sku.quantity ?? 0}</td><td bgcolor="${bg}" style="${cell} text-align:right; white-space:nowrap;">${fmt(sku.unit_price ?? 0)}</td><td bgcolor="${bg}" style="${cell} font-weight:bold; text-align:right; white-space:nowrap;">${fmt(lineTotal)}</td></tr>`;
  }).join("");

  // ── Pricing rows ───────────────────────────────────────────────────────────
  const pricingPairs: [string, string][] = [["Subtotal", fmt(subtotal)]];
  if (shipping > 0) pricingPairs.push(["Shipping", fmt(shipping)]);
  if (discountAmount > 0) pricingPairs.push(["Discount", `&minus;${fmt(discountAmount)}`]);
  if (taxRate > 0) pricingPairs.push([`Tax (${taxRate}%)`, fmt(taxAmount)]);
  const pricingRows = pricingPairs.map(([label, val]) =>
    `<tr><td style="padding:3px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.4; color:#6b7280;">${label}</td><td style="padding:3px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.4; color:#374151; text-align:right;">${val}</td></tr>`
  ).join("");

  const paymentList = paymentTypes.map((k) => PAYMENT_LABELS[k] ?? k).join(", ");

  // The inner content table is SINGLE-COLUMN throughout.
  // Nested tables (reference card, line items, pricing) open immediately after
  // the parent <td> tag with no whitespace — so no font-size:0 is needed.

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6; border-collapse:collapse;"><tr><td align="center" style="padding:24px 16px 40px;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; border-collapse:collapse;"><tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b; padding:22px 28px; text-align:center; border-radius:8px 8px 0 0;">${
  company.logo_url
    ? `<img src="${esc(company.logo_url)}" alt="${esc(companyName)}" width="130" style="display:block; margin:0 auto; max-height:40px; width:auto;" />`
    : `<span style="font-family:Arial,Helvetica,sans-serif; font-size:18px; font-weight:bold; color:#e8c97a; letter-spacing:3px;">${esc(companyName.toUpperCase())}</span>`
}</td></tr><tr><td bgcolor="#ffffff" style="background-color:#ffffff; padding:0; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td style="padding:24px 28px 8px; font-family:Arial,Helvetica,sans-serif; font-size:20px; line-height:1.3; font-weight:bold; color:#111827;">Hi ${esc(firstName)},</td></tr>
<tr><td style="padding:0 28px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#6b7280;">${isOrder ? `Your order from <strong style="color:#374151;">${esc(companyName)}</strong> has been confirmed. Here are your order details.` : `Your quote from <strong style="color:#374151;">${esc(companyName)}</strong> is ready. Please review the details below and confirm when you&rsquo;re ready to proceed.`}</td></tr>
<tr><td style="padding:0 28px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#f9fafb" style="background-color:#f9fafb; border-left:3px solid #1b2b4b; padding:10px 14px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; vertical-align:middle;"><span style="font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:1px;">${isOrder ? "Order" : "Quote"} Reference</span><br><strong style="font-size:16px; color:#111827;">${esc(refCode)}</strong>${referenceCode && title ? `<br><span style="font-size:12px; color:#9ca3af;">${esc(title)}</span>` : ""}</td><td bgcolor="#f9fafb" style="background-color:#f9fafb; padding:10px 14px; font-family:Arial,Helvetica,sans-serif; text-align:right; vertical-align:middle; white-space:nowrap;"><span style="display:inline-block; background-color:#1b2b4b; color:#e8c97a; font-family:Arial,Helvetica,sans-serif; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; padding:4px 8px;">${isOrder ? "Confirmed" : "Awaiting Approval"}</span></td></tr></table></td></tr>
${HR}
<tr><td style="padding:12px 28px 6px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#6b7280;">Line Items</td></tr>
<tr><td style="padding:0 28px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; border:1px solid #e5e7eb;"><tr bgcolor="#1b2b4b" style="background-color:#1b2b4b;"><th align="left" style="padding:9px 14px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#a0aec0;">Product</th><th align="center" style="padding:9px 14px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#a0aec0; white-space:nowrap;">Qty</th><th align="right" style="padding:9px 14px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#a0aec0; white-space:nowrap;">Unit Price</th><th align="right" style="padding:9px 14px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#a0aec0; white-space:nowrap;">Total</th></tr>${skuRows}</table></td></tr>
<tr><td style="padding:14px 28px 6px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#6b7280;">Pricing Summary</td></tr>
<tr><td style="padding:0 28px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${pricingRows}<tr><td colspan="2" bgcolor="#e5e7eb" style="background-color:#e5e7eb; height:1px; padding:0; padding-top:8px; font-size:1px; line-height:1px; mso-line-height-rule:exactly;">&nbsp;</td></tr><tr><td style="padding:8px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.4; font-weight:bold; color:#111827;">Total Due</td><td style="padding:8px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:20px; line-height:1.4; font-weight:bold; color:#c9a84c; text-align:right;">${fmt(finalTotal)}</td></tr></table></td></tr>
${paymentList ? `<tr><td style="padding:14px 28px 4px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#6b7280;">Accepted Payment Methods</td></tr><tr><td style="padding:0 28px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.4; color:#374151;">${paymentList}</td></tr>` : ""}
${HR}
<tr><td align="center" style="padding:20px 28px 8px;"><a href="${esc(confirmUrl)}" target="_blank" style="display:inline-block; background-color:#e8c97a; color:#1b2b4b; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; text-decoration:none; padding:13px 32px; border-radius:6px; letter-spacing:0.3px;">${ctaLabel}</a></td></tr>
<tr><td align="center" style="padding:0 28px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.4; color:#9ca3af;">Or copy: <a href="${esc(confirmUrl)}" style="color:#6b7280; word-break:break-all;">${esc(confirmUrl)}</a></td></tr>
<tr><td style="padding:16px 28px 24px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.5; color:#9ca3af;">Questions? Reply to this email or contact us directly &mdash; we&rsquo;re happy to help.</td></tr>
</table></td></tr><tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b; padding:0; border-radius:0 0 8px 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" style="padding:18px 28px 6px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.4; font-weight:bold; color:#e8c97a;">${esc(companyName)}</td></tr>${footerLines.map(l => `<tr><td align="center" style="padding:2px 28px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#8899aa;">${l}</td></tr>`).join("")}<tr><td align="center" style="padding:12px 28px 18px; font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:1.4; color:#4a5568;">This email was sent by ${esc(companyName)} via BazaarPrinting CRM.</td></tr></table></td></tr></table></td></tr></table></body>
</html>`;

  return { subject, html };
}
