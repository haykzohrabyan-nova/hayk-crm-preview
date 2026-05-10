-- ─────────────────────────────────────────────────────────────────────────────
-- 033_reset_leads_to_pending.sql
-- Reset all leads to their original "Pending / inbox" state for testing.
--
-- PRESERVED  : id, customer_id, source, brand, authority, interests,
--              quantities, urgency, is_returning_customer, sdr_comment,
--              quote_total, quote_channel, quote_destination,
--              created_at, updated_at
--
-- CLEARED    : status → Pending, is_inbox → true, sales_status,
--              prev_status, prev_sales_status,
--              sdr_id, assigned_sdr_id, sales_owner_id,
--              held_by_id, locked_by_id, locked_at,
--              hold_reason, hold_notes, hold_until, held_at,
--              rejection_reason, rejection_notes
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE leads
SET
  status             = 'Pending',
  is_inbox           = true,
  sales_status       = NULL,
  prev_status        = NULL,
  prev_sales_status  = NULL,
  sdr_id             = NULL,
  assigned_sdr_id    = NULL,
  sales_owner_id     = NULL,
  held_by_id         = NULL,
  locked_by_id       = NULL,
  locked_at          = NULL,
  hold_reason        = NULL,
  hold_notes         = NULL,
  hold_until         = NULL,
  held_at            = NULL,
  rejection_reason   = NULL,
  rejection_notes    = NULL,
  updated_at         = now();

-- Also clear activities so the timeline starts fresh
TRUNCATE activities;
