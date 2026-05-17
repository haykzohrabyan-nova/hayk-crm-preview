-- ─────────────────────────────────────────────────────────────────
-- 055_reset_tickets_for_testing.sql
-- DEV / TESTING ONLY — clears all quotes and orders so you can
-- start fresh. Also resets the ORD-YYYY-NNN sequence counter and
-- un-"Won" any leads that were marked Won by ticket conversion.
-- ─────────────────────────────────────────────────────────────────

-- 1. Delete all ticket-related activities
DELETE FROM public.activities
WHERE ticket_id IS NOT NULL;

-- 2. Delete all job tickets (quotes + orders)
DELETE FROM public.job_tickets;

-- 3. Reset the order sequence counter so next order is ORD-2026-001
DELETE FROM public.order_sequence_counters;

-- 4. Reset leads that were marked "Won" or "Quoted" by the ticket flow
--    back to their previous working state so they can be re-quoted.
UPDATE public.leads
SET
  sales_status = CASE
    WHEN sales_status = 'Won' THEN 'Ongoing'
    ELSE sales_status
  END,
  status = CASE
    WHEN status = 'Quoted' THEN 'Validated'
    ELSE status
  END
WHERE sales_status = 'Won' OR status = 'Quoted';
