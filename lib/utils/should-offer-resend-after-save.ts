/** When to show "Resend to customer?" after Save Changes on quote detail. */

export type ResendPromptKind = "sdr-sales" | "admin";

export function shouldOfferResendAfterSave(params: {
  userRole: string | null;
  ticketStatus: string;
  clientConfirmed: boolean;
  /** PATCH included a status transition (send, route, convert, etc.) */
  newStatus?: string;
}): ResendPromptKind | null {
  if (params.newStatus) return null;

  if (params.userRole === "admin") {
    if (["sent", "order", "in_production"].includes(params.ticketStatus)) {
      return "admin";
    }
    return null;
  }

  if (params.userRole === "sdr" || params.userRole === "sales") {
    if (params.ticketStatus === "sent" && !params.clientConfirmed) {
      return "sdr-sales";
    }
    return null;
  }

  return null;
}

/** How to deliver the post-save resend for the current ticket status. */
export function resendDeliveryMode(ticketStatus: string): "quote" | "invoice-link" {
  if (ticketStatus === "sent") return "quote";
  return "invoice-link";
}
