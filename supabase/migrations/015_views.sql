-- Convenience view: user profile joined with role info
-- Used throughout the app to avoid repetitive joins
create or replace view public.user_profiles_with_role as
  select
    up.id,
    up.role_id,
    up.full_name,
    up.avatar_url,
    up.is_active,
    up.must_change_password,
    up.created_at,
    up.updated_at,
    r.name          as role_name,
    r.display_name  as role_display_name,
    r.is_system     as role_is_system
  from public.user_profiles up
  join public.roles r on r.id = up.role_id;
