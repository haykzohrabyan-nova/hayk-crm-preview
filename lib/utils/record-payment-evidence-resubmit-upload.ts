import { randomUUID } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyPublicQuoteUpdated } from "@/lib/integrations/notify-public-quote-updated";
import { computePublicPaymentDueAmount } from "@/lib/utils/invoice-payment-summary";
import {
  paymentEvidenceResubmitSubmittedMethod,
  type PaymentEvidenceResubmitTicket,
} from "@/lib/utils/public-payment-evidence-resubmit";

type AdminClient = ReturnType<typeof createAdminClient>;

const EVIDENCE_REQUIRED_CHANNELS = new Set(["wire", "ach", "zelle", "check"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function recordPaymentEvidenceResubmitUpload(
  admin: AdminClient,
  ticket: PaymentEvidenceResubmitTicket,
  input: { method: string; receiptId: string | null; file: File },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const expectedMethod = paymentEvidenceResubmitSubmittedMethod(ticket);
  if (!expectedMethod) {
    return {
      ok: false,
      error: "This order does not have a recorded payment method for proof upload.",
      status: 400,
    };
  }

  const method = input.method.trim();
  if (!method) {
    return { ok: false, error: "Payment method is required.", status: 400 };
  }
  if (method !== expectedMethod) {
    return { ok: false, error: "Payment method does not match this order.", status: 400 };
  }
  if (!EVIDENCE_REQUIRED_CHANNELS.has(method)) {
    return { ok: false, error: "Invalid payment method for evidence upload.", status: 400 };
  }
  if (!input.file) {
    return { ok: false, error: "Payment proof file is required.", status: 400 };
  }
  if (input.file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "File too large. Maximum size is 10 MB.", status: 413 };
  }
  if (!ALLOWED_MIME_TYPES.has(input.file.type)) {
    return {
      ok: false,
      error: "Invalid file type. Accepted: JPEG, PNG, WebP, PDF.",
      status: 415,
    };
  }

  const amount = computePublicPaymentDueAmount(ticket);
  if (amount <= 0.01) {
    return { ok: false, error: "No payment is due at this time.", status: 400 };
  }

  if (ticket.payment_evidence_url) {
    await admin.storage.from("payment-evidence").remove([ticket.payment_evidence_url]);
  }

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${ticket.id}/${randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await input.file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("payment-evidence")
    .upload(storagePath, buffer, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[payment-evidence-resubmit] storage upload failed:", uploadErr);
    return { ok: false, error: "Failed to upload payment evidence. Please try again.", status: 500 };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      updated_at: now,
      payment_method_used: method,
      payment_evidence_submitted_at: now,
      payment_evidence_url: storagePath,
      payment_evidence_reviewed_at: null,
      payment_evidence_amount: amount,
      payment_evidence_resubmit_requested_at: null,
      payment_evidence_resubmit_requested_by_id: null,
      payment_evidence_resubmit_reason: null,
      payment_evidence_resubmit_received_at: now,
      payment_evidence_resubmit_token: null,
      payment_evidence_otp_hash: null,
      payment_evidence_otp_expires_at: null,
      ...(input.receiptId ? { ticket_receipt_id: input.receiptId } : {}),
    })
    .eq("id", ticket.id);

  if (updateErr) {
    return { ok: false, error: updateErr.message, status: 500 };
  }

  await admin.from("activities").insert({
    type: "ticket_payment_evidence_resubmitted",
    lead_id: ticket.linked_lead_id ?? null,
    customer_id: ticket.customer_id ?? null,
    ticket_id: ticket.id,
    by_user_id: null,
    payload: {
      method,
      amount,
      has_file: true,
      receipt_id: input.receiptId,
      via: "public_evidence",
    },
    created_at: now,
  });

  notifyPublicQuoteUpdated(ticket.public_token);

  return { ok: true };
}
