/** Quote delivery channel + destination fields (Send quote via). */
export type QuoteDeliveryFields = {
  ticket_quote_channel: "sms" | "email" | "both";
  ticket_dest_phone: string;
  ticket_dest_email: string;
};

/**
 * Prefill Send quote via from customer contact when destinations were never set
 * (e.g. SDR routed from Line Items without opening the Quote tab).
 */
export function resolveQuoteDeliveryFromContact<T extends QuoteDeliveryFields>(
  draft: T,
  customerPhone: string,
  customerEmail: string,
): T {
  const phone = customerPhone.trim();
  const email = customerEmail.trim();

  let destPhone = draft.ticket_dest_phone.trim() || phone;
  let destEmail = draft.ticket_dest_email.trim() || email;
  let channel = draft.ticket_quote_channel;

  const hadEmptyDest =
    !draft.ticket_dest_phone.trim() && !draft.ticket_dest_email.trim();

  if (hadEmptyDest && (phone || email)) {
    if (email && !phone) {
      channel = "email";
    } else if (phone && !email) {
      channel = "sms";
    } else if (phone && email) {
      if (channel === "both" && destPhone && destEmail) {
        // keep both
      } else if (channel === "email" && destEmail) {
        // keep email
      } else {
        channel = "sms";
      }
    }
  }

  if (channel === "sms" && !destPhone && destEmail) channel = "email";
  if (channel === "email" && !destEmail && destPhone) channel = "sms";
  if (channel === "both") {
    if (destPhone && destEmail) {
      // ok
    } else if (destPhone) {
      channel = "sms";
    } else if (destEmail) {
      channel = "email";
    }
  }

  return {
    ...draft,
    ticket_quote_channel: channel,
    ticket_dest_phone: destPhone,
    ticket_dest_email: destEmail,
  };
}
