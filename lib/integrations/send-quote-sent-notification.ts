import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantlySendEmail } from "./instantly-send";
import { wrapTransactionalEmailHtml } from "./wrap-transactional-email";
import { renderEmailTemplate } from "./render-email-template";
import { loadEmailTemplatesMap, pickEmailTemplate } from "./load-email-templates";
import type { SendResult } from "./send-quote";

function formatSentDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function firstWordOf(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/**
 * Sends an internal email to the quote creator when their quote is delivered
 * to the customer. Subject / body / CTA are admin-editable via the
 * "Staff notifications" group in Admin → Settings → Email Templates.
 *
 * Fire-and-forget — never throws; errors are returned in the result.
 */
export async function sendQuoteSentStaffNotification(params: {
  admin: SupabaseClient;
  staffEmail: string;
  staffFullName: string;
  clientName: string;
  ref: string;
  ticketId: string;
  companyName: string;
}): Promise<SendResult> {
  const tag = "[quote-sent-notification]";

  try {
    const templates = await loadEmailTemplatesMap(params.admin);
    const template = pickEmailTemplate(templates, "quote_sent_staff_notification");

    const salesPersonFirstName = firstWordOf(params.staffFullName || "there");
    const sentDate = formatSentDate();

    const vars = {
      salesPersonName: salesPersonFirstName,
      clientName: params.clientName,
      ref: params.ref,
      sentDate,
      // Allow {firstName} and {companyName} in custom subject/body too
      firstName: salesPersonFirstName,
      companyName: params.companyName,
    };

    const subject = renderEmailTemplate(template.subject, vars);
    const body    = renderEmailTemplate(template.body, vars);

    const appUrl  = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const crmUrl  = `${appUrl}/quotes/${params.ticketId}`;

    const html = wrapTransactionalEmailHtml({
      companyName: params.companyName,
      firstName:   salesPersonFirstName,
      bodyText:    body,
      ctaLabel:    template.ctaLabel || "View Quote in CRM",
      ctaUrl:      crmUrl,
    });

    const result = await instantlySendEmail(params.staffEmail, subject, html);

    if (!result.ok) {
      console.error(`${tag} delivery failed for ${params.staffEmail}:`, result.error, {
        ticketId: params.ticketId,
        ref: params.ref,
      });
    } else {
      console.log(`${tag} sent to ${params.staffEmail} — ref: ${params.ref}`);
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${tag} unexpected error:`, message);
    return { ok: false, channel: "email", error: message };
  }
}
