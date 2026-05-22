/** Slim column sets for ticket list APIs — no quote_skus, notes, or payment-config blobs. */

export const QUOTE_LIST_STATUSES = ["draft", "sent", "approved", "routed"] as const;

export const TICKET_QUOTE_LIST_SELECT = `
  id,
  ticket_kind,
  ticket_status,
  title,
  reference_code,
  quote_channel,
  quote_final_total,
  quote_reminder_date,
  created_at,
  updated_at,
  created_by_id,
  routed_by_id,
  customer:customers(id, first_name, last_name, company)
`.trim();

export const ORDERS_PAYMENT_EVIDENCE_PENDING_FILTER =
  "payment_evidence_submitted_at.not.is.null,payment_evidence_url.not.is.null,payment_paid_at.is.null";
