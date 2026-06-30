-- RBAC catalog update — Key Account sales rep (2026-07-01)
-- Seeds permissions for future requirePermission() wiring. Enforcement remains roleName checks today.
-- See docs/rbac-migration/plan.md and docs/reference/rbac.md

insert into public.permissions (key, display_name, area, description, sort_order) values
(
  'crm.assign_key_account',
  'Assign Key Account sales rep',
  'crm',
  'PATCH /api/customers/[id] — set or clear customers.key_account_sales_rep_id (Admin only today)',
  25
),
(
  'leads.route_to_key_account',
  'Route new lead to Key Account holder',
  'leads',
  'POST /api/leads/manual with route_to_key_account=true — create lead as Routed to Sales + Claimed for customer Key Account rep',
  105
)
on conflict (key) do update set
  display_name = excluded.display_name,
  area = excluded.area,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Clarify existing keys touched by Key Account flows
update public.permissions
set description = 'Set status = Routed to Sales via PATCH /api/leads/[id] — Key Account pre-select + auto-assign when active'
where key = 'leads.route_to_sales';

update public.permissions
set description = 'PATCH /api/customers/[id] — contact fields (Key Account rep requires crm.assign_key_account)'
where key = 'crm.edit';

update public.permissions
set description = 'POST /api/leads/[id]/reassign — admin reassign; Key Account hint on Sales reassign modal'
where key = 'leads.reassign';

-- SDR — Route to Key Account Holder shortcut (Add Lead modal)
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'sdr'
  and p.key = 'leads.route_to_key_account'
on conflict do nothing;

-- Admin — new catalog keys (admin role also receives all keys on fresh installs via schema seed)
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'admin'
  and p.key in ('crm.assign_key_account', 'leads.route_to_key_account')
on conflict do nothing;
