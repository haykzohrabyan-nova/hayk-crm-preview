insert into public.roles (name, display_name, is_system) values
  ('sdr',   'SDR',           true),
  ('sales', 'Sales Rep',     true),
  ('admin', 'Administrator', true)
on conflict (name) do nothing;
