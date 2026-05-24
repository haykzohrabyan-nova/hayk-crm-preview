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
import { buildPaymentConfirmedEmail } from "./payment-confirmed-template";
import { buildInvoiceLinkEmail } from "./invoice-link-template";
import { buildOrderReadyEmail, formatPickupAddress } from "./order-ready-template";
import type { QuoteSku } from "@/lib/types";
import { ticketDisplayReference } from "@/lib/utils/reference-codes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketForSend {
  id: string;
  title: string | null;
  reference_code: string | null;
  public_token: string;
  quote_channel: string | null;
  quote_destination: string | null;
  ticket_quote_channel?: string | null;
  ticket_dest_email?: string | null;
  ticket_dest_phone?: string | null;
  ticket_status?: string | null;
  payment_status?: string | null;
  quote_skus: QuoteSku[];
  quote_subtotal: number | null;
  quote_shipping: number | null;
  quote_pre_tax_total: number | null;
  quote_tax_rate_percent: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  discount_type: string | null;
  discount_value: string | null;
  quote_payment_types: string[];
  prepayment_type: string | null;
  prepayment_value: string | null;
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

function customerDisplayName(ticket: {
  customer?: TicketForSend["customer"];
  contact_name?: string | null;
}): string {
  if (ticket.customer?.first_name || ticket.customer?.last_name) {
    return [ticket.customer.first_name, ticket.customer.last_name].filter(Boolean).join(" ");
  }
  return ticket.contact_name ?? "Valued Customer";
}

function publicUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/q/${token}`;
}

/** Resolve delivery channel + destination from per-ticket and legacy quote fields. */
export function resolveTicketOutreach(
  ticket: TicketForSend,
  override?: { channel?: string; destination?: string },
): { channel: string; destination: string | null } {
  if (override?.destination) {
    const ch = (override.channel ?? ticket.ticket_quote_channel ?? ticket.quote_channel ?? "email").toLowerCase();
    return { channel: ch === "whatsapp" ? "whatsapp" : ch === "sms" || ch === "both" ? "sms" : "email", destination: override.destination };
  }

  const perTicket = (ticket.ticket_quote_channel ?? "").toLowerCase();
  const legacy = (ticket.quote_channel ?? "").toLowerCase();

  if (perTicket === "email") {
    return {
      channel: "email",
      destination: ticket.ticket_dest_email ?? ticket.quote_destination ?? ticket.customer?.email ?? null,
    };
  }
  if (perTicket === "sms" || perTicket === "both") {
    const phone = ticket.ticket_dest_phone ?? ticket.quote_destination ?? ticket.customer?.phone ?? null;
    const email = ticket.ticket_dest_email ?? ticket.customer?.email ?? null;
    if (perTicket === "both" && email) return { channel: "email", destination: email };
    return { channel: "sms", destination: phone };
  }

  if (legacy === "email") {
    return { channel: "email", destination: ticket.quote_destination ?? ticket.customer?.email ?? null };
  }
  if (legacy === "whatsapp") {
    return { channel: "whatsapp", destination: ticket.quote_destination ?? ticket.customer?.phone ?? null };
  }
  if (legacy === "sms") {
    return { channel: "sms", destination: ticket.quote_destination ?? ticket.customer?.phone ?? null };
  }

  return {
    channel: "email",
    destination: ticket.quote_destination ?? ticket.ticket_dest_email ?? ticket.customer?.email ?? null,
  };
}

function invoiceStatusLine(ticket: TicketForSend): string {
  const ref = ticket.reference_code ?? "your order";
  const status = ticket.ticket_status ?? "";
  const paid = ticket.payment_status === "paid";

  if (status === "completed") {
    return `Here is your link to view order ${ref} and download your invoice. Thank you for your business!`;
  }
  if (status === "in_production") {
    return paid
      ? `Your order ${ref} is in production. Use the link below to view status and your invoice anytime.`
      : `Your order ${ref} is in production. View your invoice, order details, and pay online if you wish using the link below.`;
  }
  if (paid) {
    return `Here is your link to view order ${ref} and access your invoice online.`;
  }
  return `Here is your link to view order ${ref}, see your invoice, and complete payment if needed.`;
}

function buildInvoiceSmsBody(ticket: TicketForSend, company: CompanyForSend): string {
  const name = customerDisplayName(ticket).split(" ")[0];
  const companyName = company.company_name ?? "BazaarPrinting";
  const ref = ticketDisplayReference(ticket);
  const link = publicUrl(ticket.public_token);
  const paid = ticket.payment_status === "paid";
  const inProd = ticket.ticket_status === "in_production";

  if (inProd && paid) {
    return `Hi ${name}, your order ${ref} from ${companyName} is in production. View your invoice & status: ${link}`;
  }
  if (inProd) {
    return `Hi ${name}, your order ${ref} from ${companyName} is in production. View invoice & pay online: ${link}`;
  }
  return `Hi ${name}, here is your order link for ${ref} from ${companyName}. View invoice & details: ${link}`;
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

  // Use the pre-computed stored values so email and public page always show the same numbers.
  // Discount amount = subtotal + shipping - pre_tax_total (same derivation used on the public page).
  const subtotal = ticket.quote_subtotal ?? 0;
  const shipping = ticket.quote_shipping ?? 0;
  const preTaxTotal = ticket.quote_pre_tax_total ?? subtotal + shipping;
  const discountAmount = Math.max(subtotal + shipping - preTaxTotal, 0);
  const taxAmount = ticket.quote_tax_amount ?? 0;
  const finalTotal = ticket.quote_final_total ?? preTaxTotal + taxAmount;

  const isOrder = ticket.order_source === "direct";
  const { subject, html } = buildQuoteEmail({
    customerName: customerDisplayName(ticket),
    title: ticket.title ?? "Your Quote",
    referenceCode: ticketDisplayReference(ticket),
    skus: ticket.quote_skus,
    subtotal,
    shipping,
    discountAmount,
    preTaxTotal,
    taxAmount,
    finalTotal,
    taxRate: ticket.quote_tax_rate_percent ?? 0,
    paymentTypes: ticket.quote_payment_types ?? [],
    prepaymentType: ticket.prepayment_type,
    prepaymentValue: ticket.prepayment_value,
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

// ─── Resend invoice / customer portal link ───────────────────────────────────

/**
 * Sends the customer their permanent order portal link (/q/{token}).
 * Used when a customer lost the link — works for paid, unpaid, and in-production orders.
 */
export async function sendInvoiceLinkToCustomer(
  ticket: TicketForSend & { reference_code: string },
  company: CompanyForSend,
  override?: { channel?: string; destination?: string },
): Promise<SendResult> {
  const { channel, destination } = resolveTicketOutreach(ticket, override);
  const orderUrl = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);

  if (!destination) {
    return { ok: false, channel, error: "No customer email or phone on file." };
  }

  if (channel === "email") {
    const { subject, html } = buildInvoiceLinkEmail({
      customerName,
      referenceCode: ticket.reference_code,
      finalTotal: ticket.quote_final_total ?? 0,
      orderUrl,
      statusLine: invoiceStatusLine(ticket),
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

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) {
      return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };
    }

    const body = buildInvoiceSmsBody(ticket, company);
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

  return { ok: false, channel: channel || "unknown", error: "Unsupported delivery channel." };
}

// ─── Order ready for pickup (marked completed) ───────────────────────────────

/**
 * Notifies the customer their order is complete and ready for pickup.
 * Uses the ticket's configured outreach channel (email / SMS / WhatsApp).
 */
export async function sendOrderReadyToCustomer(
  ticket: TicketForSend & { reference_code: string },
  company: CompanyForSend,
): Promise<SendResult> {
  const { channel, destination } = resolveTicketOutreach(ticket);
  const orderUrl = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);
  const companyName = company.company_name ?? "BazaarPrinting";
  const pickupAddress = formatPickupAddress(company);

  if (!destination) {
    return { ok: false, channel, error: "No customer email or phone on file." };
  }

  if (channel === "email") {
    const { subject, html } = buildOrderReadyEmail({
      customerName,
      referenceCode: ticket.reference_code,
      orderUrl,
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

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) {
      return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };
    }

    const firstName = customerName.split(" ")[0];
    const addressPart = pickupAddress ? ` Pick up at: ${pickupAddress}.` : "";
    const phonePart = company.phone ? ` Questions? Call ${company.phone}.` : "";
    const body = `Hi ${firstName}, your order ${ticket.reference_code} from ${companyName} is ready for pickup!${addressPart}${phonePart} Details: ${orderUrl}`;

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

  return { ok: false, channel: channel || "unknown", error: "Unsupported delivery channel." };
}

/** Subset of ticket fields used by payment-confirmed notifications. */
export type PaymentConfirmedTicket = {
  reference_code: string;
  public_token: string;
  quote_channel: string | null;
  quote_destination: string | null;
  contact_name?: string | null;
  customer?: TicketForSend["customer"];
};

// ─── Payment confirmed (after accountant review) ─────────────────────────────

/**
 * Notifies the customer that their submitted payment was verified.
 * Sent when an accountant confirms payment that included customer-uploaded evidence.
 */
export async function sendPaymentConfirmed(
  ticket: PaymentConfirmedTicket,
  company: CompanyForSend,
  opts: {
    amountConfirmed: number;
    inProduction: boolean;
    fullyPaid: boolean;
  },
): Promise<SendResult> {
  const channel = (ticket.quote_channel ?? "").toLowerCase();
  const destination = ticket.quote_destination ?? null;
  const orderUrl = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);
  const companyName = company.company_name ?? "BazaarPrinting";

  if (channel === "email") {
    if (!destination) return { ok: false, channel: "email", error: "No destination email address." };

    const { subject, html } = buildPaymentConfirmedEmail({
      customerName,
      referenceCode: ticket.reference_code,
      amountConfirmed: opts.amountConfirmed,
      inProduction: opts.inProduction,
      fullyPaid: opts.fullyPaid,
      orderUrl,
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
    const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(opts.amountConfirmed);
    const body =
      opts.fullyPaid && opts.inProduction
        ? `Hi ${firstName}, your payment of ${total} for order ${ticket.reference_code} from ${companyName} is confirmed — your order is paid in full. Track it here: ${orderUrl}`
        : opts.inProduction
          ? `Hi ${firstName}, your payment of ${total} for order ${ticket.reference_code} from ${companyName} is confirmed — your order is now in production. Track it here: ${orderUrl}`
          : opts.fullyPaid
            ? `Hi ${firstName}, your payment of ${total} for order ${ticket.reference_code} from ${companyName} is confirmed — paid in full. View your order: ${orderUrl}`
            : `Hi ${firstName}, your payment of ${total} for order ${ticket.reference_code} from ${companyName} is confirmed. View your order: ${orderUrl}`;
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
