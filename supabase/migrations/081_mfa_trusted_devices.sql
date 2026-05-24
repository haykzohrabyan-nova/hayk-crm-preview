-- Trusted devices — skip 2FA verify for 30 days when user checks "Remember me"
create table if not exists public.mfa_trusted_devices (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  token_hash   text        not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists mfa_trusted_devices_user_id_idx
  on public.mfa_trusted_devices (user_id);

create index if not exists mfa_trusted_devices_expires_at_idx
  on public.mfa_trusted_devices (expires_at);

comment on table public.mfa_trusted_devices is
  'Browser trust tokens — allows skipping TOTP verify for up to 30 days per device.';

alter table public.mfa_trusted_devices enable row level security;
-- No policies: accessed only via service role in Route Handlers and proxy.
