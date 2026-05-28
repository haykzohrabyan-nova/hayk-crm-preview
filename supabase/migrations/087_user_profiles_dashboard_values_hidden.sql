-- Per-user dashboard privacy: when true, KPI APIs omit numeric values server-side.

alter table public.user_profiles
  add column if not exists dashboard_values_hidden boolean not null default false;

comment on column public.user_profiles.dashboard_values_hidden is
  'When true, dashboard KPI routes redact numeric metrics for this user (screen-sharing privacy).';
