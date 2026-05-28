-- Routed quotes: Sales must SELECT ticket_status = 'routed' for Supabase Realtime
-- (API already returns these via service role; browser Realtime uses RLS per subscriber).
-- Also fix admin_read_all_tickets to use inline EXISTS (current_user_role() is SECURITY DEFINER → Realtime drops events).

DROP POLICY IF EXISTS "sales_read_routed_tickets" ON public.job_tickets;
CREATE POLICY "sales_read_routed_tickets" ON public.job_tickets
  FOR SELECT USING (
    ticket_status = 'routed'
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.name = 'sales'
    )
  );

DROP POLICY IF EXISTS "admin_read_all_tickets" ON public.job_tickets;
CREATE POLICY "admin_read_all_tickets" ON public.job_tickets
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Realtime prerequisites (idempotent for DBs that only ran early migrations)
ALTER TABLE public.activities REPLICA IDENTITY FULL;
ALTER TABLE public.job_tickets REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.job_tickets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT ON public.activities TO authenticated;
GRANT SELECT ON public.job_tickets TO authenticated;
