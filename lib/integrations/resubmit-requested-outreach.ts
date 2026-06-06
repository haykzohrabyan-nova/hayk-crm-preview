import "server-only";

import twilio from "twilio";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { CompanyForSend, SendResult, TicketForSend } from "./send-quote";
import { customerDisplayName, firstNameFromTicket, loadTemplatesForSend } from "./send-quote";
import { paymentEvidenceResubmitUrl } from "@/lib/utils/public-payment-evidence-resubmit";
import { loadEmailTemplatesMap } from "./load-email-templates";
import {
  buildResubmitEmailFromTemplates,
  renderResubmitSmsFromTemplates,
  type ResubmitTemplateMaps,
} from "./render-resubmit-customer-message";
import { resubmitOtpExtraHtml } from "./customer-email-extra-html";
import { instantlySendEmail } from "./instantly-send";

export type ResubmitOutreachOverride = {
  channel: "email" | "sms" | "both";
  email: string;
  phone: string;
};

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function toE164(phone: string): string {
  const stripped = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return phone;
  if (stripped.length === 10) return `+1${stripped}`;
  if (stripped.length === 11 && stripped.startsWith("1")) return `+${stripped}`;
  return `+${stripped}`;
}

async function sendSmsBody(
  destination: string,
  body: string,
  channel: "sms" | "whatsapp" = "sms",
): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken) return { ok: false, channel, error: "Twilio credentials not configured." };
  if (!destination) return { ok: false, channel, error: "No destination phone number." };
  if (!phoneNumber) return { ok: false, channel, error: "TWILIO_PHONE_NUMBER not configured." };

  const normalised = toE164(destination);
  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({ from: phoneNumber, to: normalised, body });
    return { ok: true, channel };
  } catch (err) {
    return { ok: false, channel, error: err instanceof Error ? err.message : String(err) };
  }
}

async function deliverResubmitChannels(
  override: ResubmitOutreachOverride,
  sendEmailFn: () => Promise<SendResult>,
  sendSmsFn: (body: string) => Promise<SendResult>,
  smsBody: string,
): Promise<SendResult> {
  const ch = override.channel;
  if (ch === "email") {
    const r = await sendEmailFn();
    if (!r.ok) return r;
    return { ok: true, channel: "email" };
  }
  if (ch === "sms") {
    return sendSmsFn(smsBody);
  }
  const emailResult = await sendEmailFn();
  const smsResult = await sendSmsFn(smsBody);
  if (!emailResult.ok && !smsResult.ok) {
    return { ok: false, channel: "both", error: emailResult.error ?? smsResult.error ?? "Send failed." };
  }
  return { ok: true, channel: "both" };
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadResubmitTemplateMaps(admin: AdminClient): Promise<ResubmitTemplateMaps> {
  const [email, sms] = await Promise.all([
    loadEmailTemplatesMap(admin),
    loadTemplatesForSend(),
  ]);
  return { email, sms };
}

export async function renderTaxExemptResubmitCustomerMessage(
  admin: AdminClient,
  ticket: TicketForSend & { reference_code: string },
  company: CompanyForSend,
  permitToken: string,
  otpCode: string,
): Promise<string> {
  const templates = await loadResubmitTemplateMaps(admin);
  const companyName = company.company_name ?? "BazaarPrinting";
  const permitUrl = `${appOrigin()}/permit/${permitToken}`;
  const { plainBody } = buildResubmitEmailFromTemplates(
    "tax_exempt_resubmit_requested",
    templates,
    {
      firstName: firstNameFromTicket(ticket),
      companyName,
      ref: ticket.reference_code,
      link: permitUrl,
      otpCode,
    },
    { companyName, firstName: firstNameFromTicket(ticket), ctaUrl: permitUrl },
  );
  return plainBody;
}

export async function sendPaymentEvidenceResubmitRequested(
  admin: AdminClient,
  ticket: TicketForSend & { reference_code: string },
  company: CompanyForSend,
  override: ResubmitOutreachOverride,
  opts: { evidenceToken: string; otpCode: string },
): Promise<SendResult> {
  const templates = await loadResubmitTemplateMaps(admin);
  const paymentUrl = paymentEvidenceResubmitUrl(opts.evidenceToken);
  const companyName = company.company_name ?? "BazaarPrinting";
  const firstName = firstNameFromTicket(ticket);
  const vars = {
    firstName,
    companyName,
    ref: ticket.reference_code,
    link: paymentUrl,
    otpCode: opts.otpCode,
  };

  const { subject, html } = buildResubmitEmailFromTemplates(
    "payment_evidence_resubmit_requested",
    templates,
    vars,
    { companyName, firstName, ctaUrl: paymentUrl, extraHtml: resubmitOtpExtraHtml(opts.otpCode) },
  );

  const smsBody = renderResubmitSmsFromTemplates("payment_evidence_resubmit_requested", templates, {
    ...vars,
    amount: opts.otpCode,
  });

  return deliverResubmitChannels(
    override,
    () => {
      if (!override.email.trim()) return Promise.resolve({ ok: false, channel: "email", error: "Email address is required." });
      return instantlySendEmail(override.email.trim(), subject, html);
    },
    (body) => {
      if (!override.phone.trim()) return Promise.resolve({ ok: false, channel: "sms", error: "Phone number is required." });
      return sendSmsBody(override.phone.trim(), body);
    },
    smsBody,
  );
}

export async function sendTaxExemptResubmitRequested(
  admin: AdminClient,
  ticket: TicketForSend & { reference_code: string },
  company: CompanyForSend,
  override: ResubmitOutreachOverride,
  opts: { permitToken: string; otpCode: string },
): Promise<SendResult> {
  const templates = await loadResubmitTemplateMaps(admin);
  const permitUrl = `${appOrigin()}/permit/${opts.permitToken}`;
  const companyName = company.company_name ?? "BazaarPrinting";
  const firstName = firstNameFromTicket(ticket);
  const vars = {
    firstName,
    companyName,
    ref: ticket.reference_code,
    link: permitUrl,
    otpCode: opts.otpCode,
  };

  const { subject, html } = buildResubmitEmailFromTemplates(
    "tax_exempt_resubmit_requested",
    templates,
    vars,
    { companyName, firstName, ctaUrl: permitUrl, extraHtml: resubmitOtpExtraHtml(opts.otpCode) },
  );

  const smsBody = renderResubmitSmsFromTemplates("tax_exempt_resubmit_requested", templates, {
    ...vars,
    amount: opts.otpCode,
  });

  return deliverResubmitChannels(
    override,
    () => {
      if (!override.email.trim()) return Promise.resolve({ ok: false, channel: "email", error: "Email address is required." });
      return instantlySendEmail(override.email.trim(), subject, html);
    },
    (body) => {
      if (!override.phone.trim()) return Promise.resolve({ ok: false, channel: "sms", error: "Phone number is required." });
      return sendSmsBody(override.phone.trim(), body);
    },
    smsBody,
  );
}
