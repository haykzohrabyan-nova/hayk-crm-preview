/**
 * send-quote.ts
 * Server-side utility: delivers a quote or order to the customer via the channel
 * stored on the ticket (Email, SMS, WhatsApp, In-person).
 *
 * Called from PATCH /api/tickets/[id] when ticket_status transitions to "sent".
 */

import twilio from "twilio";
import { buildQuoteEmail } from "./quote-email-template";
import { buildPaymentReminderEmail } from "./payment-reminder-template";
import { computePricing } from "@/lib/utils/ticket-math";
import type { QuoteSku } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketForSend {
  id: string;
  title: string | null;
  reference_code: string | null;
  public_token: string;
  quote_channel: string | null;
  quote_destination: string | null;
  quote_skus: QuoteSku[];
  quote_shipping: number | null;
  discount_type: string | null;
  discount_value: string | null;
  quote_tax_rate_percent: number | null;
  quote_final_total: number | null;
  quote_payment_types: string[];
  tax_exempt: boolean;
  order_source: string | null;
  contact_name: string | null;
  customer?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

interface CompanyForSend {
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

export interface SendResult {
  ok: boolean;
  channel: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function customerDisplayName(ticket: TicketForSend): string {
  if (ticket.customer?.first_name || ticket.customer?.last_name) {
    return [ticket.customer.first_name, ticket.customer.last_name].filter(Boolean).join(" ");
  }
  return ticket.contact_name ?? "Valued Customer";
}

function publicUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/q/${token}`;
}

function buildSmsBody(ticket: TicketForSend, company: CompanyForSend): string {
  const name = customerDisplayName(ticket).split(" ")[0];
  const companyName = company.company_name ?? "BazaarPrinting";
  const total = ticket.quote_final_total
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(ticket.quote_final_total)
    : "";
  const link = publicUrl(ticket.public_token);

  const isOrder = ticket.order_source === "direct";
  if (isOrder) {
    return `Hi ${name}, your order from ${companyName} is ready! Total: ${total}. View details & payment: ${link}`;
  }
  return `Hi ${name}, your quote from ${companyName} is ready. Total: ${total}. View & confirm: ${link}`;
}

// ─── Email via Instantly AI ───────────────────────────────────────────────────

// Low-level Instantly sender. The v2/emails/send endpoint does not exist —
// v2/emails/test is the real delivery endpoint (naming is Instantly's quirk).
async function instantlySend(destination: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  const sendingAccount = process.env.INSTANTLY_SENDING_ACCOUNT;

  if (!apiKey || !sendingAccount) {
    return { ok: false, channel: "email", error: "Instantly credentials not configured." };
  }

  const payload = {
    eaccount: sendingAccount,
    to_address_email_list: [destination],
    subject,
    body: { html },
  };

  try {
    const res = await fetch("https://api.instantly.ai/api/v2/emails/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, channel: "email", error: `Instantly API error (${res.status}): ${errText}` };
    }

    return { ok: true, channel: "email" };
  } catch (err) {
    return { ok: false, channel: "email", error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendEmail(ticket: TicketForSend, company: CompanyForSend): Promise<SendResult> {
  const destination = ticket.quote_destination?.trim();
  if (!destination) {
    return { ok: false, channel: "email", error: "No destination email address." };
  }

  const pricing = computePricing({
    skus: ticket.quote_skus,
    quote_shipping: ticket.quote_shipping,
    discount_type: ticket.discount_type as "percent" | "fixed" | null,
    discount_value: ticket.discount_value,
    quote_tax_rate_percent: ticket.quote_tax_rate_percent,
    tax_exempt: ticket.tax_exempt,
  });

  const isOrder = ticket.order_source === "direct";
  const { subject, html } = buildQuoteEmail({
    customerName: customerDisplayName(ticket),
    title: ticket.title ?? "Your Quote",
    referenceCode: ticket.reference_code ?? ticket.id.slice(0, 8).toUpperCase(),
    skus: ticket.quote_skus,
    subtotal: pricing.subtotal,
    shipping: pricing.shipping,
    discountAmount: pricing.discount_amount,
    preTaxTotal: pricing.pre_tax_total,
    taxAmount: pricing.tax_amount,
    finalTotal: pricing.final_total,
    taxRate: ticket.quote_tax_rate_percent ?? 0,
    paymentTypes: ticket.quote_payment_types ?? [],
    confirmUrl: publicUrl(ticket.public_token),
    company,
    isOrder,
  });

  return instantlySend(destination, subject, html);
}

// ─── Phone number normalisation ───────────────────────────────────────────────

/**
 * Normalise a phone number to E.164 format required by Twilio.
 * - Already starts with '+' → returned as-is
 * - 10 bare digits (US/CA) → prepend +1
 * - 11 digits starting with 1 (US/CA with country code) → prepend +
 * - Anything else → strip non-digit chars and prepend '+'
 */
function toE164(phone: string): string {
  const stripped = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return phone;
  if (stripped.length === 10) return `+1${stripped}`;
  if (stripped.length === 11 && stripped.startsWith("1")) return `+${stripped}`;
  return `+${stripped}`;
}

// ─── SMS via Twilio ───────────────────────────────────────────────────────────

async function sendSms(ticket: TicketForSend, company: CompanyForSend, channel: "sms" | "whatsapp"): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken) {
    return { ok: false, channel, error: "Twilio credentials not configured." };
  }

  const destination = ticket.quote_destination?.trim();
  if (!destination) {
    return { ok: false, channel, error: "No destination phone number." };
  }

  const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
  if (!from) {
    return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };
  }

  const normalised = toE164(destination);
  const toFormatted = channel === "whatsapp" ? `whatsapp:${normalised}` : normalised;
  const body = buildSmsBody(ticket, company);

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({ from, to: toFormatted, body });
    return { ok: true, channel };
  } catch (err) {
    return { ok: false, channel, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Delivers the quote/order to the customer via the channel saved on the ticket.
 * Never throws — errors are returned in the result and should be logged by the caller.
 */
export async function sendQuoteToCustomer(
  ticket: TicketForSend,
  company: CompanyForSend
): Promise<SendResult> {
  const channel = (ticket.quote_channel ?? "").toLowerCase();

  if (channel === "email") {
    return sendEmail(ticket, company);
  }

  if (channel === "sms") {
    return sendSms(ticket, company, "sms");
  }

  if (channel === "whatsapp") {
    return sendSms(ticket, company, "whatsapp");
  }

  // In-person or unknown — no outreach needed
  return { ok: true, channel: channel || "in-person" };
}

// ─── Payment reminder ─────────────────────────────────────────────────────────

/**
 * Sends a payment reminder to the customer after their quote has been confirmed.
 * Uses a dedicated "Pay Now" email/SMS — different from the quote delivery.
 * Supports channel + destination overrides so the rep can change the channel
 * before sending (e.g. switch from email to WhatsApp).
 */
export async function sendPaymentReminder(
  ticket: TicketForSend & { reference_code: string },
  company: CompanyForSend,
  override?: { channel?: string; destination?: string }
): Promise<SendResult> {
  const channel = ((override?.channel ?? ticket.quote_channel) ?? "").toLowerCase();
  const destination = override?.destination ?? ticket.quote_destination ?? null;
  const paymentUrl = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);
  const companyName = company.company_name ?? "BazaarPrinting";

  if (channel === "email") {
    if (!destination) return { ok: false, channel: "email", error: "No destination email address." };

    const { subject, html } = buildPaymentReminderEmail({
      customerName,
      referenceCode: ticket.reference_code,
      finalTotal: ticket.quote_final_total ?? 0,
      paymentTypes: ticket.quote_payment_types ?? [],
      paymentUrl,
      company,
    });

    return instantlySend(destination, subject, html);
  }

  if (channel === "sms" || channel === "whatsapp") {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken) return { ok: false, channel, error: "Twilio credentials not configured." };
    if (!destination) return { ok: false, channel, error: "No destination phone number." };

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };

    const firstName = customerName.split(" ")[0];
    const total = ticket.quote_final_total
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(ticket.quote_final_total)
      : "";
    const body = `Hi ${firstName}, your order ${ticket.reference_code} from ${companyName} is confirmed. Please pay ${total} here: ${paymentUrl}`;
    const normalised = toE164(destination);
    const toFormatted = channel === "whatsapp" ? `whatsapp:${normalised}` : normalised;

    try {
      const client = twilio(accountSid, authToken);
      await client.messages.create({ from, to: toFormatted, body });
      return { ok: true, channel };
    } catch (err) {
      return { ok: false, channel, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: true, channel: channel || "in-person" };
}
