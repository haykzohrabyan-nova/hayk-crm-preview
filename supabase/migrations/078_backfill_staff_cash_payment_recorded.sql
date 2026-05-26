-- Backfill ticket_payment_recorded for staff auto-recorded cash/offline deposits.
-- Before May 2026 these logged ticket_payment_evidence_submitted (wrong type for
-- confirmed cash) so Reports / dashboard cash totals were understated.
--
-- Skips public-payment evidence rows awaiting accountant review (via = public_payment).
-- Skips rows that already have a matching ticket_payment_recorded for the same ticket + amount.

INSERT INTO public.activities (
  type,
  lead_id,
  customer_id,
  ticket_id,
  by_user_id,
  payload,
  created_at
)
SELECT
  'ticket_payment_recorded',
  a.lead_id,
  a.customer_id,
  a.ticket_id,
  a.by_user_id,
  jsonb_build_object(
    'mode',
    CASE
      WHEN COALESCE((a.payload->>'amount')::numeric, 0) >= COALESCE(t.quote_final_total, 0) - 0.01 THEN 'full'
      ELSE 'deposit'
    END,
    'method', COALESCE(a.payload->>'method', 'cash'),
    'amount', (a.payload->>'amount')::numeric,
    'receipt_id', a.payload->>'receipt_id',
    'new_total', (a.payload->>'amount')::numeric,
    'fully_paid',
    COALESCE((a.payload->>'amount')::numeric, 0) >= COALESCE(t.quote_final_total, 0) - 0.01,
    'via', 'staff_cash_auto_backfill'
  ),
  a.created_at
FROM public.activities a
JOIN public.job_tickets t ON t.id = a.ticket_id
WHERE a.type = 'ticket_payment_evidence_submitted'
  AND COALESCE(a.payload->>'via', '') <> 'public_payment'
  AND COALESCE((a.payload->>'has_file')::boolean, false) = false
  AND NULLIF(TRIM(a.payload->>'receipt_id'), '') IS NOT NULL
  AND COALESCE((a.payload->>'amount')::numeric, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.activities pr
    WHERE pr.type = 'ticket_payment_recorded'
      AND pr.ticket_id = a.ticket_id
      AND ABS(COALESCE((pr.payload->>'amount')::numeric, 0) - COALESCE((a.payload->>'amount')::numeric, 0)) < 0.02
  );
