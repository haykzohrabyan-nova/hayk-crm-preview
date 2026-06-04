"use client";

import { ResendQuoteModal } from "@/components/quotes/quote-detail/resend-quote-modal";
import { resolveOutreachPrefillFromTicket } from "@/lib/utils/outreach-prefill";
import {
  submitEvidenceResubmitRequest,
  type EvidenceResubmitMode,
} from "@/lib/client/request-evidence-resubmit";

type TicketForResubmit = {
  id: string;
  reference_code: string | null;
  public_token?: string | null;
  contact_email?: string | null;
  ticket_quote_channel?: "sms" | "email" | "both" | null;
  ticket_dest_email?: string | null;
  ticket_dest_phone?: string | null;
  customer?: {
    email?: string | null;
    phone?: string | null;
  } | null;
};

export function RequestEvidenceResubmitFlow({
  ticket,
  mode,
  open,
  onClose,
  onSuccess,
}: {
  ticket: TicketForResubmit;
  mode: EvidenceResubmitMode;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  if (!open) return null;

  const prefill = resolveOutreachPrefillFromTicket(ticket);

  return (
    <ResendQuoteModal
      key={`${ticket.id}-${mode}`}
      isOpen={open}
      onClose={onClose}
      mode={mode}
      initialChannel={prefill.channel}
      initialEmail={prefill.email}
      initialPhone={prefill.phone}
      onSend={async (opts) => {
        await submitEvidenceResubmitRequest(ticket.id, mode, opts);
        window.dispatchEvent(new Event("bazaar:tickets-changed"));
        window.dispatchEvent(new Event("bazaar:refresh-counts"));
        onSuccess?.();
      }}
    />
  );
}
