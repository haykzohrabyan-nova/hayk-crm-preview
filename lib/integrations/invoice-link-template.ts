/**
 * Email sent when staff resend the customer portal / invoice link.
 * Neutral copy — works for paid, unpaid, in production, or completed orders.
 */

import { fmtEmailCurrency } from "./email-format";

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

export interface InvoiceLinkEmailData {
  customerName: string;
  referenceCode: string;
  finalTotal: number;
  orderUrl: string;
  statusLine: string;
  company: CompanySettings;
  revisionNotice?: "admin";
}


function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildInvoiceLinkEmail(data: InvoiceLinkEmailData): { subject: string; html: string } {
  const { customerName, referenceCode, finalTotal, orderUrl, statusLine, company, revisionNotice } = data;

  const companyName = company.company_name ?? "BazaarPrinting";
  const firstName = customerName.split(" ")[0] || customerName;
  const subject = revisionNotice
    ? `Updated order ${referenceCode} — please review · ${companyName}`
    : `Your Order ${referenceCode} — View Online · ${companyName}`;

  const revisionBanner = revisionNotice
    ? `<tr><td style="padding:0 28px 16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#fffbeb" style="background-color:#fffbeb; border:1px solid #fde68a; border-left:4px solid #d97706; padding:12px 14px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#92400e;"><strong>Update:</strong> Your order has been revised by our team. Open the link below to view the latest details.</td></tr></table></td></tr>`
    : "";

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
<tr><td style="padding:0 28px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#6b7280;">${
  revisionNotice ? "Your order was updated. Please review the latest information on your customer portal." : esc(statusLine)
}</td></tr>
${revisionBanner}
<tr><td style="padding:0 28px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#f9fafb" style="background-color:#f9fafb; border-left:3px solid #1b2b4b; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; vertical-align:middle;"><span style="font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:1px;">Order Reference</span><br><strong style="font-size:18px; color:#111827;">${esc(referenceCode)}</strong></td><td bgcolor="#f9fafb" style="background-color:#f9fafb; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; text-align:right; vertical-align:middle; white-space:nowrap;"><span style="font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:4px;">Order Total</span><strong style="font-size:22px; color:#c9a84c; font-family:Arial,Helvetica,sans-serif;">${fmtEmailCurrency(finalTotal)}</strong></td></tr></table></td></tr>
<tr><td bgcolor="#e5e7eb" style="background-color:#e5e7eb; height:1px; padding:0; font-size:1px; line-height:1px; mso-line-height-rule:exactly;">&nbsp;</td></tr>
<tr><td align="center" style="padding:24px 28px 8px;"><a href="${esc(orderUrl)}" target="_blank" style="display:inline-block; background-color:#e8c97a; color:#1b2b4b; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; text-decoration:none; padding:14px 36px; border-radius:6px; letter-spacing:0.3px;">View Order &amp; Invoice</a></td></tr>
<tr><td align="center" style="padding:0 28px 8px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.4; color:#9ca3af;">Or open this link: <a href="${esc(orderUrl)}" style="color:#6b7280; word-break:break-all;">${esc(orderUrl)}</a></td></tr>
<tr><td style="padding:12px 28px 24px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.5; color:#9ca3af;">Questions? Reply to this email or contact us directly &mdash; we&rsquo;re happy to help.</td></tr>
</table></td></tr>
<tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b; padding:0; border-radius:0 0 8px 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" style="padding:18px 28px 6px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.4; font-weight:bold; color:#e8c97a;">${esc(companyName)}</td></tr>${footerLines.map(l => `<tr><td align="center" style="padding:2px 28px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#8899aa;">${l}</td></tr>`).join("")}<tr><td align="center" style="padding:12px 28px 18px; font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:1.4; color:#4a5568;">This email was sent by ${esc(companyName)} via BazaarPrinting CRM.</td></tr></table></td></tr>
</table></td></tr></table></body>
</html>`;

  return { subject, html };
}
