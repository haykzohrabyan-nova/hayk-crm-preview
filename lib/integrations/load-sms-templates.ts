import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultSmsTemplatesMap,
  isSmsTemplateKey,
  type SmsTemplateKey,
} from "./sms-template-catalog";

/**
 * Load all SMS templates from DB, falling back to coded defaults for missing keys.
 */
export async function loadSmsTemplatesMap(
  admin: SupabaseClient,
): Promise<Record<SmsTemplateKey, string>> {
  const merged = defaultSmsTemplatesMap();

  const { data, error } = await admin.from("sms_templates").select("template_key, body");

  if (error) {
    console.error(
      "[sms-templates] DB load failed — outbound SMS will use coded defaults until migration 084 is applied:",
      error.message,
    );
    return merged;
  }

  for (const row of data ?? []) {
    const key = row.template_key;
    if (isSmsTemplateKey(key) && typeof row.body === "string" && row.body.trim()) {
      merged[key] = row.body.trim();
    }
  }

  return merged;
}

export function pickSmsBody(
  templates: Record<SmsTemplateKey, string>,
  key: SmsTemplateKey,
): string {
  return templates[key] ?? defaultSmsTemplatesMap()[key];
}
