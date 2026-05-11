-- Fix: Supabase Realtime silently drops events when RLS policies use SECURITY DEFINER
-- functions. In the Realtime evaluation context, SECURITY DEFINER functions run as
-- their owner (postgres), where auth.uid() cannot read request.jwt.claims and returns
-- NULL — causing every subscriber's RLS check to fail and every event to be dropped.
--
-- The fix: replace current_user_role() calls in leads SELECT policies with inline
-- EXISTS subqueries. These run in the caller's security context where auth.uid()
-- correctly resolves to the subscriber's user ID from the JWT claims.

DROP POLICY IF EXISTS "admin_read_all_leads"     ON public.leads;
DROP POLICY IF EXISTS "sdr_read_all_leads"        ON public.leads;
DROP POLICY IF EXISTS "sales_read_routed_leads"   ON public.leads;

-- Admin: sees all leads
CREATE POLICY "admin_read_all_leads" ON public.leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid()
        AND r.name = 'admin'
    )
  );

-- SDR: sees all leads (own filtering is done at the API layer)
CREATE POLICY "sdr_read_all_leads" ON public.leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid()
        AND r.name = 'sdr'
    )
  );

-- Sales: only sees leads routed to sales or assigned to them
CREATE POLICY "sales_read_routed_leads" ON public.leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.id = auth.uid()
        AND r.name = 'sales'
    )
    AND (status = 'Routed to Sales' OR sales_owner_id = auth.uid())
  );
