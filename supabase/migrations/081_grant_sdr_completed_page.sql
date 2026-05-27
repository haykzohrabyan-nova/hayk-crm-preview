-- Grant SDR nav access to quotes, orders, and completed (list data scoped in app layer).
-- Idempotent: safe on prod where SDR may already have these rows (ON CONFLICT DO NOTHING).
-- Does not include /settings — that route was removed from public.pages (migration 025);
-- personal profile uses /profile (universal, not role_permissions-gated).

insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'sdr'
  and p.route in ('/quotes', '/orders', '/completed')
on conflict do nothing;
