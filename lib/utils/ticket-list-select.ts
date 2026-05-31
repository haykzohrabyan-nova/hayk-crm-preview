/** Slim column sets for ticket list APIs — no quote_skus, notes, or payment-config blobs. */

import { PAYMENT_EVIDENCE_PENDING_OR_FILTER } from "@/lib/utils/payment-evidence-pending";

export const QUOTE_LIST_STATUSES = ["draft", "sent", "approved", "routed"] as const;

export const TICKET_QUOTE_LIST_SELECT = `
  id,
  ticket_kind,
  ticket_status,
  title,
  reference_code,
  quote_channel,
  quote_final_total,
  client_confirmed,
  ticket_require_client_confirm,
  ticket_payment_strategy,
  ticket_deposit_type,
  ticket_deposit_value,
  payment_evidence_url,
  payment_evidence_submitted_at,
  payment_evidence_reviewed_at,
  stripe_payment_intent_id,
  payment_paid_at,
  deposit_paid_at,
  payment_amount_received,
  prepayment_type,
  prepayment_value,
  quote_reminder_date,
  created_at,
  updated_at,
  created_by_id,
  routed_by_id,
  customer:customers(id, first_name, last_name, company)
`.trim();

export const ORDERS_PAYMENT_EVIDENCE_PENDING_FILTER = PAYMENT_EVIDENCE_PENDING_OR_FILTER;
