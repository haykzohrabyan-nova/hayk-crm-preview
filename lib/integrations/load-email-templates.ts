import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultEmailTemplatesMap,
  isEmailTemplateKey,
  type EmailTemplateKey,
} from "./email-template-catalog";

export type LoadedEmailTemplate = {
  subject: string;
  body: string;
  ctaLabel: string;
};

export async function loadEmailTemplatesMap(
  admin: SupabaseClient,
): Promise<Record<EmailTemplateKey, LoadedEmailTemplate>> {
  const merged = defaultEmailTemplatesMap();

  const { data, error } = await admin
    .from("email_templates")
    .select("template_key, subject, body, cta_label");

  if (error) {
    console.error(
      "[email-templates] DB load failed — outbound email will use coded defaults:",
      error.message,
    );
    return merged;
  }

  for (const row of data ?? []) {
    const key = row.template_key;
    if (!isEmailTemplateKey(key)) continue;
    const subject = typeof row.subject === "string" ? row.subject.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    const ctaLabel = typeof row.cta_label === "string" ? row.cta_label.trim() : "";
    if (subject) merged[key].subject = subject;
    if (body) merged[key].body = body;
    if (ctaLabel) merged[key].ctaLabel = ctaLabel;
  }

  return merged;
}

export function pickEmailTemplate(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  key: EmailTemplateKey,
): LoadedEmailTemplate {
  return templates[key] ?? defaultEmailTemplatesMap()[key];
}
