-- Add designer field to ticket_line_items
-- Stores the assigned designer name per line item; defaults to 'Unassigned'.

alter table public.ticket_line_items
  add column if not exists designer text not null default 'Unassigned';

-- Seed designer lookup values
insert into public.lookup_values (category, value, label, sort_order, is_active)
values
  ('designer', 'unassigned',  'Unassigned',  0, true),
  ('designer', 'har_unusyan', 'Har Unusyan',  1, true),
  ('designer', 'marianna',    'Marianna',      2, true),
  ('designer', 'christopher', 'Christopher',   3, true),
  ('designer', 'taron',       'Taron',         4, true),
  ('designer', 'hayk',        'Hayk',          5, true)
on conflict (category, value) do nothing;
