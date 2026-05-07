create table public.pages (
  id            uuid        primary key default gen_random_uuid(),
  route         text        not null unique,
  display_name  text        not null,
  icon          text,
  section       text        not null default 'main',
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now()
);
