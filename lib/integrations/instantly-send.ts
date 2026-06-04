import "server-only";

import type { SendResult } from "./send-quote";

/** Instantly v2 delivery — same endpoint/payload as quote/order emails (`send-quote.ts`). */
export async function instantlySendEmail(
  destination: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  const sendingAccount = process.env.INSTANTLY_SENDING_ACCOUNT;

  if (!apiKey || !sendingAccount) {
    return { ok: false, channel: "email", error: "Instantly credentials not configured." };
  }

  const payload = {
    eaccount: sendingAccount,
    to_address_email_list: [destination.trim()],
    subject,
    body: { html },
  };

  try {
    const res = await fetch("https://api.instantly.ai/api/v2/emails/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, channel: "email", error: `Instantly API error (${res.status}): ${errText}` };
    }

    return { ok: true, channel: "email" };
  } catch (err) {
    return { ok: false, channel: "email", error: err instanceof Error ? err.message : String(err) };
  }
}
