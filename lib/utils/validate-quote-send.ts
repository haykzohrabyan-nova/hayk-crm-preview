import { validateEmail } from "@/lib/utils/email";
import { validatePhone } from "@/lib/utils/phone";

export interface QuoteSendValidationInput {
  title: string;
  dueDate: string;
  skus: { product_type?: string; quantity?: number; unit_price?: number }[];
  taxExempt: boolean;
  salesPermit: string;
  paymentDraft: {
    ticket_payment_strategy: "partial" | "full" | "net";
    ticket_dep_handling: "cash" | "gateway";
    ticket_receipt_id: string;
    ticket_full_channels: string[];
    ticket_quote_channel: "sms" | "email" | "both";
    ticket_dest_phone: string;
    ticket_dest_email: string;
  };
}

/** Receipt ID is required for partial cash/offline deposit or full cash-only payment. */
export function isCashReceiptRequired(
  draft: QuoteSendValidationInput["paymentDraft"],
): boolean {
  if (draft.ticket_payment_strategy === "partial" && draft.ticket_dep_handling === "cash") {
    return true;
  }
  if (
    draft.ticket_payment_strategy === "full" &&
    draft.ticket_full_channels.length === 1 &&
    draft.ticket_full_channels[0] === "cash"
  ) {
    return true;
  }
  return false;
}

/** Human-readable labels for fields that must be filled before sending a quote. */
export function getQuoteSendMissingFields(input: QuoteSendValidationInput): string[] {
  const missing: string[] = [];
  const { title, dueDate, skus, taxExempt, salesPermit, paymentDraft: d } = input;

  if (!title.trim()) missing.push("Title");
  if (!dueDate) missing.push("Due date");

  const hasLineItem = skus.some(
    (s) => s.product_type?.trim() && (s.quantity ?? 0) > 0 && (s.unit_price ?? 0) > 0,
  );
  if (!hasLineItem) missing.push("At least one complete line item");

  if (taxExempt && !salesPermit.trim()) {
    missing.push("Sales Permit #");
  }

  if (isCashReceiptRequired(d)) {
    const receiptId = d.ticket_receipt_id.trim();
    if (!receiptId) missing.push("Receipt ID");
    else if (!/^\d+$/.test(receiptId)) missing.push("Receipt ID (numbers only)");
  }

  const channel = d.ticket_quote_channel;
  const email = d.ticket_dest_email.trim();
  const phone = d.ticket_dest_phone.trim();

  if (channel === "email" || channel === "both") {
    if (!email) missing.push("Email address");
    else {
      const emailErr = validateEmail(email);
      if (emailErr) missing.push("Valid email address");
    }
  }
  if (channel === "sms" || channel === "both") {
    if (!phone) missing.push("Phone number");
    else {
      const phoneErr = validatePhone(phone);
      if (phoneErr) missing.push("Valid phone number");
    }
  }

  return missing;
}

export function canSendQuote(input: QuoteSendValidationInput): boolean {
  return getQuoteSendMissingFields(input).length === 0;
}

export function formatQuoteSendMissingMessage(missing: string[]): string {
  if (missing.length === 0) return "";
  const list = missing.join(", ");
  return missing.length === 1
    ? `Required field missing: ${list}.`
    : `Required fields missing: ${list}.`;
}
