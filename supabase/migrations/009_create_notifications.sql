create table public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text,
  read        boolean     not null default false,
  payload     jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);
