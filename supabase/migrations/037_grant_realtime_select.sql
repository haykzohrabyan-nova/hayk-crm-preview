-- Supabase Realtime postgres_changes requires explicit SELECT grants on tables
-- for the authenticated role. Without this, Realtime silently drops all events
-- even when the WebSocket is connected (SUBSCRIBED) and RLS policies exist.
--
-- Supabase normally sets these via ALTER DEFAULT PRIVILEGES, but our tables were
-- created via raw SQL migrations which may not have picked up those defaults.
GRANT SELECT ON public.leads TO authenticated;
GRANT SELECT ON public.activities TO authenticated;
