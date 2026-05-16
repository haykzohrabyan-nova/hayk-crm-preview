import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken) {
    return NextResponse.json(
      { ok: false, error: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are not configured." },
      { status: 500 }
    );
  }

  let body: { to: string; channel: "sms" | "whatsapp" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { to, channel } = body;

  if (!to) {
    return NextResponse.json({ ok: false, error: "Missing 'to' field." }, { status: 400 });
  }
  if (channel !== "sms" && channel !== "whatsapp") {
    return NextResponse.json(
      { ok: false, error: "channel must be 'sms' or 'whatsapp'." },
      { status: 400 }
    );
  }

  if (channel === "sms" && !phoneNumber) {
    return NextResponse.json(
      { ok: false, error: "TWILIO_PHONE_NUMBER is not configured." },
      { status: 500 }
    );
  }
  if (channel === "whatsapp" && !whatsappFrom) {
    return NextResponse.json(
      { ok: false, error: "TWILIO_WHATSAPP_FROM is not configured." },
      { status: 500 }
    );
  }

  try {
    const client = twilio(accountSid, authToken);

    const from =
      channel === "whatsapp"
        ? whatsappFrom!
        : phoneNumber!;

    const toFormatted =
      channel === "whatsapp" ? `whatsapp:${to}` : to;

    const message = await client.messages.create({
      body: "BazaarPrinting CRM — Twilio connection test. If you received this, the integration is working.",
      from,
      to: toFormatted,
    });

    return NextResponse.json({ ok: true, sid: message.sid, status: message.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
