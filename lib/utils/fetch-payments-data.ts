import type { createAdminClient } from "@/lib/supabase/admin";
import { countExact } from "@/lib/utils/db-counts";
import { excludeRefundedTickets } from "@/lib/utils/exclude-refunded-tickets";
import { filterPaymentEvidenceRows } from "@/lib/utils/filter-payment-evidence-rows";
import { filterTaxExemptRows } from "@/lib/utils/filter-tax-exempt-rows";
import type { PaginationParams } from "@/lib/utils/pagination";
import { jobTicketCustomerEmbed } from "@/lib/utils/ticket-list-select";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PaymentsPageTab = "pending" | "tax_exempt" | "approved" | "refunded";

const PAYMENT_REVIEW_STATUSES = ["sent", "order", "in_production", "completed"] as const;

/** Refunded tab — includes cancelled orders (refund audit trail outlives cancel). */
const PAYMENT_REFUNDED_STATUSES = [
  ...PAYMENT_REVIEW_STATUSES,
  "cancelled",
] as const;

const PAYMENT_REVIEW_SELECT = `
  id, reference_code, title, created_at, contact_name, contact_email, public_token,
  ticket_quote_channel, ticket_dest_email, ticket_dest_phone,
  quote_final_total,
  payment_method_used,
  deposit_method,
  balance_paid_at,
  payment_evidence_url,
  payment_evidence_submitted_at,
  payment_evidence_reviewed_at,
  payment_evidence_resubmit_requested_at,
  payment_evidence_resubmit_received_at,
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
  tax_exempt,
  sales_permit_number,
  sales_permit_file_name,
  sales_permit_storage_path,
  sales_permit_submitted_at,
  sales_permit_reviewed_at,
  sales_permit_resubmit_requested_at,
  sales_permit_resubmit_received_at,
  sales_permit_resubmit_token,
  quote_pre_tax_total,
  quote_tax_rate_percent,
  quote_tax_amount,
  refund_status,
  total_refunded_amount,
  last_refunded_at,
  last_refunded_by_id,
  ${jobTicketCustomerEmbed("first_name, last_name, company, email, phone")}
`.trim();

type PaymentReviewRow = Record<string, unknown> & {
  id: string;
  created_by_id?: string | null;
  last_refunded_by_id?: string | null;
};

type EnrichedPaymentRow = Awaited<ReturnType<typeof enrichPaymentRows>>[number];

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

function slicePage<T>(rows: T[], pagination: PaginationParams): { rows: T[]; total: number } {
  const total = rows.length;
  const { offset, limit } = pagination;
  return { rows: rows.slice(offset, offset + limit), total };
}

function filterPaymentsTabRows(
  tab: PaymentsPageTab,
  rows: EnrichedPaymentRow[],
  search: string,
): EnrichedPaymentRow[] {
  if (!search.trim()) return rows;
  return tab === "tax_exempt"
    ? filterTaxExemptRows(rows, search)
    : filterPaymentEvidenceRows(rows, search);
}

function pendingPaymentEvidenceQuery(
  admin: AdminClient,
  selectOpts?: { count: "exact" },
) {
  let query = admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT, selectOpts)
    .not("payment_evidence_submitted_at", "is", null)
    .is("payment_evidence_reviewed_at", null)
    .or("payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null");
  query = excludeRefundedTickets(query);
  return query.in("ticket_status", [...PAYMENT_REVIEW_STATUSES]);
}

export async function fetchPendingPaymentOrders(admin: AdminClient) {
  const { data, error } = await pendingPaymentEvidenceQuery(admin).order(
    "payment_evidence_submitted_at",
    { ascending: true },
  );
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return enrichPaymentRows(admin, rows);
}

async function fetchPendingPaymentOrdersPaged(
  admin: AdminClient,
  pagination: PaginationParams,
): Promise<{ rows: EnrichedPaymentRow[]; total: number }> {
  const { data, count, error } = await pendingPaymentEvidenceQuery(admin, { count: "exact" })
    .order("payment_evidence_submitted_at", { ascending: true })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return {
    rows: await enrichPaymentRows(admin, rows),
    total: count ?? 0,
  };
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

async function fetchRefundedPaymentOrdersPaged(
  admin: AdminClient,
  pagination: PaginationParams,
): Promise<{ rows: EnrichedPaymentRow[]; total: number }> {
  const { data, count, error } = await admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT, { count: "exact" })
    .in("refund_status", ["partial", "full"])
    .in("ticket_status", [...PAYMENT_REFUNDED_STATUSES])
    .order("last_refunded_at", { ascending: false, nullsFirst: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return {
    rows: await enrichRefundedPaymentRows(admin, rows),
    total: count ?? 0,
  };
}

function pendingTaxExemptBaseQuery(admin: AdminClient) {
  let query = admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .eq("tax_exempt", true)
    .is("sales_permit_reviewed_at", null);
  query = excludeRefundedTickets(query);
  return query.in("ticket_status", [...PAYMENT_REVIEW_STATUSES]);
}

async function loadPendingTaxExemptMerged(admin: AdminClient) {
  const [withFileRes, legacyRes] = await Promise.all([
    pendingTaxExemptBaseQuery(admin)
      .not("sales_permit_storage_path", "is", null)
      .order("sales_permit_submitted_at", { ascending: true, nullsFirst: false }),
    pendingTaxExemptBaseQuery(admin)
      .is("sales_permit_storage_path", null)
      .not("sales_permit_number", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  if (withFileRes.error) throw withFileRes.error;
  if (legacyRes.error) throw legacyRes.error;

  const byId = new Map<string, PaymentReviewRow>();
  for (const row of [
    ...(Array.isArray(withFileRes.data) ? (withFileRes.data as unknown as PaymentReviewRow[]) : []),
    ...(Array.isArray(legacyRes.data) ? (legacyRes.data as unknown as PaymentReviewRow[]) : []),
  ]) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => {
    const aMs =
      Date.parse(String(a.sales_permit_submitted_at ?? "")) ||
      Date.parse(String(a.created_at ?? "")) ||
      0;
    const bMs =
      Date.parse(String(b.sales_permit_submitted_at ?? "")) ||
      Date.parse(String(b.created_at ?? "")) ||
      0;
    return aMs - bMs;
  });
}

export async function fetchPendingTaxExemptOrders(admin: AdminClient) {
  const rows = await loadPendingTaxExemptMerged(admin);
  return enrichPaymentRows(admin, rows);
}

export async function fetchApprovedTaxExemptOrders(admin: AdminClient) {
  let query = admin
    .from("job_tickets")
    .select(PAYMENT_REVIEW_SELECT)
    .eq("tax_exempt", true)
    .not("sales_permit_storage_path", "is", null)
    .not("sales_permit_reviewed_at", "is", null);
  query = excludeRefundedTickets(query);
  const { data, error } = await query
    .in("ticket_status", [...PAYMENT_REVIEW_STATUSES])
    .order("sales_permit_reviewed_at", { ascending: false });

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as unknown as PaymentReviewRow[]) : [];
  return enrichPaymentRows(admin, rows);
}

function mergeApprovedPaymentRows(
  paymentRows: PaymentReviewRow[],
  taxExemptRows: PaymentReviewRow[],
): PaymentReviewRow[] {
  const byId = new Map<string, PaymentReviewRow>();
  for (const row of paymentRows) byId.set(row.id, row);
  for (const row of taxExemptRows) {
    const prev = byId.get(row.id);
    byId.set(row.id, prev ? { ...prev, ...row } : row);
  }
  return [...byId.values()].sort((a, b) => {
    const aMs = Math.max(
      Date.parse(String(a.payment_evidence_reviewed_at ?? "")) || 0,
      Date.parse(String(a.sales_permit_reviewed_at ?? "")) || 0,
    );
    const bMs = Math.max(
      Date.parse(String(b.payment_evidence_reviewed_at ?? "")) || 0,
      Date.parse(String(b.sales_permit_reviewed_at ?? "")) || 0,
    );
    return bMs - aMs;
  });
}

async function countPendingTaxExempt(admin: AdminClient): Promise<number> {
  const [withFile, legacy] = await Promise.all([
    countExact(admin, "job_tickets", (q) =>
      excludeRefundedTickets(
        q
          .eq("tax_exempt", true)
          .is("sales_permit_reviewed_at", null)
          .not("sales_permit_storage_path", "is", null)
          .in("ticket_status", [...PAYMENT_REVIEW_STATUSES]),
      ),
    ),
    countExact(admin, "job_tickets", (q) =>
      excludeRefundedTickets(
        q
          .eq("tax_exempt", true)
          .is("sales_permit_reviewed_at", null)
          .is("sales_permit_storage_path", null)
          .not("sales_permit_number", "is", null)
          .in("ticket_status", [...PAYMENT_REVIEW_STATUSES]),
      ),
    ),
  ]);
  return withFile + legacy;
}

async function countApprovedMerged(admin: AdminClient): Promise<number> {
  const [paymentRes, taxRes] = await Promise.all([
    admin
      .from("job_tickets")
      .select("id")
      .not("payment_evidence_submitted_at", "is", null)
      .not("payment_evidence_reviewed_at", "is", null)
      .or("payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null")
      .in("ticket_status", [...PAYMENT_REVIEW_STATUSES]),
    admin
      .from("job_tickets")
      .select("id")
      .eq("tax_exempt", true)
      .not("sales_permit_storage_path", "is", null)
      .not("sales_permit_reviewed_at", "is", null)
      .in("ticket_status", [...PAYMENT_REVIEW_STATUSES]),
  ]);
  if (paymentRes.error) throw paymentRes.error;
  if (taxRes.error) throw taxRes.error;
  const ids = new Set<string>();
  for (const row of paymentRes.data ?? []) ids.add(row.id as string);
  for (const row of taxRes.data ?? []) ids.add(row.id as string);
  return ids.size;
}

export async function fetchPaymentsTabCounts(admin: AdminClient) {
  const [pending, tax_exempt, approved, refunded] = await Promise.all([
    countExact(admin, "job_tickets", (q) =>
      excludeRefundedTickets(
        q
          .not("payment_evidence_submitted_at", "is", null)
          .is("payment_evidence_reviewed_at", null)
          .or("payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null")
          .in("ticket_status", [...PAYMENT_REVIEW_STATUSES]),
      ),
    ),
    countPendingTaxExempt(admin),
    countApprovedMerged(admin),
    countExact(admin, "job_tickets", (q) =>
      q.in("refund_status", ["partial", "full"]).in("ticket_status", [...PAYMENT_REFUNDED_STATUSES]),
    ),
  ]);
  return { pending, tax_exempt, approved, refunded };
}

async function fetchPaymentsListForTab(
  admin: AdminClient,
  tab: PaymentsPageTab,
  options: { search?: string; pagination: PaginationParams },
): Promise<{ rows: EnrichedPaymentRow[]; total: number }> {
  const search = options.search?.trim() ?? "";
  const { pagination } = options;

  if (tab === "pending") {
    if (search) {
      const all = await fetchPendingPaymentOrders(admin);
      const filtered = filterPaymentsTabRows(tab, all, search);
      return slicePage(filtered, pagination);
    }
    return fetchPendingPaymentOrdersPaged(admin, pagination);
  }

  if (tab === "refunded") {
    if (search) {
      const all = await fetchRefundedPaymentOrders(admin);
      const filtered = filterPaymentsTabRows(tab, all, search);
      return slicePage(filtered, pagination);
    }
    return fetchRefundedPaymentOrdersPaged(admin, pagination);
  }

  if (tab === "tax_exempt") {
    const raw = await loadPendingTaxExemptMerged(admin);
    const enriched = await enrichPaymentRows(admin, raw);
    const filtered = filterPaymentsTabRows(tab, enriched, search);
    return slicePage(filtered, pagination);
  }

  const [paymentApproved, taxExemptApproved] = await Promise.all([
    fetchApprovedPaymentOrders(admin),
    fetchApprovedTaxExemptOrders(admin),
  ]);
  const merged = mergeApprovedPaymentRows(
    paymentApproved as unknown as PaymentReviewRow[],
    taxExemptApproved as unknown as PaymentReviewRow[],
  );
  const enriched = await enrichPaymentRows(admin, merged);
  const filtered = filterPaymentsTabRows(tab, enriched, search);
  return slicePage(filtered, pagination);
}

export async function fetchPaymentsPageData(
  admin: AdminClient,
  tab: PaymentsPageTab,
  options: { search?: string; pagination: PaginationParams },
) {
  const [{ rows, total }, counts] = await Promise.all([
    fetchPaymentsListForTab(admin, tab, options),
    fetchPaymentsTabCounts(admin),
  ]);

  const base = {
    counts,
    tab,
    total,
    orders: [] as EnrichedPaymentRow[],
    taxExemptOrders: [] as EnrichedPaymentRow[],
    approvedOrders: [] as EnrichedPaymentRow[],
    refundedOrders: [] as EnrichedPaymentRow[],
  };
  if (tab === "pending") base.orders = rows;
  else if (tab === "tax_exempt") base.taxExemptOrders = rows;
  else if (tab === "approved") base.approvedOrders = rows;
  else base.refundedOrders = rows;
  return base;
}
