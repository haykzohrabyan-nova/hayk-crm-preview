-- Grant default page access per system role.
-- Admin gets all pages automatically via a check in proxy.ts (role name = 'admin').

-- SDR pages
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'sdr'
  and p.route in ('/dashboard', '/leads', '/crm', '/tickets', '/statistics', '/settings')
on conflict do nothing;

-- Sales pages
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'sales'
  and p.route in ('/dashboard', '/sales', '/crm', '/tickets', '/statistics', '/settings')
on conflict do nothing;

-- Admin gets all pages
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'admin'
on conflict do nothing;
