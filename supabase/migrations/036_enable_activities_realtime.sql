-- Enable Supabase Realtime on the activities table.
-- The admin activity log auto-updates live as actions happen across the app.
ALTER TABLE public.activities REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
