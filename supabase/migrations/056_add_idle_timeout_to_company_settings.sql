-- ─────────────────────────────────────────────────────────────────────────────
-- 056 — Add session_idle_timeout_minutes to company_settings
--
-- Admin-configurable idle sign-out timer. All authenticated users can read it
-- (RLS already allows this). Only admin can update it.
-- Default: 20 minutes.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.company_settings
  add column if not exists session_idle_timeout_minutes integer not null default 20
    check (session_idle_timeout_minutes >= 5 and session_idle_timeout_minutes <= 480);
