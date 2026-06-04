/**
 * Admin-editable customer email templates (subject + body + CTA).
 * Placeholders use `{name}` syntax — see renderEmailTemplate().
 */

export type EmailTemplateKey =
  | "quote_sent"
  | "order_sent"
  | "quote_sent_revision"
  | "order_sent_revision"
  | "payment_reminder"
  | "invoice_link"
  | "invoice_link_in_production_paid"
  | "invoice_link_in_production_unpaid"
  | "invoice_link_revision"
  | "order_ready_pickup"
  | "order_ready_shipped"
  | "payment_confirmed_full_in_production"
  | "payment_confirmed_in_production"
  | "payment_confirmed_full"
  | "payment_confirmed"
  | "tax_exempt_approved"
  | "tax_exempt_approved_total_unchanged"
  | "payment_evidence_resubmit_requested"
  | "tax_exempt_resubmit_requested"
  | "quote_follow_up"
  | "quote_follow_up_no_total";

export type EmailPlaceholderKey =
  | "firstName"
  | "companyName"
  | "ref"
  | "link"
  | "total"
  | "amount"
  | "statusLine"
  | "otpCode"
  | "previousTotal";

export type EmailTemplateDefinition = {
  key: EmailTemplateKey;
  label: string;
  description: string;
  group: "delivery" | "payment" | "invoice" | "pickup" | "follow_up";
  placeholders: EmailPlaceholderKey[];
  defaultSubject: string;
  defaultBody: string;
  defaultCtaLabel: string;
};

export const EMAIL_TEMPLATE_GROUPS: { id: EmailTemplateDefinition["group"]; label: string }[] = [
  { id: "delivery", label: "Quote & order delivery" },
  { id: "payment", label: "Payment reminders & confirmations" },
  { id: "invoice", label: "Invoice & portal links" },
  { id: "pickup", label: "Ready for pickup / shipped" },
  { id: "follow_up", label: "Quote follow-up" },
];

export const EMAIL_TEMPLATE_DEFINITIONS: EmailTemplateDefinition[] = [
  {
    key: "quote_sent",
    label: "Quote sent",
    group: "delivery",
    description: "Full quote email — intro and CTA are editable; line items and pricing stay on the email layout.",
    placeholders: ["firstName", "companyName", "ref", "link"],
    defaultSubject: "Your Quote from {companyName} is Ready",
    defaultBody:
      "Your quote from {companyName} is ready. Please review the details below and confirm when you are ready to proceed.",
    defaultCtaLabel: "View & Confirm Quote",
  },
  {
    key: "order_sent",
    label: "Order sent",
    group: "delivery",
    description: "Direct order confirmation email — intro and CTA editable; line items and pricing unchanged.",
    placeholders: ["firstName", "companyName", "ref", "link"],
    defaultSubject: "Your Order from {companyName} — Payment Details",
    defaultBody:
      "Your order from {companyName} has been confirmed. Here are your order details.",
    defaultCtaLabel: "View Order & Payment Details",
  },
  {
    key: "quote_sent_revision",
    label: "Quote sent (revised)",
    group: "delivery",
    description: "When staff revise a quote the customer already received.",
    placeholders: ["firstName", "companyName", "ref", "link"],
    defaultSubject: "Updated quote from {companyName} — {ref}",
    defaultBody:
      "Please open the link below to view the current version of your quote.",
    defaultCtaLabel: "View & Confirm Quote",
  },
  {
    key: "order_sent_revision",
    label: "Order sent (revised)",
    group: "delivery",
    description: "When staff revise a direct order the customer already received.",
    placeholders: ["firstName", "companyName", "ref", "link"],
    defaultSubject: "Updated order from {companyName} — {ref}",
    defaultBody:
      "Please open the link below to view the current version of your order.",
    defaultCtaLabel: "View Order & Payment Details",
  },
  {
    key: "payment_reminder",
    label: "Payment reminder",
    group: "payment",
    description: "After the customer confirms a quote — asks them to pay.",
    placeholders: ["firstName", "ref", "companyName", "total", "link"],
    defaultSubject: "Payment Required — {ref} · {companyName}",
    defaultBody:
      "Your order with {companyName} has been confirmed. Please complete your payment of {total} to start production.",
    defaultCtaLabel: "Pay Now",
  },
  {
    key: "invoice_link",
    label: "Order / invoice link (default)",
    group: "invoice",
    description: "Resend portal link — general case. Use {statusLine} for the main paragraph.",
    placeholders: ["firstName", "ref", "companyName", "total", "link", "statusLine"],
    defaultSubject: "Your Order {ref} — View Online · {companyName}",
    defaultBody: "{statusLine}",
    defaultCtaLabel: "View Order & Invoice",
  },
  {
    key: "invoice_link_in_production_paid",
    label: "In production (paid)",
    group: "invoice",
    description: "Portal link while order is in production and already paid.",
    placeholders: ["firstName", "ref", "companyName", "total", "link", "statusLine"],
    defaultSubject: "Your Order {ref} — View Online · {companyName}",
    defaultBody: "{statusLine}",
    defaultCtaLabel: "View Order & Invoice",
  },
  {
    key: "invoice_link_in_production_unpaid",
    label: "In production (unpaid)",
    group: "invoice",
    description: "Portal link while in production with balance due.",
    placeholders: ["firstName", "ref", "companyName", "total", "link", "statusLine"],
    defaultSubject: "Your Order {ref} — View Online · {companyName}",
    defaultBody: "{statusLine}",
    defaultCtaLabel: "View Order & Invoice",
  },
  {
    key: "invoice_link_revision",
    label: "Order revised (admin)",
    group: "invoice",
    description: "When staff revise an order and resend the portal link.",
    placeholders: ["firstName", "ref", "companyName", "total", "link"],
    defaultSubject: "Updated order {ref} — please review · {companyName}",
    defaultBody:
      "Your order was updated. Please review the latest information on your customer portal.",
    defaultCtaLabel: "View Order & Invoice",
  },
  {
    key: "order_ready_pickup",
    label: "Ready for pickup",
    group: "pickup",
    description: "Order marked completed — pickup at the print shop. Pickup address block is added automatically when configured.",
    placeholders: ["firstName", "ref", "companyName", "link"],
    defaultSubject: "Your Order {ref} Is Ready for Pickup · {companyName}",
    defaultBody:
      "Great news — your order {ref} is complete and ready for pickup at our print shop.",
    defaultCtaLabel: "View Order Details",
  },
  {
    key: "order_ready_shipped",
    label: "Order shipped",
    group: "pickup",
    description: "Order marked completed and shipping. Ship-to block is added automatically when on file.",
    placeholders: ["firstName", "ref", "companyName", "link"],
    defaultSubject: "Your Order {ref} Has Shipped · {companyName}",
    defaultBody: "Great news — your order {ref} is complete and is ready to ship.",
    defaultCtaLabel: "View Order Details",
  },
  {
    key: "payment_confirmed_full_in_production",
    label: "Payment confirmed — paid in full, in production",
    group: "payment",
    description: "Accountant verified payment; order is paid in full and in production.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultSubject: "Payment Confirmed — {ref} paid in full · {companyName}",
    defaultBody:
      "We have verified your payment of {amount} for order {ref}. Your order is paid in full and remains in production — we will notify you when it is ready.",
    defaultCtaLabel: "View Your Order",
  },
  {
    key: "payment_confirmed_in_production",
    label: "Payment confirmed — in production",
    group: "payment",
    description: "Payment verified; order moved to production (may still have balance).",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultSubject: "Payment Confirmed — {ref} is now in production · {companyName}",
    defaultBody:
      "We have verified your payment of {amount} for order {ref}. Your order is now in production.",
    defaultCtaLabel: "View Your Order",
  },
  {
    key: "payment_confirmed_full",
    label: "Payment confirmed — paid in full",
    group: "payment",
    description: "Payment verified; ticket paid in full (not necessarily in production).",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultSubject: "Payment Confirmed — {ref} · {companyName}",
    defaultBody:
      "We have verified your payment of {amount} for order {ref}. Your order is paid in full.",
    defaultCtaLabel: "View Your Order",
  },
  {
    key: "payment_confirmed",
    label: "Payment confirmed (partial)",
    group: "payment",
    description: "Payment verified; balance may remain.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultSubject: "Payment Confirmed — {ref} · {companyName}",
    defaultBody:
      "We have verified your payment of {amount} for order {ref}. We will notify you when production begins.",
    defaultCtaLabel: "View Your Order",
  },
  {
    key: "tax_exempt_approved",
    label: "Tax-exempt verified (total updated)",
    group: "payment",
    description: "Accountant approved tax-exempt permit; order total may have changed.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link", "previousTotal"],
    defaultSubject: "Tax-Exempt Verified — {ref} total updated · {companyName}",
    defaultBody:
      "We have verified the tax-exempt permit for order {ref}. Your updated order total is {amount} (previously {previousTotal}). If you already paid, your balance may be adjusted.",
    defaultCtaLabel: "View your order",
  },
  {
    key: "tax_exempt_approved_total_unchanged",
    label: "Tax-exempt verified (total unchanged)",
    group: "payment",
    description: "Accountant approved tax-exempt permit; total unchanged.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultSubject: "Tax-Exempt Verified — {ref} · {companyName}",
    defaultBody:
      "We have verified the tax-exempt permit for order {ref}. Your order total remains {amount}.",
    defaultCtaLabel: "View your order",
  },
  {
    key: "payment_evidence_resubmit_requested",
    label: "Payment evidence resubmit requested",
    group: "payment",
    description:
      "Sent when an accountant asks the customer to upload updated payment proof. Include {otpCode} in the body.",
    placeholders: ["firstName", "companyName", "ref", "link", "otpCode"],
    defaultSubject: "Action needed — upload payment proof for {ref} · {companyName}",
    defaultBody:
      "We need an updated payment proof for order {ref} from {companyName}.\n\n" +
      "Your verification code is {otpCode}. Open the link below, enter the code, and upload your payment confirmation.\n\n" +
      "If you have questions, reply to this message.",
    defaultCtaLabel: "Upload payment proof",
  },
  {
    key: "tax_exempt_resubmit_requested",
    label: "Tax-exempt permit resubmit requested",
    group: "payment",
    description:
      "Sent when an accountant asks the customer to upload an updated tax-exempt permit. Include {otpCode} in the body.",
    placeholders: ["firstName", "companyName", "ref", "link", "otpCode"],
    defaultSubject: "Action needed — upload tax-exempt permit for {ref} · {companyName}",
    defaultBody:
      "We need an updated tax-exempt permit for order {ref} from {companyName}.\n\n" +
      "Your verification code is {otpCode}. Open the link below, enter the code, and upload the new document.\n\n" +
      "If you have questions, reply to this message.",
    defaultCtaLabel: "Upload permit",
  },
  {
    key: "quote_follow_up",
    label: "Quote follow-up (with total)",
    group: "follow_up",
    description: "Automated reminder when quote was sent but not confirmed.",
    placeholders: ["firstName", "ref", "companyName", "total", "link"],
    defaultSubject: "Reminder: your quote {ref} from {companyName}",
    defaultBody:
      "We wanted to follow up on quote {ref} from {companyName}. Total: {total}.\n\n" +
      "You can review the details and confirm online anytime using the button below.",
    defaultCtaLabel: "View quote",
  },
  {
    key: "quote_follow_up_no_total",
    label: "Quote follow-up (no total)",
    group: "follow_up",
    description: "Same as above when quote total is not set.",
    placeholders: ["firstName", "ref", "companyName", "link"],
    defaultSubject: "Reminder: your quote {ref} from {companyName}",
    defaultBody:
      "We wanted to follow up on quote {ref} from {companyName}.\n\n" +
      "You can review the details and confirm online anytime using the button below.",
    defaultCtaLabel: "View quote",
  },
];

const KEY_SET = new Set(EMAIL_TEMPLATE_DEFINITIONS.map((d) => d.key));

export function isEmailTemplateKey(key: string): key is EmailTemplateKey {
  return KEY_SET.has(key as EmailTemplateKey);
}

export function defaultEmailTemplatesMap(): Record<
  EmailTemplateKey,
  { subject: string; body: string; ctaLabel: string }
> {
  return Object.fromEntries(
    EMAIL_TEMPLATE_DEFINITIONS.map((d) => [
      d.key,
      { subject: d.defaultSubject, body: d.defaultBody, ctaLabel: d.defaultCtaLabel },
    ]),
  ) as Record<EmailTemplateKey, { subject: string; body: string; ctaLabel: string }>;
}
