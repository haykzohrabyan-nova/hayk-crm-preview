-- Add prepayment_status to job_tickets
-- Tracks whether the deposit/prepayment has been collected
-- 'pending' = not yet paid, 'paid' = deposit collected
-- Future: Stripe webhook will flip this to 'paid' automatically

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS prepayment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (prepayment_status IN ('pending', 'paid'));
