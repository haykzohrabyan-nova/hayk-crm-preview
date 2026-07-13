"use server";

// Real outbound SMS via Twilio. First proof-of-connection: fires a live text.
// For safety during testing every message is routed to TEST_SMS_RECIPIENT
// (your own cell) regardless of the customer's number, until we flip it live.
import twilio from "twilio";

// Generic SMS send. For safety while testing, every message is routed to
// TEST_SMS_RECIPIENT (your cell) regardless of the real recipient.
export async function sendSms(input: { to: string; body: string }): Promise<{ ok: boolean; detail: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to = process.env.TEST_SMS_RECIPIENT || input.to;
  if (!sid || !token || !from) return { ok: false, detail: "Twilio keys missing in settings." };
  if (!to) return { ok: false, detail: "No recipient." };
  if (!input.body.trim()) return { ok: false, detail: "Empty message." };
  try {
    const client = twilio(sid, token);
    const msg = await client.messages.create({ from, to, body: input.body.trim() });
    return { ok: true, detail: `Sent to ${to} · id ${msg.sid}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendReadyToShipSms(input: {
  orderRef: string;
  company: string;
  toOverride?: string;
}): Promise<{ ok: boolean; detail: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  // SAFETY: while testing, always send to yourself.
  const to = process.env.TEST_SMS_RECIPIENT || input.toOverride;

  if (!sid || !token || !from) return { ok: false, detail: "Twilio keys missing in settings." };
  if (!to) return { ok: false, detail: "No test recipient set (TEST_SMS_RECIPIENT)." };

  const body = `Hi ${input.company || "there"}, this is Bazaar Printing. Your order ${input.orderRef} is ready. Reply here and we'll help you pick up or ship it. (Test message)`;

  try {
    const client = twilio(sid, token);
    const msg = await client.messages.create({ from, to, body });
    return { ok: true, detail: `Sent to ${to} · id ${msg.sid}` };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: m };
  }
}
