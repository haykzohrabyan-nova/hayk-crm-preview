/**
 * Sent after an accountant approves tax-exempt documentation on a ticket.
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

export interface TaxExemptApprovedData {
  customerName: string;
  referenceCode: string;
  previousFinalTotal: number;
  newFinalTotal: number;
  totalChanged: boolean;
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

export function buildTaxExemptApprovedEmail(data: TaxExemptApprovedData): { subject: string; html: string } {
  const { customerName, referenceCode, previousFinalTotal, newFinalTotal, totalChanged, orderUrl, company } = data;
  const companyName = company.company_name ?? "BazaarPrinting";
  const firstName = customerName.split(" ")[0] || customerName;

  const subject = totalChanged
    ? `Tax-Exempt Verified — ${referenceCode} total updated · ${companyName}`
    : `Tax-Exempt Verified — ${referenceCode} · ${companyName}`;

  const headline = "Your tax-exempt documentation is verified";

  const totalLine = totalChanged
    ? `Your updated order total is <strong style="color:#374151;">${fmt(newFinalTotal)}</strong> (previously ${fmt(previousFinalTotal)}). If you already paid, your balance may be adjusted.`
    : `Your order total remains <strong style="color:#374151;">${fmt(newFinalTotal)}</strong>.`;

  const bodyLine = `We&rsquo;ve verified the tax-exempt permit for order <strong style="color:#374151;">${esc(referenceCode)}</strong>. ${totalLine}`;

  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ");
  const footerLines = [
    company.address_line1,
    company.address_line2,
    cityLine,
    company.phone ? `Tel: ${esc(company.phone)}` : null,
    company.email ? esc(company.email) : null,
    company.website ? esc(company.website) : null,
  ].filter(Boolean) as string[];

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1B2B4B;padding:24px 32px;">
${company.logo_url ? `<img src="${esc(company.logo_url)}" alt="${esc(companyName)}" height="40" style="display:block;margin-bottom:12px;" />` : ""}
<span style="color:#E8C97A;font-size:18px;font-weight:600;letter-spacing:0.05em;">${esc(companyName.toUpperCase())}</span>
</td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Hi ${esc(firstName)},</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#1B2B4B;">${headline}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${bodyLine}</p>
<p style="margin:0 0 24px;"><a href="${esc(orderUrl)}" style="display:inline-block;background:#E8C97A;color:#1B2B4B;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View your order</a></p>
</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
${footerLines.map((l) => `<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">${l}</p>`).join("")}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html };
}
