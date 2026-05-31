-- When an order/quote was cancelled (set on PATCH cancel; backfill from activities optional).
ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
