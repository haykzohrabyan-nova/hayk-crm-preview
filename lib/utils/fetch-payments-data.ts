import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const PAYMENT_REVIEW_STATUSES = ["sent", "order", "in_production", "completed"] as const;

const PAYMENT_REVIEW_SELECT = `
  id, reference_code, title,
  quote_final_total,
  payment_method_used,
  payment_evidence_url,
  payment_evidence_submitted_at,
  payment_evidence_reviewed_at,
  payment_evidence_amount,
  payment_amount_received,
  payment_paid_at,
  payment_status,
  deposit_paid_at,
  ticket_payment_strategy,
  ticket_status,
  customer:customers(first_name, last_name, company)
`.trim();

export async function fetchPendingPaymentOrders(admin: AdminClient) {
  const { data, error } = await admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .not("payment_evidence_url", "is", null)
    .is("payment_evidence_reviewed_at", null)
    .in("ticket_status", [...PAYMENT_REVIEW_STATUSES])
    .order("payment_evidence_submitted_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchApprovedPaymentOrders(admin: AdminClient) {
  const { data, error } = await admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .not("payment_evidence_url", "is", null)
    .not("payment_evidence_reviewed_at", "is", null)
    .in("ticket_status", [...PAYMENT_REVIEW_STATUSES])
    .order("payment_evidence_reviewed_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchPaymentsPageData(admin: AdminClient) {
  const [pending, approved] = await Promise.all([
    fetchPendingPaymentOrders(admin),
    fetchApprovedPaymentOrders(admin),
  ]);
  return {
    orders: pending,
    approvedOrders: approved,
    counts: {
      pending: pending.length,
      approved: approved.length,
    },
  };
}
