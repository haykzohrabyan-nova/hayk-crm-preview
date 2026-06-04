import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PermitResubmitTicket = {
  id: string;
  reference_code: string | null;
  title: string | null;
  sales_permit_storage_path: string | null;
  sales_permit_number: string | null;
  sales_permit_resubmit_token: string | null;
  sales_permit_resubmit_requested_at: string | null;
  sales_permit_resubmit_received_at: string | null;
  sales_permit_otp_hash: string | null;
  sales_permit_otp_expires_at: string | null;
  customer_id: string | null;
  linked_lead_id: string | null;
};

const PERMIT_SELECT = `
  id, reference_code, title,
  sales_permit_storage_path, sales_permit_number,
  sales_permit_resubmit_token, sales_permit_resubmit_requested_at, sales_permit_resubmit_received_at,
  sales_permit_otp_hash, sales_permit_otp_expires_at,
  customer_id, linked_lead_id
`.trim();

export async function fetchPermitResubmitTicket(
  admin: AdminClient,
  token: string,
): Promise<PermitResubmitTicket | null> {
  const { data } = await admin
    .from("job_tickets")
    .select(PERMIT_SELECT)
    .eq("sales_permit_resubmit_token", token)
    .maybeSingle();
  return (data as PermitResubmitTicket | null) ?? null;
}

export function permitResubmitAlreadySubmitted(ticket: PermitResubmitTicket): boolean {
  return !!ticket.sales_permit_resubmit_received_at && !ticket.sales_permit_resubmit_requested_at;
}

export function permitResubmitAwaitingUpload(ticket: PermitResubmitTicket): boolean {
  return !!ticket.sales_permit_resubmit_requested_at && !permitResubmitAlreadySubmitted(ticket);
}
