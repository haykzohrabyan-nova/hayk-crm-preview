-- Quote / order cancellation reasons (admin-managed lookup_values) + ticket audit fields.

alter table public.job_tickets
  add column if not exists cancel_reason       text,
  add column if not exists cancel_reason_label text,
  add column if not exists cancel_notes        text;

insert into public.lookup_values (category, value, label, sort_order) values
  ('quote_cancel_reason', 'quote_customer_requested', 'Customer requested cancellation', 0),
  ('quote_cancel_reason', 'quote_duplicate',          'Duplicate quote',                 1),
  ('quote_cancel_reason', 'quote_pricing_issue',      'Pricing did not work',            2),
  ('quote_cancel_reason', 'quote_timeline_issue',     'Timeline / lead time issue',      3),
  ('quote_cancel_reason', 'quote_other',              'Other',                           4),
  ('order_cancel_reason', 'order_customer_requested', 'Customer requested cancellation', 0),
  ('order_cancel_reason', 'order_no_payment',         'No payment received',             1),
  ('order_cancel_reason', 'order_created_in_error',   'Order created in error',          2),
  ('order_cancel_reason', 'order_scope_change',       'Timeline / scope change',         3),
  ('order_cancel_reason', 'order_other',              'Other',                           4)
on conflict (category, value) do nothing;
