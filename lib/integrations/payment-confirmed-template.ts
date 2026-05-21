/**
 * payment-confirmed-template.ts
 *
 * Sent after an accountant confirms a customer-submitted payment.
 * Tells the customer their payment was received and whether production has started.
 */

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

export interface PaymentConfirmedData {
  customerName: string;
  referenceCode: string;
  amountConfirmed: number;
  inProduction: boolean;
  fullyPaid: boolean;
  orderUrl: string;
  company: CompanySettings;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildPaymentConfirmedEmail(data: PaymentConfirmedData): { subject: string; html: string } {
  const { customerName, referenceCode, amountConfirmed, inProduction, fullyPaid, orderUrl, company } = data;

  const companyName = company.company_name ?? "BazaarPrinting";
  const firstName = customerName.split(" ")[0] || customerName;
  const subject = inProduction
    ? `Payment Confirmed — ${referenceCode} is now in production · ${companyName}`
    : `Payment Confirmed — ${referenceCode} · ${companyName}`;

  const headline = inProduction
    ? "Your payment is confirmed — production has started"
    : "Your payment is confirmed";

  const bodyLine = inProduction
    ? `We&rsquo;ve verified your payment of <strong style="color:#374151;">${fmt(amountConfirmed)}</strong> for order <strong style="color:#374151;">${esc(referenceCode)}</strong>. Your order is now <strong style="color:#374151;">in production</strong>.`
    : fullyPaid
      ? `We&rsquo;ve verified your payment of <strong style="color:#374151;">${fmt(amountConfirmed)}</strong> for order <strong style="color:#374151;">${esc(referenceCode)}</strong>.`
      : `We&rsquo;ve verified your payment of <strong style="color:#374151;">${fmt(amountConfirmed)}</strong> for order <strong style="color:#374151;">${esc(referenceCode)}</strong>. We&rsquo;ll notify you when production begins.`;

  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ");
  const footerLines = [
    company.address_line1, company.address_line2, cityLine,
    company.phone ? `Tel: ${esc(company.phone)}` : null,
    company.email ? esc(company.email) : null,
    company.website ? esc(company.website) : null,
  ].filter(Boolean) as string[];

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6; border-collapse:collapse;"><tr><td align="center" style="padding:24px 16px 40px;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; border-collapse:collapse;">
<tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b; padding:22px 28px; text-align:center; border-radius:8px 8px 0 0;">${
  company.logo_url
    ? `<img src="${esc(company.logo_url)}" alt="${esc(companyName)}" width="130" style="display:block; margin:0 auto; max-height:40px; width:auto;" />`
    : `<span style="font-family:Arial,Helvetica,sans-serif; font-size:18px; font-weight:bold; color:#e8c97a; letter-spacing:3px;">${esc(companyName.toUpperCase())}</span>`
}</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff; padding:0; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td style="padding:24px 28px 8px; font-family:Arial,Helvetica,sans-serif; font-size:20px; line-height:1.3; font-weight:bold; color:#111827;">Hi ${esc(firstName)},</td></tr>
<tr><td style="padding:0 28px 12px; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:1.4; font-weight:bold; color:#166534;">${headline}</td></tr>
<tr><td style="padding:0 28px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#6b7280;">${bodyLine}</td></tr>
<tr><td style="padding:0 28px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#f0fdf4" style="background-color:#f0fdf4; border-left:3px solid #16a34a; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; vertical-align:middle;"><span style="font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:1px;">Order Reference</span><br><strong style="font-size:18px; color:#111827;">${esc(referenceCode)}</strong></td><td bgcolor="#f0fdf4" style="background-color:#f0fdf4; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; text-align:right; vertical-align:middle; white-space:nowrap;"><span style="font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:4px;">Confirmed</span><strong style="font-size:22px; color:#16a34a; font-family:Arial,Helvetica,sans-serif;">${fmt(amountConfirmed)}</strong></td></tr></table></td></tr>
<tr><td bgcolor="#e5e7eb" style="background-color:#e5e7eb; height:1px; padding:0; font-size:1px; line-height:1px; mso-line-height-rule:exactly;">&nbsp;</td></tr>
<tr><td align="center" style="padding:24px 28px 8px;"><a href="${esc(orderUrl)}" target="_blank" style="display:inline-block; background-color:#e8c97a; color:#1b2b4b; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; text-decoration:none; padding:14px 36px; border-radius:6px; letter-spacing:0.3px;">View Your Order</a></td></tr>
<tr><td align="center" style="padding:0 28px 8px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.4; color:#9ca3af;">Track your order status anytime at: <a href="${esc(orderUrl)}" style="color:#6b7280; word-break:break-all;">${esc(orderUrl)}</a></td></tr>
<tr><td style="padding:12px 28px 24px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.5; color:#9ca3af;">Questions? Reply to this email or contact us directly &mdash; we&rsquo;re happy to help.</td></tr>
</table></td></tr>
<tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b; padding:0; border-radius:0 0 8px 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" style="padding:18px 28px 6px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.4; font-weight:bold; color:#e8c97a;">${esc(companyName)}</td></tr>${footerLines.map(l => `<tr><td align="center" style="padding:2px 28px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#8899aa;">${l}</td></tr>`).join("")}<tr><td align="center" style="padding:12px 28px 18px; font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:1.4; color:#4a5568;">This email was sent by ${esc(companyName)} via BazaarPrinting CRM.</td></tr></table></td></tr>
</table></td></tr></table></body>
</html>`;

  return { subject, html };
}
