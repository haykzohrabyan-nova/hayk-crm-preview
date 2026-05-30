-- Security hardening (May 2026 audit): RLS gaps, company_settings, RPC lockdown.

-- ── 1. ticket_shipping_destinations — enable RLS, deny direct client access ───
alter table public.ticket_shipping_destinations enable row level security;

-- No policies: all access via service-role Route Handlers only.

-- ── 2. company_settings — remove permissive authenticated SELECT ─────────────
drop policy if exists "authenticated_read_company_settings_public" on public.company_settings;
drop policy if exists "authenticated_read_company_settings" on public.company_settings;

-- Admin-only SELECT for defence-in-depth (app uses service role for reads).
do $$ begin
  create policy "admin_read_company_settings" on public.company_settings
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'admin'
      )
    );
exception when duplicate_object then null; end $$;

-- ── 3. customers — CRM roles only ────────────────────────────────────────────
drop policy if exists "authenticated_read_customers" on public.customers;
drop policy if exists "sdr_admin_write_customers" on public.customers;

do $$ begin
  create policy "crm_roles_read_customers" on public.customers
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name in ('sdr', 'sales', 'admin')
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "crm_roles_write_customers" on public.customers
    for all
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name in ('sdr', 'sales', 'admin')
      )
    )
    with check (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name in ('sdr', 'sales', 'admin')
      )
    );
exception when duplicate_object then null; end $$;

-- ── 4. leads — scoped UPDATE (replace any-auth UPDATE) ───────────────────────
drop policy if exists "authenticated_update_leads" on public.leads;

do $$ begin
  create policy "admin_update_all_leads" on public.leads
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'admin'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sdr_update_leads" on public.leads
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'sdr'
      )
      and (
        sdr_id = auth.uid()
        or locked_by_id = auth.uid()
        or locked_by_id is null
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sales_update_leads" on public.leads
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'sales'
      )
      and (
        sales_owner_id = auth.uid()
        or (status = 'Routed to Sales' and sales_owner_id is null)
      )
    );
exception when duplicate_object then null; end $$;

-- ── 5. activities — staff roles only (not open to all authenticated) ───────────
drop policy if exists "authenticated_read_activities" on public.activities;

do $$ begin
  create policy "staff_read_activities" on public.activities
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid()
          and r.name in ('sdr', 'sales', 'admin', 'accountant')
      )
    );
exception when duplicate_object then null; end $$;

-- ── 6. Sequence RPCs — service role only ─────────────────────────────────────
revoke all on function public.increment_order_sequence(int) from public, anon, authenticated;
revoke all on function public.increment_quote_sequence(int) from public, anon, authenticated;
grant execute on function public.increment_order_sequence(int) to service_role;
grant execute on function public.increment_quote_sequence(int) to service_role;

-- ── 7. user_profiles_with_role — respect underlying RLS ───────────────────────
create or replace view public.user_profiles_with_role
with (security_invoker = true) as
  select
    up.id,
    up.role_id,
    up.full_name,
    up.avatar_url,
    up.is_active,
    up.must_change_password,
    up.mfa_required,
    up.created_at,
    up.updated_at,
    r.name          as role_name,
    r.display_name  as role_display_name,
    r.is_system     as role_is_system
  from public.user_profiles up
  join public.roles r on r.id = up.role_id;
