-- Per-user MFA requirement (admin can disable 2FA for specific users)
alter table public.user_profiles
  add column if not exists mfa_required boolean not null default true;

comment on column public.user_profiles.mfa_required is
  'When false, user may access the app after password login without TOTP setup/verify.';

-- Refresh convenience view (must DROP first — CREATE OR REPLACE cannot insert columns mid-list)
drop view if exists public.user_profiles_with_role;

create view public.user_profiles_with_role as
  select
    up.id,
    up.role_id,
    up.full_name,
    up.avatar_url,
    up.is_active,
    up.must_change_password,
    up.mfa_required,
    up.created_at,
    up.updated_at,
    r.name          as role_name,
    r.display_name  as role_display_name,
    r.is_system     as role_is_system
  from public.user_profiles up
  join public.roles r on r.id = up.role_id;
