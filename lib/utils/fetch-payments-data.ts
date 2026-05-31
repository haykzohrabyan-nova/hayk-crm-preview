import type { createAdminClient } from "@/lib/supabase/admin";
import { excludeRefundedTickets } from "@/lib/utils/exclude-refunded-tickets";

type AdminClient = ReturnType<typeof createAdminClient>;

const PAYMENT_REVIEW_STATUSES = ["sent", "order", "in_production", "completed"] as const;

/** Refunded tab — includes cancelled orders (refund audit trail outlives cancel). */
const PAYMENT_REFUNDED_STATUSES = [
  ...PAYMENT_REVIEW_STATUSES,
  "cancelled",
] as const;

const PAYMENT_REVIEW_SELECT = `
  id, reference_code, title, contact_name, contact_email,
  quote_final_total,
  payment_method_used,
  deposit_method,
  balance_paid_at,
  payment_evidence_url,
  payment_evidence_submitted_at,
  payment_evidence_reviewed_at,
  payment_evidence_amount,
  stripe_payment_intent_id,
  stripe_checkout_session_id,
  stripe_charge_id,
  stripe_card_brand,
  stripe_card_last4,
  stripe_receipt_url,
  stripe_customer_email,
  stripe_amount_cents,
  stripe_payment_status,
  payment_amount_received,
  payment_paid_at,
  payment_status,
  deposit_paid_at,
  ticket_payment_strategy,
  ticket_deposit_type,
  ticket_deposit_value,
  ticket_status,
  created_by_id,
  refund_status,
  total_refunded_amount,
  last_refunded_at,
  last_refunded_by_id,
  customer:customers(first_name, last_name, company)
`.trim();

type PaymentReviewRow = Record<string, unknown> & {
  id: string;
  created_by_id?: string | null;
  last_refunded_by_id?: string | null;
};

async function enrichPaymentRows(
  admin: AdminClient,
  rows: PaymentReviewRow[],
) {
  const creatorIds = [
    ...new Set(
      rows.flatMap((r) => [r.created_by_id, r.last_refunded_by_id].filter(Boolean)),
    ),
  ] as string[];
  const { data: profiles } = creatorIds.length
    ? await admin.from("user_profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((row) => ({
    ...row,
    created_by: row.created_by_id
      ? { id: row.created_by_id, full_name: nameMap[row.created_by_id] ?? null }
      : null,
    last_refunded_by: row.last_refunded_by_id
      ? { id: row.last_refunded_by_id, full_name: nameMap[row.last_refunded_by_id] ?? null }
      : null,
  }));
}

type LatestRefundRow = {
  ticket_id: string;
  method: string;
  source: string;
  payment_mode: string;
};

async function enrichRefundedPaymentRows(
  admin: AdminClient,
  rows: PaymentReviewRow[],
) {
  const base = await enrichPaymentRows(admin, rows);
  const ticketIds = base.map((r) => r.id).filter(Boolean);
  if (!ticketIds.length) return base;

  const { data: refundRows, error } = await admin
    .from("ticket_payment_refunds")
    .select("ticket_id, method, source, payment_mode, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const latestByTicket = new Map<string, LatestRefundRow>();
  for (const r of (refundRows ?? []) as LatestRefundRow[]) {
    if (!latestByTicket.has(r.ticket_id)) {
      latestByTicket.set(r.ticket_id, r);
    }
  }

  return base.map((row) => {
    const latest = latestByTicket.get(row.id);
    return {
      ...row,
      last_refund_method: latest?.method ?? null,
      last_refund_source: latest?.source ?? null,
      last_refund_payment_mode: latest?.payment_mode ?? null,
    };
  });
}

export async function fetchPendingPaymentOrders(admin: AdminClient) {
  let query = admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .not("payment_evidence_submitted_at", "is", null)
    .is("payment_evidence_reviewed_at", null)
    .or("payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null");
  query = excludeRefundedTickets(query);
  const { data, error } = await query
    .in("ticket_status", [...PAYMENT_REVIEW_STATUSES])
    .order("payment_evidence_submitted_at", { ascending: true });

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return enrichPaymentRows(admin, rows);
}

export async function fetchApprovedPaymentOrders(admin: AdminClient) {
  let query = admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .not("payment_evidence_submitted_at", "is", null)
    .not("payment_evidence_reviewed_at", "is", null)
    .or("payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null");
  query = excludeRefundedTickets(query);
  const { data, error } = await query
    .in("ticket_status", [...PAYMENT_REVIEW_STATUSES])
    .order("payment_evidence_reviewed_at", { ascending: false });

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return enrichPaymentRows(admin, rows);
}

export async function fetchRefundedPaymentOrders(admin: AdminClient) {
  const { data, error } = await admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .in("refund_status", ["partial", "full"])
    .in("ticket_status", [...PAYMENT_REFUNDED_STATUSES])
    .order("last_refunded_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return enrichRefundedPaymentRows(admin, rows);
}

export async function fetchPaymentsPageData(admin: AdminClient) {
  const [pending, approved, refunded] = await Promise.all([
    fetchPendingPaymentOrders(admin),
    fetchApprovedPaymentOrders(admin),
    fetchRefundedPaymentOrders(admin),
  ]);
  return {
    orders: pending,
    approvedOrders: approved,
    refundedOrders: refunded,
    counts: {
      pending: pending.length,
      approved: approved.length,
      refunded: refunded.length,
    },
  };
}
