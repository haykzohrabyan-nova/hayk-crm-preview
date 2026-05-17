-- ─────────────────────────────────────────────────────────────────────────────
-- 057 — User session tracking table
--
-- One row per login session. Populated by:
--   • POST /api/auth/session { action: "start" }  — after MFA verify
--   • POST /api/auth/session { action: "end", reason: "manual"|"auto" }
--
-- Duration is computed at query time (signed_out_at - signed_in_at) so it is
-- always accurate for sessions still in progress.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_sessions (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  signed_in_at      timestamptz not null default now(),
  signed_out_at     timestamptz,
  sign_out_reason   text        check (sign_out_reason in ('manual', 'auto', 'deactivated', 'unknown')),
  created_at        timestamptz not null default now()
);

create index if not exists user_sessions_user_id_idx      on public.user_sessions(user_id);
create index if not exists user_sessions_signed_in_at_idx on public.user_sessions(signed_in_at desc);

-- RLS
alter table public.user_sessions enable row level security;

-- Users can only read their own sessions
create policy "users_read_own_sessions" on public.user_sessions
  for select using (auth.uid() = user_id);

-- Users can insert their own session start rows
create policy "users_insert_own_sessions" on public.user_sessions
  for insert with check (auth.uid() = user_id);

-- Users can update their own session rows (to set signed_out_at)
create policy "users_update_own_sessions" on public.user_sessions
  for update using (auth.uid() = user_id);
