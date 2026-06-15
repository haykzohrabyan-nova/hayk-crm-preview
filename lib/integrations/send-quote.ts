/**
 * send-quote.ts
 * Server-side utility: delivers a quote or order to the customer via the channel
 * stored on the ticket (Email, SMS, WhatsApp, In-person).
 *
 * Called from PATCH /api/tickets/[id] when ticket_status transitions to "sent".
 */

import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSmsTemplatesMap, pickSmsBody } from "./load-sms-templates";
import { renderSmsTemplate, type SmsTemplateVars } from "./render-sms-template";
import type { SmsTemplateKey } from "./sms-template-catalog";
import { loadEmailTemplatesForSend } from "./apply-admin-email";
import {
  buildInvoiceLinkFromTemplates,
  buildOrderReadyFromTemplates,
  buildPaymentConfirmedFromTemplates,
  buildPaymentReminderFromTemplates,
  buildQuoteDeliveryEmail,
  buildQuoteFollowUpFromTemplates,
  buildTaxExemptApprovedFromTemplates,
} from "./customer-email-builders";
import { formatPickupAddress } from "./order-ready-template";
import { formatShipToAddress, formatShipToAddressInline } from "@/lib/utils/address";
import { ticketDisplayReference } from "@/lib/utils/reference-codes";
import {
  fetchTicketLinesBundle,
  lineItemsToDisplayRows,
  type TicketLineDisplayRow,
} from "@/lib/utils/ticket-line-items";
import { instantlySendEmail as instantlySend } from "./instantly-send";

// ─── Types ────────────────────────────────────────────────────────────────────

/** When set, customer messaging includes an "updated quote/order" notice. */
export type OutreachRevisionNotice = "standard" | "admin";

export interface SendOutreachOptions {
  revisionNotice?: OutreachRevisionNotice;
}

export interface TicketForSend {
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

export interface CompanyForSend {
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

export function customerDisplayName(ticket: {
  customer?: TicketForSend["customer"];
  contact_name?: string | null;
}): string {
  if (ticket.customer?.first_name || ticket.customer?.last_name) {
    return [ticket.customer.first_name, ticket.customer.last_name].filter(Boolean).join(" ");
  }
  return ticket.contact_name ?? "Valued Customer";
}

export function publicUrl(token: string): string {
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

import { fmtEmailCurrency } from "@/lib/integrations/email-format";

export function firstNameFromTicket(ticket: {
  customer?: TicketForSend["customer"];
  contact_name?: string | null;
}): string {
  return customerDisplayName(ticket).split(" ")[0] || "there";
}

function baseSmsVars(
  ticket: TicketForSend,
  company: CompanyForSend,
): SmsTemplateVars {
  return {
    firstName: firstNameFromTicket(ticket),
    companyName: company.company_name ?? "BazaarPrinting",
    ref: ticketDisplayReference(ticket),
    link: publicUrl(ticket.public_token),
    total: fmtEmailCurrency(ticket.quote_final_total),
  };
}

function renderStoredSms(
  templates: Record<SmsTemplateKey, string>,
  key: SmsTemplateKey,
  vars: SmsTemplateVars,
): string {
  return renderSmsTemplate(pickSmsBody(templates, key), vars);
}

export async function loadTemplatesForSend(): Promise<Record<SmsTemplateKey, string>> {
  return loadSmsTemplatesMap(createAdminClient());
}

function smsRevisionPrefix(notice: OutreachRevisionNotice | undefined, isOrder: boolean): string {
  if (!notice) return "";
  const word = isOrder ? "order" : "quote";
  if (notice === "admin") {
    return `Update: Your ${word} was revised by our team. Please review the latest details. `;
  }
  return `Update: We've revised your ${word}. `;
}

async function sendEmail(
  ticket: TicketForSend,
  company: CompanyForSend,
  options?: SendOutreachOptions,
): Promise<SendResult> {
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

  const admin = createAdminClient();
  const lineBundle = await fetchTicketLinesBundle(admin, ticket.id);
  const skus: TicketLineDisplayRow[] = lineItemsToDisplayRows(lineBundle);

  const isOrder = ticket.order_source === "direct";
  const emailTemplates = await loadEmailTemplatesForSend();
  const { subject, html } = buildQuoteDeliveryEmail(emailTemplates, {
    customerName: customerDisplayName(ticket),
    title: ticket.title ?? "Your Quote",
    referenceCode: ticketDisplayReference(ticket),
    skus,
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
    revisionNotice: options?.revisionNotice,
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

async function sendSms(
  ticket: TicketForSend,
  company: CompanyForSend,
  channel: "sms" | "whatsapp",
  templates: Record<SmsTemplateKey, string>,
  options?: SendOutreachOptions,
): Promise<SendResult> {
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
  const isOrder = ticket.order_source === "direct";
  const body =
    smsRevisionPrefix(options?.revisionNotice, isOrder) +
    renderStoredSms(
      templates,
      isOrder ? "order_sent" : "quote_sent",
      baseSmsVars(ticket, company),
    );

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
  company: CompanyForSend,
  options?: SendOutreachOptions,
): Promise<SendResult> {
  const channel = (ticket.quote_channel ?? "").toLowerCase();

  if (channel === "email") {
    return sendEmail(ticket, company, options);
  }

  const templates = await loadTemplatesForSend();

  if (channel === "sms") {
    return sendSms(ticket, company, "sms", templates, options);
  }

  if (channel === "whatsapp") {
    return sendSms(ticket, company, "whatsapp", templates, options);
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

    const emailTemplates = await loadEmailTemplatesForSend();
    const { subject, html } = buildPaymentReminderFromTemplates(emailTemplates, {
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
    const templates = await loadTemplatesForSend();
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken) return { ok: false, channel, error: "Twilio credentials not configured." };
    if (!destination) return { ok: false, channel, error: "No destination phone number." };

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };

    const body = renderStoredSms(templates, "payment_reminder", {
      firstName: customerName.split(" ")[0] || "there",
      ref: ticket.reference_code,
      companyName,
      total: fmtEmailCurrency(ticket.quote_final_total),
      link: paymentUrl,
    });
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
  options?: SendOutreachOptions,
): Promise<SendResult> {
  const { channel, destination } = resolveTicketOutreach(ticket, override);
  const orderUrl = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);

  if (!destination) {
    return { ok: false, channel, error: "No customer email or phone on file." };
  }

  if (channel === "email") {
    const emailTemplates = await loadEmailTemplatesForSend();
    const { subject, html } = buildInvoiceLinkFromTemplates(emailTemplates, {
      customerName,
      referenceCode: ticket.reference_code,
      finalTotal: ticket.quote_final_total ?? 0,
      orderUrl,
      statusLine: invoiceStatusLine(ticket),
      company,
      revisionNotice: options?.revisionNotice === "admin" ? "admin" : undefined,
      ticket,
    });
    return instantlySend(destination, subject, html);
  }

  if (channel === "sms" || channel === "whatsapp") {
    const templates = await loadTemplatesForSend();
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken) return { ok: false, channel, error: "Twilio credentials not configured." };

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) {
      return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };
    }

    const paid = ticket.payment_status === "paid";
    const inProd = ticket.ticket_status === "in_production";
    const templateKey: SmsTemplateKey = inProd && paid
      ? "invoice_link_in_production_paid"
      : inProd
        ? "invoice_link_in_production_unpaid"
        : "invoice_link";
    const body =
      smsRevisionPrefix(options?.revisionNotice, true) +
      renderStoredSms(templates, templateKey, baseSmsVars(ticket, company));
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
  ticket: TicketForSend & {
    reference_code: string;
    requires_shipping?: boolean | null;
    ship_to_line1?: string | null;
    ship_to_line2?: string | null;
    ship_to_city?: string | null;
    ship_to_state?: string | null;
    ship_to_zip?: string | null;
  },
  company: CompanyForSend,
): Promise<SendResult> {
  const { channel, destination } = resolveTicketOutreach(ticket);
  const orderUrl = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);
  const companyName = company.company_name ?? "BazaarPrinting";
  const pickupAddress = formatPickupAddress(company);
  const requiresShipping = Boolean(ticket.requires_shipping);
  const shipToAddress = formatShipToAddress(ticket);
  const shipToInline = formatShipToAddressInline(ticket);

  if (!destination) {
    return { ok: false, channel, error: "No customer email or phone on file." };
  }

  if (channel === "email") {
    const emailTemplates = await loadEmailTemplatesForSend();
    const { subject, html } = buildOrderReadyFromTemplates(emailTemplates, {
      customerName,
      referenceCode: ticket.reference_code,
      orderUrl,
      company,
      requiresShipping,
      shipToAddress,
      pickupAddress,
    });
    return instantlySend(destination, subject, html);
  }

  if (channel === "sms" || channel === "whatsapp") {
    const templates = await loadTemplatesForSend();
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken) return { ok: false, channel, error: "Twilio credentials not configured." };

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) {
      return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };
    }

    const body = renderStoredSms(templates, "order_ready_pickup", {
      firstName: firstNameFromTicket(ticket),
      ref: ticket.reference_code,
      companyName,
      link: orderUrl,
      pickupBlock: requiresShipping
        ? shipToInline ? ` Shipping to: ${shipToInline}.` : " Your order is ready to ship."
        : pickupAddress ? ` Pick up at: ${pickupAddress}.` : "",
      phoneBlock: company.phone ? ` Questions? Call ${company.phone}.` : "",
    });

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

    const emailTemplates = await loadEmailTemplatesForSend();
    const { subject, html } = buildPaymentConfirmedFromTemplates(emailTemplates, {
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
    const templates = await loadTemplatesForSend();
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken) return { ok: false, channel, error: "Twilio credentials not configured." };
    if (!destination) return { ok: false, channel, error: "No destination phone number." };

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) return { ok: false, channel, error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.` };

    const templateKey: SmsTemplateKey =
      opts.fullyPaid && opts.inProduction
        ? "payment_confirmed_full_in_production"
        : opts.inProduction
          ? "payment_confirmed_in_production"
          : opts.fullyPaid
            ? "payment_confirmed_full"
            : "payment_confirmed";
    const body = renderStoredSms(templates, templateKey, {
      firstName: firstNameFromTicket(ticket),
      amount: fmtEmailCurrency(opts.amountConfirmed),
      ref: ticket.reference_code,
      companyName,
      link: orderUrl,
    });
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

// ─── Tax-exempt approved (after accountant review) ─────────────────────────

export async function sendTaxExemptApproved(
  ticket: PaymentConfirmedTicket,
  company: CompanyForSend,
  opts: {
    previousFinalTotal: number;
    newFinalTotal: number;
  },
): Promise<SendResult> {
  const channel = (ticket.quote_channel ?? "").toLowerCase();
  const destination = ticket.quote_destination ?? null;
  const orderUrl = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);
  const companyName = company.company_name ?? "BazaarPrinting";
  const totalChanged = Math.abs(opts.newFinalTotal - opts.previousFinalTotal) > 0.01;

  if (channel === "email") {
    if (!destination) return { ok: false, channel: "email", error: "No destination email address." };

    const emailTemplates = await loadEmailTemplatesForSend();
    const { subject, html } = buildTaxExemptApprovedFromTemplates(emailTemplates, {
      customerName,
      referenceCode: ticket.reference_code,
      previousFinalTotal: opts.previousFinalTotal,
      newFinalTotal: opts.newFinalTotal,
      totalChanged,
      orderUrl,
      company,
    });

    return instantlySend(destination, subject, html);
  }

  if (channel === "sms" || channel === "whatsapp") {
    const templates = await loadTemplatesForSend();
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken) return { ok: false, channel, error: "Twilio credentials not configured." };
    if (!destination) return { ok: false, channel, error: "No destination phone number." };

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) {
      return {
        ok: false,
        channel,
        error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.`,
      };
    }

    const templateKey: SmsTemplateKey = totalChanged
      ? "tax_exempt_approved"
      : "tax_exempt_approved_total_unchanged";
    const body = renderStoredSms(templates, templateKey, {
      firstName: firstNameFromTicket(ticket),
      amount: fmtEmailCurrency(opts.newFinalTotal),
      ref: ticket.reference_code,
      companyName,
      link: orderUrl,
    });
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

// ─── Automated quote follow-up (cron) ──────────────────────────────────────

/**
 * Sends a short reminder for a quote that was already delivered but not yet confirmed.
 * Uses per-ticket outreach fields when present (`ticket_quote_channel`, etc.).
 */
export async function sendQuoteFollowUpReminder(
  ticket: TicketForSend & { reference_code: string | null },
  company: CompanyForSend,
): Promise<SendResult> {
  const { channel, destination } = resolveTicketOutreach(ticket);
  const link = publicUrl(ticket.public_token);
  const customerName = customerDisplayName(ticket);
  const companyName = company.company_name ?? "BazaarPrinting";
  const ref = ticketDisplayReference(ticket);
  const total = ticket.quote_final_total ?? 0;

  if (!destination) {
    return { ok: false, channel, error: "No customer email or phone on file." };
  }

  if (channel === "email") {
    const emailTemplates = await loadEmailTemplatesForSend();
    const { subject, html } = buildQuoteFollowUpFromTemplates(emailTemplates, {
      customerName,
      referenceCode: ref,
      finalTotal: total,
      confirmUrl: link,
      company,
    });
    return instantlySend(destination, subject, html);
  }

  if (channel === "sms" || channel === "whatsapp") {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken) {
      return { ok: false, channel, error: "Twilio credentials not configured." };
    }

    const from = channel === "whatsapp" ? whatsappFrom : phoneNumber;
    if (!from) {
      return {
        ok: false,
        channel,
        error: `Twilio ${channel === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_PHONE_NUMBER"} not configured.`,
      };
    }

    const templates = await loadTemplatesForSend();
    const totalFmt = fmtEmailCurrency(total);
    const body = renderStoredSms(
      templates,
      totalFmt ? "quote_follow_up" : "quote_follow_up_no_total",
      {
        firstName: firstNameFromTicket(ticket),
        ref,
        companyName,
        total: totalFmt,
        link,
      },
    );

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
