-- ─────────────────────────────────────────────
-- Helper functions
-- ─────────────────────────────────────────────

create or replace function public.current_user_role()
returns text
language sql stable security definer
as $$
  select r.name
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  where up.id = auth.uid()
$$;

create or replace function public.user_can_access_route(route_path text)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.role_permissions rp on rp.role_id = up.role_id
    join public.pages p on p.id = rp.page_id
    where up.id = auth.uid()
      and p.route = route_path
  )
$$;

-- ─────────────────────────────────────────────
-- roles
-- ─────────────────────────────────────────────

create policy "authenticated_read_roles" on public.roles
  for select using (auth.uid() is not null);

create policy "admin_write_roles" on public.roles
  for all using (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────
-- pages
-- ─────────────────────────────────────────────

create policy "authenticated_read_pages" on public.pages
  for select using (auth.uid() is not null);

create policy "admin_write_pages" on public.pages
  for all using (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────
-- role_permissions
-- ─────────────────────────────────────────────

create policy "authenticated_read_role_permissions" on public.role_permissions
  for select using (auth.uid() is not null);

create policy "admin_write_role_permissions" on public.role_permissions
  for all using (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────
-- user_profiles
-- ─────────────────────────────────────────────

create policy "users_read_own_profile" on public.user_profiles
  for select using (id = auth.uid());

create policy "admin_read_all_profiles" on public.user_profiles
  for select using (public.current_user_role() = 'admin');

create policy "admin_update_profiles" on public.user_profiles
  for update using (public.current_user_role() = 'admin');

create policy "users_update_own_profile" on public.user_profiles
  for update using (id = auth.uid());

-- ─────────────────────────────────────────────
-- customers
-- ─────────────────────────────────────────────

create policy "authenticated_read_customers" on public.customers
  for select using (auth.uid() is not null);

create policy "sdr_admin_write_customers" on public.customers
  for all using (public.current_user_role() in ('sdr', 'admin'));

-- ─────────────────────────────────────────────
-- leads
-- ─────────────────────────────────────────────

create policy "sdr_read_all_leads" on public.leads
  for select using (public.current_user_role() = 'sdr');

create policy "sales_read_routed_leads" on public.leads
  for select using (
    public.current_user_role() = 'sales'
    and (status = 'Routed to Sales' or sales_owner_id = auth.uid())
  );

create policy "admin_read_all_leads" on public.leads
  for select using (public.current_user_role() = 'admin');

create policy "sdr_admin_insert_leads" on public.leads
  for insert with check (public.current_user_role() in ('sdr', 'admin'));

create policy "authenticated_update_leads" on public.leads
  for update using (auth.uid() is not null);

-- ─────────────────────────────────────────────
-- job_tickets
-- ─────────────────────────────────────────────

create policy "authenticated_read_tickets" on public.job_tickets
  for select using (auth.uid() is not null);

create policy "authenticated_insert_tickets" on public.job_tickets
  for insert with check (auth.uid() is not null);

create policy "owner_admin_update_tickets" on public.job_tickets
  for update using (
    created_by_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- activities
-- ─────────────────────────────────────────────

create policy "authenticated_read_activities" on public.activities
  for select using (auth.uid() is not null);

create policy "authenticated_insert_activities" on public.activities
  for insert with check (auth.uid() is not null);

-- ─────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────

create policy "users_read_own_notifications" on public.notifications
  for select using (user_id = auth.uid());

create policy "users_update_own_notifications" on public.notifications
  for update using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- lookup_values
-- ─────────────────────────────────────────────

create policy "authenticated_read_lookup_values" on public.lookup_values
  for select using (auth.uid() is not null);

create policy "admin_write_lookup_values" on public.lookup_values
  for all using (public.current_user_role() = 'admin');
