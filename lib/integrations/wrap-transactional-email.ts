function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyParagraphRows(text: string): string {
  const paragraphs = text
    .trim()
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n\n+/)
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return `<tr><td style="padding:0 28px 16px;font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td></tr>`;
  }
  return paragraphs
    .map((paragraph, index) => {
      const isLast = index === paragraphs.length - 1;
      const padding = isLast ? "0 28px 16px" : "0 28px 8px";
      const content = esc(paragraph).replace(/\n/g, "<br/>");
      return `<tr><td style="padding:${padding};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#374151;">${content}</td></tr>`;
    })
    .join("");
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
  const bodyRows = bodyParagraphRows(data.bodyText);
  const extraRow = data.extraHtml
    ? `<tr><td style="padding:0 28px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#374151;">${data.extraHtml}</td></tr>`
    : "";
  const ctaRows =
    data.ctaLabel && data.ctaUrl
      ? `<tr><td align="center" style="padding:12px 28px 8px;font-family:Arial,Helvetica,sans-serif;"><a href="${esc(data.ctaUrl)}" target="_blank" style="display:inline-block;background-color:#e8c97a;color:#1b2b4b;font-size:15px;font-weight:bold;text-decoration:none;padding:13px 32px;border-radius:6px;letter-spacing:0.3px;">${esc(data.ctaLabel)}</a></td></tr><tr><td align="center" style="padding:0 28px 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#9ca3af;">Or copy: <a href="${esc(data.ctaUrl)}" style="color:#6b7280;word-break:break-all;">${esc(data.ctaUrl)}</a></td></tr>`
      : `<tr><td style="padding:0 28px 20px;font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td></tr>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6;border-collapse:collapse;"><tr><td align="center" style="padding:16px 16px 24px;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;"><tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b;padding:20px 28px;text-align:center;border-radius:8px 8px 0 0;"><span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#e8c97a;letter-spacing:3px;">${esc(companyName.toUpperCase())}</span></td></tr><tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:0;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="padding:20px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:bold;color:#111827;">Hi ${esc(data.firstName)},</td></tr>${bodyRows}${extraRow}${ctaRows}</table></td></tr><tr><td bgcolor="#1b2b4b" style="background-color:#1b2b4b;padding:14px 28px;border-radius:0 0 8px 8px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;color:#8899aa;">${esc(companyName)}</td></tr></table></td></tr></table></body></html>`;
}
