/**
 * Canonical SMS template keys, defaults, and admin metadata.
 * Placeholders use `{name}` syntax — see renderSmsTemplate().
 */

export type SmsTemplateKey =
  | "quote_sent"
  | "order_sent"
  | "payment_reminder"
  | "invoice_link"
  | "invoice_link_in_production_paid"
  | "invoice_link_in_production_unpaid"
  | "order_ready_pickup"
  | "payment_confirmed_full_in_production"
  | "payment_confirmed_in_production"
  | "payment_confirmed_full"
  | "payment_confirmed"
  | "tax_exempt_approved"
  | "tax_exempt_approved_total_unchanged"
  | "quote_follow_up"
  | "quote_follow_up_no_total";

export type SmsPlaceholderKey =
  | "firstName"
  | "companyName"
  | "ref"
  | "total"
  | "link"
  | "amount"
  | "pickupBlock"
  | "phoneBlock";

export type SmsTemplateDefinition = {
  key: SmsTemplateKey;
  label: string;
  description: string;
  group: "delivery" | "payment" | "invoice" | "pickup" | "follow_up";
  placeholders: SmsPlaceholderKey[];
  defaultBody: string;
};

export const SMS_TEMPLATE_GROUPS: { id: SmsTemplateDefinition["group"]; label: string }[] = [
  { id: "delivery", label: "Quote & order delivery" },
  { id: "payment", label: "Payment reminders & confirmations" },
  { id: "invoice", label: "Invoice & portal links" },
  { id: "pickup", label: "Ready for pickup" },
  { id: "follow_up", label: "Quote follow-up" },
];

export const SMS_TEMPLATE_DEFINITIONS: SmsTemplateDefinition[] = [
  {
    key: "quote_sent",
    label: "Quote sent",
    description: "When a quote is sent to the customer (SMS or WhatsApp).",
    group: "delivery",
    placeholders: ["firstName", "companyName", "total", "link"],
    defaultBody:
      "Hi {firstName}, your quote from {companyName} is ready. Total: {total}. View & confirm: {link}",
  },
  {
    key: "order_sent",
    label: "Order sent",
    description: "When a direct order is sent to the customer.",
    group: "delivery",
    placeholders: ["firstName", "companyName", "total", "link"],
    defaultBody:
      "Hi {firstName}, your order from {companyName} is ready! Total: {total}. View details & payment: {link}",
  },
  {
    key: "payment_reminder",
    label: "Payment reminder",
    description: "After the customer confirms a quote — asks them to pay.",
    group: "payment",
    placeholders: ["firstName", "ref", "companyName", "total", "link"],
    defaultBody:
      "Hi {firstName}, your order {ref} from {companyName} is confirmed. Please pay {total} here: {link}",
  },
  {
    key: "invoice_link",
    label: "Order / invoice link (default)",
    description: "Resend portal link — general case.",
    group: "invoice",
    placeholders: ["firstName", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, here is your order link for {ref} from {companyName}. View invoice & details: {link}",
  },
  {
    key: "invoice_link_in_production_paid",
    label: "In production (paid)",
    description: "Portal link while order is in production and already paid.",
    group: "invoice",
    placeholders: ["firstName", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, your order {ref} from {companyName} is in production. View your invoice & status: {link}",
  },
  {
    key: "invoice_link_in_production_unpaid",
    label: "In production (unpaid)",
    description: "Portal link while in production with balance due.",
    group: "invoice",
    placeholders: ["firstName", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, your order {ref} from {companyName} is in production. View invoice & pay online: {link}",
  },
  {
    key: "order_ready_pickup",
    label: "Ready for pickup",
    description: "Order marked completed — pickup notification. Use {pickupBlock} and {phoneBlock} for optional address / call lines (leave empty in preview if unused).",
    group: "pickup",
    placeholders: ["firstName", "ref", "companyName", "pickupBlock", "phoneBlock", "link"],
    defaultBody:
      "Hi {firstName}, your order {ref} from {companyName} is ready for pickup!{pickupBlock}{phoneBlock} Details: {link}",
  },
  {
    key: "payment_confirmed_full_in_production",
    label: "Payment confirmed — paid in full, in production",
    group: "payment",
    description: "Accountant verified payment; order is paid in full and in production.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — your order is paid in full. Track it here: {link}",
  },
  {
    key: "payment_confirmed_in_production",
    label: "Payment confirmed — in production",
    group: "payment",
    description: "Payment verified; order moved to production (may still have balance).",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — your order is now in production. Track it here: {link}",
  },
  {
    key: "payment_confirmed_full",
    label: "Payment confirmed — paid in full",
    group: "payment",
    description: "Payment verified; ticket paid in full (not necessarily in production).",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — paid in full. View your order: {link}",
  },
  {
    key: "payment_confirmed",
    label: "Payment confirmed (partial)",
    group: "payment",
    description: "Payment verified; balance may remain.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed. View your order: {link}",
  },
  {
    key: "tax_exempt_approved",
    label: "Tax-exempt verified (total updated)",
    group: "payment",
    description: "Accountant approved tax-exempt permit; order total may have changed.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, tax-exempt documentation for order {ref} from {companyName} is verified. Your updated total is {amount}. View your order: {link}",
  },
  {
    key: "tax_exempt_approved_total_unchanged",
    label: "Tax-exempt verified (total unchanged)",
    group: "payment",
    description: "Accountant approved tax-exempt permit; total unchanged.",
    placeholders: ["firstName", "amount", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, tax-exempt documentation for order {ref} from {companyName} is verified. Your order total is {amount}. View your order: {link}",
  },
  {
    key: "quote_follow_up",
    label: "Quote follow-up (with total)",
    group: "follow_up",
    description: "Automated reminder when quote was sent but not confirmed.",
    placeholders: ["firstName", "ref", "companyName", "total", "link"],
    defaultBody:
      "Hi {firstName}, friendly reminder about your quote {ref} from {companyName} ({total}). View & confirm: {link}",
  },
  {
    key: "quote_follow_up_no_total",
    label: "Quote follow-up (no total)",
    group: "follow_up",
    description: "Same as above when quote total is not set.",
    placeholders: ["firstName", "ref", "companyName", "link"],
    defaultBody:
      "Hi {firstName}, friendly reminder about your quote {ref} from {companyName}. View & confirm: {link}",
  },
];

const DEF_BY_KEY = new Map(SMS_TEMPLATE_DEFINITIONS.map((d) => [d.key, d]));

export function getSmsTemplateDefinition(key: SmsTemplateKey): SmsTemplateDefinition {
  const def = DEF_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown SMS template key: ${key}`);
  return def;
}

export function defaultSmsTemplatesMap(): Record<SmsTemplateKey, string> {
  return Object.fromEntries(
    SMS_TEMPLATE_DEFINITIONS.map((d) => [d.key, d.defaultBody]),
  ) as Record<SmsTemplateKey, string>;
}

export const SMS_TEMPLATE_KEYS = SMS_TEMPLATE_DEFINITIONS.map((d) => d.key);

export function isSmsTemplateKey(key: string): key is SmsTemplateKey {
  return (SMS_TEMPLATE_KEYS as readonly string[]).includes(key);
}
