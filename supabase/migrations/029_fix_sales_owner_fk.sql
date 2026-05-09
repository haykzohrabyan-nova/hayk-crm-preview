-- Re-point leads.sales_owner_id → public.user_profiles(id)
-- Previously referenced auth.users(id) which prevented PostgREST from
-- auto-joining user profile data. user_profiles.id is the same UUID as
-- auth.users.id so no data changes are needed.

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_sales_owner_id_fkey,
  ADD CONSTRAINT leads_sales_owner_id_fkey
    FOREIGN KEY (sales_owner_id)
    REFERENCES public.user_profiles(id)
    ON DELETE SET NULL;
