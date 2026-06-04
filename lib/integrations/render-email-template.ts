import type { EmailPlaceholderKey } from "./email-template-catalog";

export type EmailTemplateVars = Partial<Record<EmailPlaceholderKey, string>>;

/** Replace `{placeholder}` tokens; unknown tokens are left unchanged. */
export function renderEmailTemplate(text: string, vars: EmailTemplateVars): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const val = vars[key as EmailPlaceholderKey];
    return val !== undefined && val !== null ? val : match;
  });
}
