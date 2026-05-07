create table public.user_profiles (
  id                    uuid        primary key references auth.users(id) on delete cascade,
  role_id               uuid        not null references public.roles(id),
  full_name             text,
  avatar_url            text,
  is_active             boolean     not null default true,
  must_change_password  boolean     not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
