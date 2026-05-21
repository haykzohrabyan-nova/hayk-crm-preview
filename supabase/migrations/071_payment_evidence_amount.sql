-- ─────────────────────────────────────────────────────────────────────────────
-- 071 — Customer-claimed amount on payment evidence submission
--
-- When a customer uploads wire / ACH / Zelle / check / card proof, we store the
-- amount they claim here until an accountant confirms via record_payment.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS payment_evidence_amount NUMERIC;

COMMENT ON COLUMN public.job_tickets.payment_evidence_amount
  IS 'Amount the customer claimed when submitting payment evidence; cleared after accountant confirmation';

-- Fix tickets that were auto-marked paid on evidence submit (before accountant review)
UPDATE public.job_tickets
SET
  payment_paid_at         = NULL,
  balance_paid_at         = NULL,
  payment_status          = CASE WHEN deposit_paid_at IS NOT NULL THEN 'partial' ELSE 'unpaid' END,
  payment_amount_received = CASE
    WHEN deposit_paid_at IS NOT NULL THEN COALESCE(deposit_amount, 0)
    ELSE 0
  END
WHERE payment_evidence_url IS NOT NULL
  AND payment_evidence_submitted_at IS NOT NULL
  AND payment_paid_at IS NOT NULL
  AND production_released_at IS NULL
  AND payment_method_used IN ('wire', 'ach', 'zelle', 'check', 'card');
