/**
 * welcome-email-template.ts
 *
 * Branded HTML for new-user welcome and admin password-reset emails.
 * Matches quote / order templates (quote-email-template.ts, payment-reminder-template.ts):
 *  - No <p> or <div> — text lives directly in <td>
 *  - Reference card with navy left border + status badge
 *  - Credential highlight in amber row (like deposit due)
 *  - Table-based warning block (no inline-block spans)
 *  - Gold CTA + navy footer
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

interface WelcomeEmailData {
  fullName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  company: CompanySettings;
  /** When true, sends a "password reset" variant instead of a welcome email. */
  isReset?: boolean;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const HR = `<tr><td bgcolor="#e5e7eb" style="background-color:#e5e7eb; padding:0; height:1px; font-size:1px; line-height:1px; mso-line-height-rule:exactly;">&nbsp;</td></tr>`;

function buildEmailHeader(companyName: string, logoUrl: string | null | undefined): string {
  return `<tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b; padding:22px 28px; text-align:center; border-radius:8px 8px 0 0;">${
    logoUrl
      ? `<img src="${esc(logoUrl)}" alt="${esc(companyName)}" width="130" style="display:block; margin:0 auto; max-height:40px; width:auto;" />`
      : `<span style="font-family:Arial,Helvetica,sans-serif; font-size:18px; font-weight:bold; color:#e8c97a; letter-spacing:3px;">${esc(companyName.toUpperCase())}</span>`
  }</td></tr>`;
}

function buildEmailFooter(companyName: string, footerLines: string[]): string {
  return `<tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b; padding:0; border-radius:0 0 8px 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" style="padding:18px 28px 6px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.4; font-weight:bold; color:#e8c97a;">${esc(companyName)}</td></tr>${footerLines.map((l) => `<tr><td align="center" style="padding:2px 28px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#8899aa;">${l}</td></tr>`).join("")}<tr><td align="center" style="padding:12px 28px 18px; font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:1.4; color:#4a5568;">This email was sent by ${esc(companyName)} via BazaarPrinting CRM.</td></tr></table></td></tr>`;
}

export function buildWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const { fullName, email, tempPassword, loginUrl, company, isReset = false } = data;

  const companyName = company.company_name ?? "BazaarPrinting";
  const firstName = fullName.split(" ")[0] || fullName || "there";

  const subject = isReset
    ? `Your ${companyName} CRM Password Has Been Reset`
    : `Welcome to ${companyName} CRM — Your Account is Ready`;

  const headline = isReset ? "Your password has been reset" : "Your account is ready";
  const badgeLabel = isReset ? "Password Reset" : "New Account";

  const introLine = isReset
    ? `An administrator reset your password for <strong style="color:#374151;">${esc(companyName)} CRM</strong>. Sign in with the temporary password below, then choose a new password when prompted.`
    : `Your staff account for <strong style="color:#374151;">${esc(companyName)} CRM</strong> is ready. Sign in with the credentials below to get started.`;

  const warningText = isReset
    ? `You must set a new password immediately after logging in. Do not share this email or your temporary password with anyone.`
    : `You will be asked to set a new password on first login. Keep this email safe — your temporary password is only shown here once.`;

  const ctaLabel = isReset ? "Log In &amp; Set New Password" : "Log In to Your Account";

  const helpLine = isReset
    ? `If you did not request this change, contact your administrator immediately.`
    : `Questions about your account? Contact your administrator for help.`;

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
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6; border-collapse:collapse;"><tr><td align="center" style="padding:24px 16px 40px;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; border-collapse:collapse;">
${buildEmailHeader(companyName, company.logo_url)}
<tr><td bgcolor="#ffffff" style="background-color:#ffffff; padding:0; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td style="padding:24px 28px 8px; font-family:Arial,Helvetica,sans-serif; font-size:20px; line-height:1.3; font-weight:bold; color:#111827;">Hi ${esc(firstName)},</td></tr>
<tr><td style="padding:0 28px 12px; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:1.4; font-weight:bold; color:#1b2b4b;">${headline}</td></tr>
<tr><td style="padding:0 28px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#6b7280;">${introLine}</td></tr>
<tr><td style="padding:0 28px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#f9fafb" style="background-color:#f9fafb; border-left:3px solid #1b2b4b; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; vertical-align:middle;"><span style="font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:1px;">Account Email</span><br><strong style="font-size:16px; color:#111827;">${esc(email)}</strong></td><td bgcolor="#f9fafb" style="background-color:#f9fafb; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; text-align:right; vertical-align:middle; white-space:nowrap;"><span style="display:inline-block; background-color:#1b2b4b; color:#e8c97a; font-family:Arial,Helvetica,sans-serif; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; padding:4px 8px;">${badgeLabel}</span></td></tr></table></td></tr>
<tr><td style="padding:0 28px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#fffbeb" style="background-color:#fffbeb; border-left:3px solid #f59e0b; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.4; color:#92400e; font-weight:bold; vertical-align:middle;">Temporary Password</td><td bgcolor="#fffbeb" style="background-color:#fffbeb; border-left:3px solid #f59e0b; padding:14px 18px; font-family:Arial,Helvetica,sans-serif; font-size:20px; line-height:1.4; color:#c9a84c; font-weight:bold; text-align:right; vertical-align:middle; white-space:nowrap; letter-spacing:1px;">${esc(tempPassword)}</td></tr></table></td></tr>
<tr><td style="padding:0 28px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td bgcolor="#fffbeb" style="background-color:#fffbeb; border:1px solid #fde68a; border-left:3px solid #d97706; padding:12px 14px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.5; color:#92400e;">${warningText}</td></tr></table></td></tr>
${HR}
<tr><td align="center" style="padding:24px 28px 8px;"><a href="${esc(loginUrl)}" target="_blank" style="display:inline-block; background-color:#e8c97a; color:#1b2b4b; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; text-decoration:none; padding:14px 36px; border-radius:6px; letter-spacing:0.3px;">${ctaLabel}</a></td></tr>
<tr><td align="center" style="padding:0 28px 8px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.4; color:#9ca3af;">Or copy this link: <a href="${esc(loginUrl)}" style="color:#6b7280; word-break:break-all;">${esc(loginUrl)}</a></td></tr>
<tr><td style="padding:12px 28px 24px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.5; color:#9ca3af;">${helpLine}</td></tr>
</table></td></tr>
${buildEmailFooter(companyName, footerLines)}
</table></td></tr></table></body>
</html>`;

  return { subject, html };
}
