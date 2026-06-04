import {
  pickEmailTemplate,
  type LoadedEmailTemplate,
} from "./load-email-templates";
import { renderEmailTemplate, type EmailTemplateVars } from "./render-email-template";
import { pickSmsBody } from "./load-sms-templates";
import { renderSmsTemplate } from "./render-sms-template";
import { wrapTransactionalEmailHtml } from "./wrap-transactional-email";
import type { EmailTemplateKey } from "./email-template-catalog";
import type { SmsTemplateKey } from "./sms-template-catalog";

export type ResubmitTemplateMaps = {
  email: Record<EmailTemplateKey, LoadedEmailTemplate>;
  sms: Record<SmsTemplateKey, string>;
};

export function renderResubmitCustomerPlainText(
  key: EmailTemplateKey,
  templates: ResubmitTemplateMaps,
  vars: EmailTemplateVars,
): string {
  const t = pickEmailTemplate(templates.email, key);
  return renderEmailTemplate(t.body, vars);
}

export function buildResubmitEmailFromTemplates(
  key: EmailTemplateKey,
  templates: ResubmitTemplateMaps,
  vars: EmailTemplateVars,
  opts: { companyName: string; firstName: string; ctaUrl: string; extraHtml?: string | null },
): { subject: string; html: string; plainBody: string } {
  const t = pickEmailTemplate(templates.email, key);
  const subject = renderEmailTemplate(t.subject, vars);
  const plainBody = renderEmailTemplate(t.body, vars);
  const ctaLabel = renderEmailTemplate(t.ctaLabel, vars);

  const html = wrapTransactionalEmailHtml({
    companyName: opts.companyName,
    firstName: opts.firstName,
    bodyText: plainBody,
    ctaLabel,
    ctaUrl: opts.ctaUrl,
    extraHtml: opts.extraHtml,
  });

  return { subject, html, plainBody };
}

export function renderResubmitSmsFromTemplates(
  key: SmsTemplateKey,
  templates: ResubmitTemplateMaps,
  vars: Parameters<typeof renderSmsTemplate>[1],
): string {
  return renderSmsTemplate(pickSmsBody(templates.sms, key), vars);
}
