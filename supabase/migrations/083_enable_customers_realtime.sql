-- Enable Supabase Realtime on customers so CRM list updates across sessions.

ALTER TABLE public.customers REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
