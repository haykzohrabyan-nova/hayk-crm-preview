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
}

export async function sendWelcomeEmail(params: {
  fullName: string;
  email: string;
  tempPassword: string;
  company: CompanySettings;
  /** When true, sends a "password reset" subject/body instead of the new-user welcome. */
  isReset?: boolean;
}): Promise<WelcomeEmailResult> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  const sendingAccount = process.env.INSTANTLY_SENDING_ACCOUNT;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  if (!apiKey || !sendingAccount) {
    return { ok: false, error: "Instantly credentials not configured." };
  }

  const { subject, html } = buildWelcomeEmail({
    fullName: params.fullName,
    email: params.email,
    tempPassword: params.tempPassword,
    loginUrl: `${appUrl}/login`,
    company: params.company,
    isReset: params.isReset,
  });

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
      return { ok: false, error: `Instantly API error (${res.status}): ${errText}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
