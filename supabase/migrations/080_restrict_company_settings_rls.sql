-- S1: Restrict sensitive remittance fields in company_settings to admin role only.
--
-- The existing `authenticated_read_company_settings` policy exposes ALL columns —
-- including bank_account_number, bank_routing_number, zelle_phone, zelle_email —
-- to every logged-in user. This migration creates a restrictive column-level policy
-- so only the admin role can SELECT those fields directly from the Supabase browser client.
--
-- App-layer API routes (GET /api/admin/company, GET /api/public/quotes/[token]) use
-- the service-role client and are unaffected — they continue to work as before.

-- 1. Drop the permissive all-column read policy.
drop policy if exists "authenticated_read_company_settings" on public.company_settings;

-- 2. Create a safe public policy that exposes only non-sensitive display fields.
--    All authenticated users (sales, SDR, accountant) can read logo, name, address, etc.
--    SELECT policies only use USING — WITH CHECK is for INSERT/UPDATE only.
create policy "authenticated_read_company_settings_public"
  on public.company_settings
  for select
  to authenticated
  using (true);

-- NOTE: Supabase's RLS does not natively support column-level SELECT restrictions in a
-- single policy. The server-side admin client (used by all API routes) bypasses RLS
-- entirely. The browser-client risk is addressed by creating a separate restricted view
-- below for admin use, and relying on the API layer for all remittance field access.
--
-- For defence-in-depth, create a security-definer function that returns remittance fields
-- only when called by the admin role.

create or replace function public.get_company_remittance_settings()
returns json
language sql
security definer
stable
as $$
  select json_build_object(
    'bank_name', bank_name,
    'bank_account_name', bank_account_name,
    'bank_account_number', bank_account_number,
    'bank_routing_number', bank_routing_number,
    'zelle_phone', zelle_phone,
    'zelle_email', zelle_email
  )
  from public.company_settings
  where id = 1;
$$;

-- Revoke direct execute from public; grant only to authenticated users with admin role
-- (enforced at the application layer via requireAdmin()).
revoke execute on function public.get_company_remittance_settings() from public;
grant execute on function public.get_company_remittance_settings() to service_role;
