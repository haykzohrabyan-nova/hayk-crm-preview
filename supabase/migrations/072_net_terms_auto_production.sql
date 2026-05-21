-- Backfill: net-terms quotes sent without client confirmation should already be in production.
-- Safe to re-run: only touches rows still in sent/order with no production release.

UPDATE job_tickets
SET
  ticket_status          = 'in_production',
  ticket_kind            = 'order',
  production_released_at = COALESCE(production_released_at, NOW()),
  client_confirmed       = CASE
    WHEN ticket_require_client_confirm IS FALSE THEN TRUE
    ELSE client_confirmed
  END,
  payment_status         = COALESCE(payment_status, 'unpaid'),
  updated_at             = NOW()
WHERE ticket_payment_strategy = 'net'
  AND production_released_at IS NULL
  AND ticket_status IN ('sent', 'order')
  AND (
    ticket_require_client_confirm IS FALSE
    OR client_confirmed IS TRUE
  );
