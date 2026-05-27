import type { SmsPlaceholderKey } from "./sms-template-catalog";

export type SmsTemplateVars = Partial<Record<SmsPlaceholderKey, string>>;

/** Replace `{placeholder}` tokens; unknown tokens are left unchanged. */
export function renderSmsTemplate(body: string, vars: SmsTemplateVars): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => {
    const val = vars[key as SmsPlaceholderKey];
    return val !== undefined && val !== null ? val : match;
  });
}
