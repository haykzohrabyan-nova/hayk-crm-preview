-- Stripe refund tracking on job_tickets

ALTER TABLE job_tickets
  ADD COLUMN IF NOT EXISTS stripe_amount_refunded_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_last_refund_reason text,
  ADD COLUMN IF NOT EXISTS stripe_last_refund_notes text,
  ADD COLUMN IF NOT EXISTS stripe_last_refunded_at timestamptz;
