-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP — removes all test data inserted by 026_seed_test_leads.sql
-- Run this in Supabase SQL Editor when testing is done.
-- ─────────────────────────────────────────────────────────────────────────────

-- Delete test leads first (FK constraint: leads → customers)
delete from public.leads
where customer_id in (
  select id from public.customers where company like '[TEST]%'
);

-- Delete any activities logged against test customers
delete from public.activities
where customer_id in (
  select id from public.customers where company like '[TEST]%'
);

-- Delete test customers
delete from public.customers
where company like '[TEST]%';
