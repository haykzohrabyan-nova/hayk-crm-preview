-- SDR manual quote routing — reason admin-managed via lookup_values (route_reason)

alter table public.job_tickets
  add column if not exists routed_reason text,
  add column if not exists routed_notes text;

insert into public.lookup_values (category, value, label, sort_order)
values
  ('route_reason', 'large_volume',          'Unusually Large Volume',         0),
  ('route_reason', 'complex_dimensions',    'Complex Custom Dimensions',      1),
  ('route_reason', 'vip_client',            'High-Value VIP Client',          2),
  ('route_reason', 'technical_support',     'Requires Technical Support',     3),
  ('route_reason', 'out_of_box',            'Out of Box request',             4),
  ('route_reason', 'pricing_negotiation',   'Pricing negotiation expected',   5),
  ('route_reason', 'customer_wants_sales',  'Customer requested Sales rep',   6),
  ('route_reason', 'needs_custom_quote',    'Needs custom quote from Sales',  7),
  ('route_reason', 'other',                 'Other',                          8)
on conflict (category, value) do nothing;
