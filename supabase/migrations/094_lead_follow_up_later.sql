-- SDR "Follow Up Later" queue — reasons admin-managed via lookup_values (follow_up_reason)

alter table public.leads
  add column if not exists follow_up_reason text,
  add column if not exists follow_up_notes text,
  add column if not exists follow_up_until timestamptz,
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_by_id uuid references auth.users(id);

insert into public.lookup_values (category, value, label, sort_order)
values
  ('follow_up_reason', 'callback_requested',     'Customer asked to call back later', 0),
  ('follow_up_reason', 'awaiting_decision',      'Awaiting decision / budget',        1),
  ('follow_up_reason', 'wrong_time_to_reach',    'Wrong time — try again later',      2),
  ('follow_up_reason', 'left_voicemail',         'Left voicemail — follow up',        3),
  ('follow_up_reason', 'other',                  'Other',                             4)
on conflict (category, value) do nothing;
