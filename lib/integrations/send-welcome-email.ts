/**
 * send-welcome-email.ts
 *
 * Sends a branded email to a CRM user via Instantly AI.
 * Used for two cases:
 *   - New user creation (POST /api/admin/users/create) — welcome variant
 *   - Admin password reset (PATCH /api/admin/users/[id]) — reset variant (isReset: true)
 * Never throws — errors are returned in the result and logged by the caller.
 */

import { buildWelcomeEmail } from "./welcome-email-template";
import { resolveLoginUrl } from "@/lib/utils/resolve-app-url";

interface CompanySettings {
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

export interface WelcomeEmailResult {
  ok: boolean;
  error?: string;
  loginUrl?: string;
}

export async function sendWelcomeEmail(params: {
  fullName: string;
  email: string;
  tempPassword: string;
  company: CompanySettings;
  /** When true, sends a "password reset" subject/body instead of the new-user welcome. */
  isReset?: boolean;
  /** Origin of the admin request — used when NEXT_PUBLIC_APP_URL is missing or localhost. */
  appOrigin?: string | null;
}): Promise<WelcomeEmailResult> {
  const variant = params.isReset ? "password-reset" : "welcome";
  const tag = `[user-email:${variant}]`;

  const apiKey = process.env.INSTANTLY_API_KEY;
  const sendingAccount = process.env.INSTANTLY_SENDING_ACCOUNT;
  const loginUrl = resolveLoginUrl(params.appOrigin);

  if (!apiKey || !sendingAccount) {
    console.error(`${tag} skipped — Instantly credentials not configured (to: ${params.email})`);
    return { ok: false, error: "Instantly credentials not configured.", loginUrl };
  }

  const { subject, html } = buildWelcomeEmail({
    fullName: params.fullName,
    email: params.email,
    tempPassword: params.tempPassword,
    loginUrl,
    company: params.company,
    isReset: params.isReset,
  });

  console.log(`${tag} sending to ${params.email} via ${sendingAccount} — login: ${loginUrl} — subject: "${subject}"`);

  try {
    const res = await fetch("https://api.instantly.ai/api/v2/emails/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        eaccount: sendingAccount,
        to_address_email_list: [params.email],
        subject,
        body: { html },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`${tag} Instantly API error for ${params.email} (${res.status}):`, errText);
      return { ok: false, error: `Instantly API error (${res.status}): ${errText}`, loginUrl };
    }

    console.log(`${tag} Instantly accepted send to ${params.email} — login button: ${loginUrl}`);
    return { ok: true, loginUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${tag} network error for ${params.email}:`, message);
    return { ok: false, error: message, loginUrl };
  }
}
