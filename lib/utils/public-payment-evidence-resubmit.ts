import type { createAdminClient } from "@/lib/supabase/admin";
import { AUTO_RELEASE_SELECT, type AutoReleaseTicket } from "@/lib/utils/maybe-auto-release-production";
import { computePublicPaymentDueAmount } from "@/lib/utils/invoice-payment-summary";

type AdminClient = ReturnType<typeof createAdminClient>;

const EVIDENCE_METHODS = new Set(["wire", "ach", "zelle", "check"]);

export type PaymentEvidenceResubmitTicket = AutoReleaseTicket & {
  id: string;
  public_token: string;
  reference_code: string | null;
  customer_id: string | null;
  linked_lead_id: string | null;
  payment_evidence_url: string | null;
  payment_evidence_resubmit_token: string | null;
  payment_evidence_otp_hash: string | null;
  payment_evidence_otp_expires_at: string | null;
  payment_evidence_resubmit_requested_at: string | null;
  payment_evidence_resubmit_received_at: string | null;
  payment_method_used: string | null;
};

const RESUBMIT_EXTRA = `
  public_token, customer_id, linked_lead_id, payment_evidence_url,
  payment_evidence_resubmit_token, payment_evidence_otp_hash, payment_evidence_otp_expires_at,
  payment_evidence_resubmit_requested_at, payment_evidence_resubmit_received_at,
  payment_method_used
`.trim();

const SELECT = `${AUTO_RELEASE_SELECT.replace(/\s+/g, " ")}, ${RESUBMIT_EXTRA}`;

export async function fetchPaymentEvidenceResubmitTicket(
  admin: AdminClient,
  resubmitToken: string,
): Promise<PaymentEvidenceResubmitTicket | null> {
  const { data } = await admin
    .from("job_tickets")
    .select(SELECT)
    .eq("payment_evidence_resubmit_token", resubmitToken)
    .maybeSingle();
  return (data as PaymentEvidenceResubmitTicket | null) ?? null;
}

export function paymentEvidenceResubmitAlreadySubmitted(
  ticket: PaymentEvidenceResubmitTicket,
): boolean {
  return (
    !!ticket.payment_evidence_resubmit_received_at &&
    !ticket.payment_evidence_resubmit_requested_at
  );
}

export function paymentEvidenceResubmitAwaitingUpload(
  ticket: PaymentEvidenceResubmitTicket,
): boolean {
  return (
    !!ticket.payment_evidence_resubmit_requested_at &&
    !paymentEvidenceResubmitAlreadySubmitted(ticket)
  );
}

/** Original proof method on the ticket — resubmit must match this (read-only on `/evidence`). */
export function paymentEvidenceResubmitSubmittedMethod(
  ticket: PaymentEvidenceResubmitTicket,
): string | null {
  const method = ticket.payment_method_used?.trim();
  if (!method || !EVIDENCE_METHODS.has(method)) return null;
  return method;
}

export function paymentEvidenceResubmitDueAmount(ticket: PaymentEvidenceResubmitTicket): number {
  return computePublicPaymentDueAmount(ticket);
}

export function paymentEvidenceResubmitUrl(resubmitToken: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/evidence/${resubmitToken}`;
}
