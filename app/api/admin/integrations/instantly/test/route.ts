import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const apiKey = process.env.INSTANTLY_API_KEY;
  const sendingAccount = process.env.INSTANTLY_SENDING_ACCOUNT;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "INSTANTLY_API_KEY is not configured." },
      { status: 500 }
    );
  }
  if (!sendingAccount) {
    return NextResponse.json(
      { ok: false, error: "INSTANTLY_SENDING_ACCOUNT is not configured. Add the email address connected to your Instantly workspace." },
      { status: 500 }
    );
  }

  let body: { to_email: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { to_email } = body;

  if (!to_email) {
    return NextResponse.json({ ok: false, error: "Missing 'to_email' field." }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.instantly.ai/api/v2/emails/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        eaccount: sendingAccount,
        to_address_email_list: [to_email],
        subject: "BazaarPrinting CRM — Instantly connection test",
        body: {
          html: "<p>If you received this email, the Instantly AI integration with BazaarPrinting CRM is working correctly.</p>",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { ok: false, error: `Instantly API error (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
