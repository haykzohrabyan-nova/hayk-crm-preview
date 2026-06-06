import { randomUUID } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyPublicQuoteUpdated } from "@/lib/integrations/notify-public-quote-updated";
import { resolveTicketAttachmentMime, validateTicketAttachmentFile } from "@/lib/utils/ticket-line-files";

type AdminClient = ReturnType<typeof createAdminClient>;

export type StaffReplacePaymentEvidenceTicket = {
  id: string;
  public_token: string;
  linked_lead_id: string | null;
  customer_id: string | null;
  payment_evidence_url: string | null;
  payment_evidence_amount: number | null;
  payment_method_used: string | null;
  payment_evidence_resubmit_requested_at: string | null;
};

export async function staffReplacePaymentEvidence(
  admin: AdminClient,
  ticket: StaffReplacePaymentEvidenceTicket,
  file: File,
  staffUserId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const validationError = validateTicketAttachmentFile(file);
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  if (ticket.payment_evidence_url) {
    await admin.storage.from("payment-evidence").remove([ticket.payment_evidence_url]);
  }

  const mimeType = resolveTicketAttachmentMime(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${ticket.id}/${randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage.from("payment-evidence").upload(storagePath, buffer, {
    contentType: mimeType || "application/octet-stream",
    upsert: false,
  });

  if (uploadErr) {
    console.error("[staff-replace-payment-evidence] upload failed:", uploadErr);
    return { ok: false, error: "Failed to upload payment evidence. Please try again.", status: 500 };
  }

  const now = new Date().toISOString();
  const hadResubmitRequest = !!ticket.payment_evidence_resubmit_requested_at;

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      updated_at: now,
      payment_evidence_url: storagePath,
      payment_evidence_submitted_at: now,
      payment_evidence_reviewed_at: null,
      ...(hadResubmitRequest
        ? {
            payment_evidence_resubmit_requested_at: null,
            payment_evidence_resubmit_requested_by_id: null,
            payment_evidence_resubmit_reason: null,
            payment_evidence_resubmit_received_at: now,
            payment_evidence_resubmit_token: null,
            payment_evidence_otp_hash: null,
            payment_evidence_otp_expires_at: null,
          }
        : {}),
    })
    .eq("id", ticket.id);

  if (updateErr) {
    return { ok: false, error: updateErr.message, status: 500 };
  }

  await admin.from("activities").insert({
    type: "ticket_payment_evidence_replaced",
    lead_id: ticket.linked_lead_id ?? null,
    customer_id: ticket.customer_id ?? null,
    ticket_id: ticket.id,
    by_user_id: staffUserId,
    payload: {
      file_name: file.name,
      method: ticket.payment_method_used,
      amount: ticket.payment_evidence_amount,
      via: "staff",
      cleared_resubmit: hadResubmitRequest,
    },
    created_at: now,
  });

  notifyPublicQuoteUpdated(ticket.public_token);

  return { ok: true };
}
