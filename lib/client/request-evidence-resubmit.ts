import type { SendChannelOpts } from "@/components/quotes/quote-detail/resend-quote-modal";

export type EvidenceResubmitMode = "payment_evidence_resubmit" | "tax_exempt_resubmit";

export async function submitEvidenceResubmitRequest(
  ticketId: string,
  mode: EvidenceResubmitMode,
  opts: SendChannelOpts,
): Promise<void> {
  const body =
    mode === "payment_evidence_resubmit"
      ? { request_payment_evidence_resubmit: true }
      : { request_tax_exempt_resubmit: true };

  const res = await fetch(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      outreach_channel: opts.channel,
      outreach_email: opts.email,
      outreach_phone: opts.phone,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to send request.");
  }
  if (data.outreach_ok === false) {
    throw new Error(
      data.outreach_error ?? "Request was saved but email/SMS could not be delivered.",
    );
  }
}
