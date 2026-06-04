/** Prefill Send via modal from ticket + customer contact (same order as quote detail / send-quote). */

export type OutreachChannel = "email" | "sms" | "both";

export type OutreachPrefill = {
  channel: OutreachChannel;
  email: string;
  phone: string;
};

type TicketOutreachFields = {
  ticket_quote_channel?: "sms" | "email" | "both" | null;
  ticket_dest_email?: string | null;
  ticket_dest_phone?: string | null;
  contact_email?: string | null;
  customer?: {
    email?: string | null;
    phone?: string | null;
  } | null;
};

export function resolveOutreachPrefillFromTicket(ticket: TicketOutreachFields): OutreachPrefill {
  const customer = ticket.customer;
  const email =
    (ticket.contact_email ?? "").trim() ||
    (customer?.email ?? "").trim() ||
    (ticket.ticket_dest_email ?? "").trim();
  const phone =
    (customer?.phone ?? "").trim() ||
    (ticket.ticket_dest_phone ?? "").trim();

  let channel: OutreachChannel = ticket.ticket_quote_channel ?? "email";
  if (channel === "sms" && !phone && email) channel = "email";
  if (channel === "email" && !email && phone) channel = "sms";
  if (channel === "both" && phone && email) {
    // keep both
  } else if (channel === "both" && phone) {
    channel = "sms";
  } else if (channel === "both" && email) {
    channel = "email";
  }

  return { channel, email, phone };
}
