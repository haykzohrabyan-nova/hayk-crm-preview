/** How customer outreach is configured on a ticket (quote send / invoice resend). */

export type OutreachChannelKind = "email" | "sms" | "both" | "whatsapp";

export function resolveOutreachChannelKind(ticket: {
  ticket_quote_channel?: string | null;
  quote_channel?: string | null;
}): OutreachChannelKind {
  const perTicket = (ticket.ticket_quote_channel ?? "").toLowerCase();
  if (perTicket === "email") return "email";
  if (perTicket === "sms") return "sms";
  if (perTicket === "both") return "both";

  const legacy = (ticket.quote_channel ?? "").toLowerCase();
  if (legacy === "email") return "email";
  if (legacy === "whatsapp") return "whatsapp";
  if (legacy === "sms") return "sms";

  return "email";
}

export const OUTREACH_CHANNEL_LABEL: Record<OutreachChannelKind, string> = {
  email: "Email",
  sms: "SMS",
  both: "SMS + Email",
  whatsapp: "WhatsApp",
};
