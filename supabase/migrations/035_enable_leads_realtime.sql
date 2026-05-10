-- Enable Supabase Realtime on the leads table.
-- REPLICA IDENTITY FULL ensures UPDATE and DELETE events include the full old row,
-- not just the primary key — required for Supabase Realtime postgres_changes.
ALTER TABLE public.leads REPLICA IDENTITY FULL;

-- Add leads to the supabase_realtime publication so the Realtime service
-- starts broadcasting INSERT / UPDATE / DELETE events to subscribed clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
