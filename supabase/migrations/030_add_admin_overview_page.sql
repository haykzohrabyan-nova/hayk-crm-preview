-- Add a dedicated admin Overview page.
-- sort_order = -1 so it appears before Dashboard (0) in the nav.
-- Only admin role gets access; SDR/sales are blocked by proxy role_permissions check.

insert into public.pages (route, display_name, icon, section, sort_order)
values ('/overview', 'Overview', 'LayoutDashboard', 'main', -1)
on conflict (route) do nothing;

-- Grant admin role access
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'admin'
  and p.route = '/overview'
on conflict do nothing;
