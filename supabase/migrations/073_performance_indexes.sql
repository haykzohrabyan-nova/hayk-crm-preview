-- Phase 1 performance indexes (read-only — no data changes)

CREATE INDEX IF NOT EXISTS job_tickets_payment_evidence_pending_idx
  ON job_tickets (ticket_status)
  WHERE payment_evidence_url IS NOT NULL AND payment_paid_at IS NULL;

CREATE INDEX IF NOT EXISTS job_tickets_in_production_released_idx
  ON job_tickets (production_released_at DESC)
  WHERE ticket_status = 'in_production';

CREATE INDEX IF NOT EXISTS leads_prev_status_idx
  ON leads (prev_status) WHERE prev_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_tickets_order_status_idx
  ON job_tickets (created_at DESC)
  WHERE ticket_status IN ('order', 'cancelled');
