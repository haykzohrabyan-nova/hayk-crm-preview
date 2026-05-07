create table public.lookup_values (
  id          uuid        primary key default gen_random_uuid(),
  category    text        not null,
  value       text        not null,
  label       text        not null,
  sort_order  int         not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  unique (category, value)
);
