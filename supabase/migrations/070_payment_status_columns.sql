-- ─────────────────────────────────────────────────────────────────────────────
-- 070 — Ensure payment_status + prepayment_status exist on job_tickets
--
-- Migrations 053 and 054 added these columns but may not have been applied
-- to all environments. Code in production/orders, production/counts, and
-- maybeAutoRecordCashPayment depends on payment_status.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

-- Add check constraint only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_tickets_payment_status_check'
  ) THEN
    ALTER TABLE public.job_tickets
      ADD CONSTRAINT job_tickets_payment_status_check
      CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
  END IF;
END $$;

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS prepayment_status text NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_tickets_prepayment_status_check'
  ) THEN
    ALTER TABLE public.job_tickets
      ADD CONSTRAINT job_tickets_prepayment_status_check
      CHECK (prepayment_status IN ('pending', 'paid'));
  END IF;
END $$;

-- Backfill: tickets with a deposit recorded should show partial, not unpaid
UPDATE public.job_tickets
SET
  payment_status    = 'partial',
  prepayment_status = 'paid'
WHERE deposit_paid_at IS NOT NULL
  AND payment_paid_at IS NULL
  AND payment_status = 'unpaid';

-- Backfill: fully paid tickets
UPDATE public.job_tickets
SET payment_status = 'paid'
WHERE payment_paid_at IS NOT NULL
  AND payment_status IN ('unpaid', 'partial');

COMMENT ON COLUMN public.job_tickets.payment_status
  IS 'Overall payment state: unpaid | partial | paid';
COMMENT ON COLUMN public.job_tickets.prepayment_status
  IS 'Deposit collected flag: pending | paid';
