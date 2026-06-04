function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text body (already placeholder-rendered) → paragraphs inside branded HTML shell. */
export function wrapTransactionalEmailHtml(data: {
  companyName: string;
  firstName: string;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Extra HTML block before CTA (e.g. OTP line). */
  extraHtml?: string | null;
}): string {
  const companyName = data.companyName || "BazaarPrinting";
  const messageHtml = esc(data.bodyText).replace(/\n/g, "<br/>");
  const cta =
    data.ctaLabel && data.ctaUrl
      ? `<p style="text-align:center;margin:24px 0;"><a href="${esc(data.ctaUrl)}" style="display:inline-block;background-color:#e8c97a;color:#1b2b4b;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:6px;">${esc(data.ctaLabel)}</a></p>
<p style="font-size:12px;color:#9ca3af;text-align:center;word-break:break-all;"><a href="${esc(data.ctaUrl)}" style="color:#6b7280;">${esc(data.ctaUrl)}</a></p>`
      : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6"><tr><td align="center" style="padding:24px 16px 40px;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;">
<tr><td bgcolor="#1b2b4b" style="padding:22px 28px;text-align:center;border-radius:8px 8px 0 0;"><span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#e8c97a;letter-spacing:3px;">${esc(companyName.toUpperCase())}</span></td></tr>
<tr><td bgcolor="#ffffff" style="padding:24px 28px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
<p style="font-size:20px;font-weight:bold;color:#111827;margin:0 0 16px;">Hi ${esc(data.firstName)},</p>
<p style="font-size:14px;line-height:1.5;color:#374151;margin:0 0 16px;">${messageHtml}</p>
${data.extraHtml ?? ""}
${cta}
</td></tr>
<tr><td bgcolor="#1b2b4b" style="padding:16px 28px;border-radius:0 0 8px 8px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8899aa;">${esc(companyName)}</td></tr>
</table></td></tr></table></body></html>`;
}
