-- Add payment_status to job_tickets
-- Values: 'unpaid' (default), 'partial', 'paid'

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
