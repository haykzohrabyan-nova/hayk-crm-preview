-- ─────────────────────────────────────────────────────────────────────────────
-- 067_full_reset_for_testing.sql
-- DEV / TESTING ONLY — wipes all operational data so you can start fresh.
--
-- DELETES:   leads, customers, job_tickets, activities, user_sessions
-- RESETS:    order_sequence_counters → next order will be ORD-2026-001
-- PRESERVES: users, roles, company_settings, products catalog, lookup_values,
--            role_permissions, pages
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Activities first (FK references leads, tickets, customers)
DELETE FROM public.activities;

-- 2. Job tickets (quotes + orders)
DELETE FROM public.job_tickets;

-- 3. Reset order sequence so next order is ORD-YYYY-001
DELETE FROM public.order_sequence_counters;

-- 4. Leads (FK references customers)
DELETE FROM public.leads;

-- 5. Customers
DELETE FROM public.customers;

-- 6. User sessions (login history — safe to wipe for a clean test run)
DELETE FROM public.user_sessions;
