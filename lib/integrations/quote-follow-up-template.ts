/**
 * Short quote follow-up email — reminder to view/confirm an already-sent quote.
 */

import { fmtEmailCurrency } from "./email-format";

interface CompanySettings {
  company_name?: string | null;
  logo_url?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface QuoteFollowUpEmailData {
  customerName: string;
  referenceCode: string;
  finalTotal: number;
  confirmUrl: string;
  company: CompanySettings;
}


function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildQuoteFollowUpEmail(data: QuoteFollowUpEmailData): { subject: string; html: string } {
  const companyName = esc(data.company.company_name ?? "BazaarPrinting");
  const firstName = esc(data.customerName.split(" ")[0] || "there");
  const ref = esc(data.referenceCode);
  const total = fmtEmailCurrency(data.finalTotal);
  const url = esc(data.confirmUrl);

  const subject = `Reminder: your quote ${data.referenceCode} from ${data.company.company_name ?? "BazaarPrinting"}`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
<tr><td style="padding:28px 32px 8px;font-size:20px;font-weight:600;color:#1B2B4B;line-height:1.3;">Friendly reminder</td></tr>
<tr><td style="padding:8px 32px 16px;font-size:15px;color:#333333;line-height:1.5;">Hi ${firstName},</td></tr>
<tr><td style="padding:0 32px 16px;font-size:15px;color:#333333;line-height:1.5;">We wanted to follow up on quote <strong>${ref}</strong> from ${companyName}. Total: <strong>${total}</strong>.</td></tr>
<tr><td style="padding:0 32px 24px;font-size:15px;color:#333333;line-height:1.5;">You can review the details and confirm online anytime:</td></tr>
<tr><td style="padding:0 32px 32px;" align="center">
<a href="${url}" style="display:inline-block;background:#E8C97A;color:#1B2B4B;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">View quote</a>
</td></tr>
<tr><td style="padding:0 32px 28px;font-size:13px;color:#888888;line-height:1.5;">If you have questions, reply to this email${data.company.phone ? ` or call ${esc(data.company.phone)}` : ""}.</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html };
}
