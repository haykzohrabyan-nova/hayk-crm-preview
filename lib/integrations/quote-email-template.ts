/**
 * quote-email-template.ts
 * Bulletproof HTML email template for Gmail, Outlook, Apple Mail, and all major clients.
 *
 * Rules followed:
 * - 100% table-based layout (no flexbox, no grid — both are stripped by Gmail/Outlook)
 * - All styles inline (no <style> blocks — Gmail strips them)
 * - No CSS shorthand where possible
 * - No CSS variables
 * - bgcolor attribute used alongside background-color (Outlook compatibility)
 * - No CSS pseudo-classes
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function skuSpecs(sku: QuoteSku): string {
  const parts: string[] = [];
  if (sku.material) parts.push(sku.material);
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

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildQuoteEmail(data: QuoteEmailData): { subject: string; html: string } {
  const {
    customerName,
    title,
    referenceCode,
    skus,
    subtotal,
    shipping,
    discountAmount,
    taxAmount,
    finalTotal,
    taxRate,
    paymentTypes,
    confirmUrl,
    company,
    isOrder = false,
  } = data;

  const companyName = company.company_name ?? "BazaarPrinting";
  const subject = isOrder
    ? `Your Order from ${companyName} — Payment Details`
    : `Your Quote from ${companyName} is Ready`;

  const firstName = customerName.split(" ")[0] || customerName;

  // ── Address lines ────────────────────────────────────────────────────────
  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ");
  const addressLines = [company.address_line1, company.address_line2, cityLine].filter(Boolean) as string[];

  // ── Line item rows ───────────────────────────────────────────────────────
  const skuRows = skus.map((sku, i) => {
    const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
    const specs = skuSpecs(sku);
    const rowBg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    return `
      <tr>
        <td bgcolor="${rowBg}" style="background-color:${rowBg}; padding:12px 16px; border-bottom:1px solid #e5e7eb; font-family:-apple-system,Arial,sans-serif;">
          <p style="margin:0; font-size:14px; font-weight:bold; color:#1f2937;">${esc(sku.product_type)}</p>
          ${specs ? `<p style="margin:4px 0 0; font-size:12px; color:#6b7280;">${specs}</p>` : ""}
          ${sku.comment ? `<p style="margin:3px 0 0; font-size:12px; color:#6b7280; font-style:italic;">${esc(sku.comment)}</p>` : ""}
        </td>
        <td bgcolor="${rowBg}" style="background-color:${rowBg}; padding:12px 16px; border-bottom:1px solid #e5e7eb; text-align:center; font-family:-apple-system,Arial,sans-serif; font-size:14px; color:#1f2937; white-space:nowrap;">
          ${sku.quantity ?? 0}
        </td>
        <td bgcolor="${rowBg}" style="background-color:${rowBg}; padding:12px 16px; border-bottom:1px solid #e5e7eb; text-align:right; font-family:-apple-system,Arial,sans-serif; font-size:14px; color:#1f2937; white-space:nowrap;">
          ${fmt(sku.unit_price ?? 0)}
        </td>
        <td bgcolor="${rowBg}" style="background-color:${rowBg}; padding:12px 16px; border-bottom:1px solid #e5e7eb; text-align:right; font-family:-apple-system,Arial,sans-serif; font-size:14px; font-weight:bold; color:#1f2937; white-space:nowrap;">
          ${fmt(lineTotal)}
        </td>
      </tr>`;
  }).join("");

  // ── Pricing summary rows — each entry is explicitly [label, value] ────────
  const pricingRows: [string, string][] = [
    ["Subtotal", fmt(subtotal)],
  ];
  if (shipping > 0) pricingRows.push(["Shipping", fmt(shipping)]);
  if (discountAmount > 0) pricingRows.push(["Discount", `&minus;${fmt(discountAmount)}`]);
  if (taxRate > 0) pricingRows.push([`Tax (${taxRate}%)`, fmt(taxAmount)]);

  const pricingRowsHtml = pricingRows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 0; font-family:-apple-system,Arial,sans-serif; font-size:14px; color:#6b7280;">${label}</td>
      <td style="padding:6px 0; font-family:-apple-system,Arial,sans-serif; font-size:14px; color:#1f2937; text-align:right;">${value}</td>
    </tr>`).join("");

  // ── Payment methods ──────────────────────────────────────────────────────
  const paymentList = paymentTypes.map((k) => PAYMENT_LABELS[k] ?? k).join(" &middot; ");

  // ── CTA label ────────────────────────────────────────────────────────────
  const ctaLabel = isOrder ? "View Order &amp; Payment Details" : "View &amp; Confirm Quote";

  // ── Footer contact lines ─────────────────────────────────────────────────
  const footerLines = [
    ...addressLines,
    company.phone ? `Tel: ${esc(company.phone)}` : null,
    company.email ? `Email: <a href="mailto:${esc(company.email)}" style="color:#e8c97a; text-decoration:none;">${esc(company.email)}</a>` : null,
    company.website ? `<a href="${esc(company.website)}" style="color:#e8c97a; text-decoration:none;">${esc(company.website)}</a>` : null,
  ].filter(Boolean) as string[];

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f4fa; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4fa" style="background-color:#f0f4fa;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Email card — max 600px -->
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">

        <!-- ═══ HEADER ═══════════════════════════════════════════════════ -->
        <tr>
          <td bgcolor="#1b2b4b" style="background-color:#1b2b4b; border-radius:12px 12px 0 0; padding:28px 40px; text-align:center;">
            ${company.logo_url
              ? `<img src="${esc(company.logo_url)}" alt="${esc(companyName)}" width="160" style="display:block; margin:0 auto 8px; max-height:48px; width:auto;" />`
              : `<p style="margin:0 0 6px; font-family:Arial,sans-serif; font-size:22px; font-weight:bold; color:#e8c97a; letter-spacing:3px;">${esc(companyName.toUpperCase())}</p>`
            }
            <p style="margin:0; font-family:Arial,sans-serif; font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:2px; text-transform:uppercase;">Professional Printing Services</p>
          </td>
        </tr>

        <!-- ═══ BODY ══════════════════════════════════════════════════════ -->
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff; padding:36px 40px 28px;">

            <!-- Greeting -->
            <p style="margin:0 0 6px; font-family:-apple-system,Arial,sans-serif; font-size:22px; font-weight:bold; color:#1f2937;">Hi ${esc(firstName)},</p>
            <p style="margin:0 0 28px; font-family:-apple-system,Arial,sans-serif; font-size:15px; color:#6b7280; line-height:1.6;">
              ${isOrder
                ? `Your order from <strong style="color:#1f2937;">${esc(companyName)}</strong> has been confirmed. Here are the details and payment information.`
                : `Your quote from <strong style="color:#1f2937;">${esc(companyName)}</strong> is ready for review. Please look over the details below and confirm when you&rsquo;re ready to proceed.`
              }
            </p>

            <!-- Reference card -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td bgcolor="#f0f4fa" style="background-color:#f0f4fa; border:1px solid #e5e7eb; border-radius:8px; padding:0;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr valign="top">
                      <td style="padding:16px 20px; font-family:-apple-system,Arial,sans-serif; vertical-align:top;">
                        <p style="margin:0 0 4px; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#6b7280;">${isOrder ? "Order" : "Quote"} Reference</p>
                        <p style="margin:0; font-size:17px; font-weight:bold; color:#1f2937;">${esc(referenceCode ?? title ?? "—")}</p>
                        ${referenceCode && title ? `<p style="margin:3px 0 0; font-size:13px; color:#6b7280;">${esc(title)}</p>` : ""}
                      </td>
                      <td align="right" valign="top" style="padding:0; vertical-align:top; white-space:nowrap; width:1%;">
                        <span style="display:inline-block; background-color:#1b2b4b; color:#e8c97a; font-family:Arial,sans-serif; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; padding:7px 14px 8px; border-radius:0 7px 0 8px; white-space:nowrap;">
                          ${isOrder ? "Confirmed" : "Awaiting Approval"}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Line items label -->
            <p style="margin:0 0 10px; font-family:-apple-system,Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#6b7280;">Line Items</p>

            <!-- Line items table -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb; border-radius:8px; border-collapse:collapse; margin-bottom:28px; overflow:hidden;">
              <tr bgcolor="#1b2b4b" style="background-color:#1b2b4b;">
                <th align="left" style="padding:10px 16px; font-family:Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:rgba(255,255,255,0.65); border-bottom:1px solid #e5e7eb;">Product</th>
                <th align="center" style="padding:10px 16px; font-family:Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:rgba(255,255,255,0.65); border-bottom:1px solid #e5e7eb; white-space:nowrap;">Qty</th>
                <th align="right" style="padding:10px 16px; font-family:Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:rgba(255,255,255,0.65); border-bottom:1px solid #e5e7eb; white-space:nowrap;">Unit Price</th>
                <th align="right" style="padding:10px 16px; font-family:Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:rgba(255,255,255,0.65); border-bottom:1px solid #e5e7eb; white-space:nowrap;">Total</th>
              </tr>
              ${skuRows}
            </table>

            <!-- Pricing summary label -->
            <p style="margin:0 0 10px; font-family:-apple-system,Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#6b7280;">Pricing Summary</p>

            <!-- Pricing summary box -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td bgcolor="#f0f4fa" style="background-color:#f0f4fa; border:1px solid #e5e7eb; border-radius:8px; padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${pricingRowsHtml}
                    <!-- Divider -->
                    <tr>
                      <td colspan="2" style="padding:10px 0 0; border-top:2px solid #e5e7eb;">&nbsp;</td>
                    </tr>
                    <!-- Total row -->
                    <tr>
                      <td style="padding:4px 0 0; font-family:-apple-system,Arial,sans-serif; font-size:17px; font-weight:bold; color:#1f2937;">Total</td>
                      <td align="right" style="padding:4px 0 0; font-family:-apple-system,Arial,sans-serif; font-size:22px; font-weight:bold; color:#c9a84c;">${fmt(finalTotal)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            ${paymentList ? `
            <!-- Payment methods -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td bgcolor="#f0fdf4" style="background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px 20px;">
                  <p style="margin:0 0 6px; font-family:-apple-system,Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; color:#15803d;">Accepted Payment Methods</p>
                  <p style="margin:0; font-family:-apple-system,Arial,sans-serif; font-size:14px; color:#1f2937;">${paymentList}</p>
                </td>
              </tr>
            </table>` : ""}

            <!-- CTA button -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td align="center" style="padding-bottom:12px;">
                  <a href="${esc(confirmUrl)}" target="_blank" style="display:inline-block; background-color:#e8c97a; color:#1b2b4b; font-family:Arial,sans-serif; font-size:16px; font-weight:bold; text-decoration:none; padding:15px 40px; border-radius:8px; letter-spacing:0.5px;">
                    ${ctaLabel}
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <p style="margin:0; font-family:-apple-system,Arial,sans-serif; font-size:12px; color:#6b7280;">Or copy this link:</p>
                  <p style="margin:4px 0 0; font-family:-apple-system,Arial,sans-serif; font-size:12px;">
                    <a href="${esc(confirmUrl)}" style="color:#1b2b4b; word-break:break-all;">${esc(confirmUrl)}</a>
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0; font-family:-apple-system,Arial,sans-serif; font-size:13px; color:#6b7280; line-height:1.6;">
              If you have any questions, please reply to this email or contact us directly. We&rsquo;re happy to help.
            </p>

          </td>
        </tr>

        <!-- ═══ FOOTER ════════════════════════════════════════════════════ -->
        <tr>
          <td bgcolor="#1b2b4b" style="background-color:#1b2b4b; border-radius:0 0 12px 12px; padding:24px 40px; text-align:center;">
            <p style="margin:0 0 8px; font-family:Arial,sans-serif; font-size:14px; font-weight:bold; color:#e8c97a;">${esc(companyName)}</p>
            ${footerLines.map(line => `<p style="margin:0; font-family:Arial,sans-serif; font-size:12px; color:rgba(255,255,255,0.55); line-height:1.9;">${line}</p>`).join("")}
            <p style="margin:16px 0 0; font-family:Arial,sans-serif; font-size:11px; color:rgba(255,255,255,0.3);">This email was sent by ${esc(companyName)} via BazaarPrinting CRM.</p>
          </td>
        </tr>

      </table>
      <!-- end card -->

    </td>
  </tr>
</table>

</body>
</html>`;

  return { subject, html };
}
