-- ─────────────────────────────────────────────────────────────────────────────
-- 076_full_test_reset.sql
-- DEV / TESTING ONLY — database wipe (run in Supabase SQL Editor).
--
-- ⚠️  Storage files CANNOT be deleted via SQL (Supabase blocks direct
--     storage.objects deletes). Clear uploaded payment proofs first:
--
--     node --env-file=.env.local scripts/full-test-reset.mjs
--
--     Or run this SQL only if you have no files in the payment-evidence bucket.
--
-- DELETES:   activities, notifications, job_tickets, leads, customers,
--            user_sessions
-- RESETS:    order_sequence_counters, quote_sequence_counters
-- PRESERVES: users, roles, company_settings, products, lookup_values
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM public.activities;
DELETE FROM public.notifications;
DELETE FROM public.job_tickets;
DELETE FROM public.order_sequence_counters;
DELETE FROM public.quote_sequence_counters;
DELETE FROM public.leads;
DELETE FROM public.customers;
DELETE FROM public.user_sessions;
