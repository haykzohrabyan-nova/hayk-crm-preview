/** Structured HTML blocks inserted between admin body text and CTA in transactional emails. */

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export function paymentReminderExtraHtml(referenceCode: string, finalTotal: number): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;"><tr>
<td bgcolor="#f9fafb" style="background-color:#f9fafb;border-left:3px solid #1b2b4b;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;vertical-align:middle;">
<span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Order Reference</span><br>
<strong style="font-size:18px;color:#111827;">${esc(referenceCode)}</strong>
</td>
<td bgcolor="#f9fafb" style="background-color:#f9fafb;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;text-align:right;vertical-align:middle;white-space:nowrap;">
<span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px;">Amount Due</span>
<strong style="font-size:22px;color:#c9a84c;">${fmtUsd(finalTotal)}</strong>
</td></tr></table>`;
}

export function paymentMethodsExtraHtml(paymentList: string): string {
  if (!paymentList) return "";
  return `<p style="font-size:13px;line-height:1.5;color:#6b7280;margin:0 0 16px;">Accepted payment methods: <strong style="color:#374151;">${esc(paymentList)}</strong></p>`;
}

export function invoiceLinkExtraHtml(referenceCode: string, finalTotal: number): string {
  return paymentReminderExtraHtml(referenceCode, finalTotal).replace(
    "Amount Due",
    "Order Total",
  );
}

export function invoiceRevisionBannerHtml(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;"><tr>
<td bgcolor="#fffbeb" style="background-color:#fffbeb;border:1px solid #fde68a;border-left:4px solid #d97706;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#92400e;">
<strong>Update:</strong> Your order has been revised by our team. Open the link below to view the latest details.
</td></tr></table>`;
}

export function paymentConfirmedExtraHtml(referenceCode: string, amountConfirmed: number): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;"><tr>
<td bgcolor="#f0fdf4" style="background-color:#f0fdf4;border-left:3px solid #16a34a;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;vertical-align:middle;">
<span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Order Reference</span><br>
<strong style="font-size:18px;color:#111827;">${esc(referenceCode)}</strong>
</td>
<td bgcolor="#f0fdf4" style="background-color:#f0fdf4;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;text-align:right;vertical-align:middle;white-space:nowrap;">
<span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px;">Confirmed</span>
<strong style="font-size:22px;color:#16a34a;">${fmtUsd(amountConfirmed)}</strong>
</td></tr></table>`;
}

export function orderReadyLocationExtraHtml(opts: {
  requiresShipping: boolean;
  shipToAddress?: string | null;
  pickupAddress?: string;
  companyPhone?: string | null;
}): string {
  const { requiresShipping, shipToAddress, pickupAddress, companyPhone } = opts;

  if (requiresShipping && shipToAddress) {
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;"><tr>
<td bgcolor="#f0fdf4" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#166534;">
<strong style="display:block;margin-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Ship To</strong>
${esc(shipToAddress).replace(/\n/g, "<br>")}${companyPhone ? `<br><br><strong>Phone:</strong> ${esc(companyPhone)}` : ""}
</td></tr></table>`;
  }

  if (!requiresShipping && pickupAddress) {
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;"><tr>
<td bgcolor="#f0fdf4" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#166534;">
<strong style="display:block;margin-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Pickup Location</strong>
${esc(pickupAddress)}${companyPhone ? `<br><br><strong>Phone:</strong> ${esc(companyPhone)}` : ""}
</td></tr></table>`;
  }

  if (companyPhone) {
    const label = requiresShipping ? "shipping" : "pickup";
    return `<p style="font-size:14px;line-height:1.5;color:#6b7280;margin:0 0 16px;">Please contact us at <strong style="color:#374151;">${esc(companyPhone)}</strong> for ${label} details.</p>`;
  }

  return "";
}

/** OTP line for payment evidence / tax-exempt resubmit emails (no block margins). */
export function resubmitOtpExtraHtml(otpCode: string): string {
  const safeOtp = otpCode.replace(/[<>&"]/g, "");
  return `Your verification code: <strong style="font-size:18px;letter-spacing:0.2em;color:#111827;">${safeOtp}</strong>`;
}

export function orderReadyRefExtraHtml(referenceCode: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;"><tr>
<td bgcolor="#f9fafb" style="background-color:#f9fafb;border-left:3px solid #16a34a;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
<span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Order Reference</span><br>
<strong style="font-size:18px;color:#111827;">${esc(referenceCode)}</strong>
</td></tr></table>`;
}
