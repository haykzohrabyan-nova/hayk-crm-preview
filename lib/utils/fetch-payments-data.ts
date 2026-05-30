import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const PAYMENT_REVIEW_STATUSES = ["sent", "order", "in_production", "completed"] as const;

const PAYMENT_REVIEW_SELECT = `
  id, reference_code, title, contact_name, contact_email,
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
  ticket_deposit_type,
  ticket_deposit_value,
  ticket_status,
  created_by_id,
  customer:customers(first_name, last_name, company)
`.trim();

type PaymentReviewRow = Record<string, unknown> & { created_by_id?: string | null };

async function enrichPaymentRows(
  admin: AdminClient,
  rows: PaymentReviewRow[],
) {
  const creatorIds = [...new Set(rows.map((r) => r.created_by_id).filter(Boolean))] as string[];
  const { data: profiles } = creatorIds.length
    ? await admin.from("user_profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((row) => ({
    ...row,
    created_by: row.created_by_id
      ? { id: row.created_by_id, full_name: nameMap[row.created_by_id] ?? null }
      : null,
  }));
}

export async function fetchPendingPaymentOrders(admin: AdminClient) {
  const { data, error } = await admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .not("payment_evidence_url", "is", null)
    .is("payment_evidence_reviewed_at", null)
    .in("ticket_status", [...PAYMENT_REVIEW_STATUSES])
    .order("payment_evidence_submitted_at", { ascending: true });

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return enrichPaymentRows(admin, rows);
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
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return enrichPaymentRows(admin, rows);
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
