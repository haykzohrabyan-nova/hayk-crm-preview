create table public.roles (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null unique,
  display_name  text        not null,
  is_system     boolean     not null default false,
  created_at    timestamptz not null default now()
);
