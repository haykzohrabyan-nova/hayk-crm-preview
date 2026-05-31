-- Stripe Checkout evidence on job_tickets (Phase C)

ALTER TABLE job_tickets
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_status text,
  ADD COLUMN IF NOT EXISTS stripe_amount_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_card_brand text,
  ADD COLUMN IF NOT EXISTS stripe_card_last4 text,
  ADD COLUMN IF NOT EXISTS stripe_receipt_url text,
  ADD COLUMN IF NOT EXISTS stripe_customer_email text;

CREATE UNIQUE INDEX IF NOT EXISTS job_tickets_stripe_checkout_session_id_key
  ON job_tickets (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_tickets_stripe_payment_intent_id_idx
  ON job_tickets (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
