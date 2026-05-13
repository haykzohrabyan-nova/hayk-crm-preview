-- ─────────────────────────────────────────────────────────────────────────────
-- 047 — Enable Realtime on job_tickets
--
-- Required for the sidebar's "tickets-realtime" channel to broadcast
-- INSERT/UPDATE events to connected browsers so the quote/order pages
-- can silently refresh without polling.
--
-- Two steps (same pattern as migrations 035 and 036 for leads/activities):
--   1. REPLICA IDENTITY FULL — ensures UPDATE events include the full old row,
--      not just the primary key. Required for Supabase Realtime payloads.
--   2. ADD TABLE to the supabase_realtime publication — opt-in to broadcasting.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.job_tickets REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.job_tickets;
