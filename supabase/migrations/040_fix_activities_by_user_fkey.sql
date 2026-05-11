-- Fix activities.by_user_id FK so Supabase can join user_profiles inline.
--
-- Current:  activities.by_user_id → auth.users(id)
-- Problem:  Supabase's schema cache has no direct relationship between
--           activities and user_profiles, so the embedded select
--           "by_user:user_profiles!activities_by_user_id_fkey" throws
--           "Could not find a relationship between 'activities' and 'user_profiles'".
--
-- Fix:      Re-point the FK to public.user_profiles(id).
--           user_profiles.id = auth.users.id (PK mirrors auth), so all
--           existing data remains consistent.  ON DELETE SET NULL keeps
--           activity rows safe if a profile is ever deleted.

alter table public.activities
  drop constraint if exists activities_by_user_id_fkey;

alter table public.activities
  add constraint activities_by_user_id_fkey
  foreign key (by_user_id)
  references public.user_profiles(id)
  on delete set null;
