import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const PENDING_PAYMENT_SELECT = `
  id, reference_code, title,
  quote_final_total,
  payment_method_used,
  payment_evidence_url,
  payment_evidence_submitted_at,
  payment_evidence_amount,
  payment_amount_received,
  deposit_paid_at,
  ticket_payment_strategy,
  ticket_status,
  customer:customers(first_name, last_name, company)
`.trim();

export async function fetchPendingPaymentOrders(admin: AdminClient) {
  const { data, error } = await admin
    .from("job_tickets")
    .select(PENDING_PAYMENT_SELECT)
    .not("payment_evidence_url", "is", null)
    .is("payment_paid_at", null)
    .in("ticket_status", ["sent", "order", "in_production", "completed"])
    .order("payment_evidence_submitted_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
