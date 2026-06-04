import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailTemplateKey } from "./email-template-catalog";
import { pickEmailTemplate, type LoadedEmailTemplate } from "./load-email-templates";
import { renderEmailTemplate, type EmailTemplateVars } from "./render-email-template";
import { wrapTransactionalEmailHtml } from "./wrap-transactional-email";

export type { LoadedEmailTemplate };

export async function loadEmailTemplatesForSend(): Promise<
  Record<EmailTemplateKey, LoadedEmailTemplate>
> {
  const { loadEmailTemplatesMap } = await import("./load-email-templates");
  return loadEmailTemplatesMap(createAdminClient());
}

export function renderAdminEmailParts(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  key: EmailTemplateKey,
  vars: EmailTemplateVars,
): { subject: string; bodyText: string; ctaLabel: string } {
  const t = pickEmailTemplate(templates, key);
  return {
    subject: renderEmailTemplate(t.subject, vars),
    bodyText: renderEmailTemplate(t.body, vars),
    ctaLabel: renderEmailTemplate(t.ctaLabel, vars),
  };
}

/** Plain admin body → safe HTML paragraph (line breaks only). */
export function adminBodyToHtml(bodyText: string): string {
  return bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>");
}

export function buildSimpleAdminEmail(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  key: EmailTemplateKey,
  vars: EmailTemplateVars,
  opts: {
    companyName: string;
    firstName: string;
    ctaUrl: string;
    extraHtml?: string | null;
  },
): { subject: string; html: string; plainBody: string } {
  const { subject, bodyText, ctaLabel } = renderAdminEmailParts(templates, key, vars);
  const html = wrapTransactionalEmailHtml({
    companyName: opts.companyName,
    firstName: opts.firstName,
    bodyText,
    ctaLabel,
    ctaUrl: opts.ctaUrl,
    extraHtml: opts.extraHtml,
  });
  return { subject, html, plainBody: bodyText };
}

export function paymentConfirmedEmailKey(opts: {
  fullyPaid: boolean;
  inProduction: boolean;
}): EmailTemplateKey {
  if (opts.fullyPaid && opts.inProduction) return "payment_confirmed_full_in_production";
  if (opts.inProduction) return "payment_confirmed_in_production";
  if (opts.fullyPaid) return "payment_confirmed_full";
  return "payment_confirmed";
}

export function invoiceLinkEmailKey(
  ticket: { ticket_status?: string | null; payment_status?: string | null },
  revisionNotice?: "admin",
): EmailTemplateKey {
  if (revisionNotice === "admin") return "invoice_link_revision";
  const inProd = ticket.ticket_status === "in_production";
  const paid = ticket.payment_status === "paid";
  if (inProd && paid) return "invoice_link_in_production_paid";
  if (inProd) return "invoice_link_in_production_unpaid";
  return "invoice_link";
}

export function orderReadyEmailKey(requiresShipping: boolean): EmailTemplateKey {
  return requiresShipping ? "order_ready_shipped" : "order_ready_pickup";
}

export function quoteDeliveryEmailKey(
  isOrder: boolean,
  revisionNotice?: "standard" | "admin",
): EmailTemplateKey {
  if (revisionNotice) return isOrder ? "order_sent_revision" : "quote_sent_revision";
  return isOrder ? "order_sent" : "quote_sent";
}

export async function buildAdminEmail(
  key: EmailTemplateKey,
  vars: EmailTemplateVars,
  opts: {
    companyName: string;
    firstName: string;
    ctaUrl: string;
    extraHtml?: string | null;
    templates?: Record<EmailTemplateKey, LoadedEmailTemplate>;
  },
): Promise<{ subject: string; html: string; plainBody: string }> {
  const map = opts.templates ?? (await loadEmailTemplatesForSend());
  return buildSimpleAdminEmail(map, key, vars, {
    companyName: opts.companyName,
    firstName: opts.firstName,
    ctaUrl: opts.ctaUrl,
    extraHtml: opts.extraHtml,
  });
}
