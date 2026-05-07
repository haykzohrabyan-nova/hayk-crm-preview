-- Development seed: test users and sample leads.
-- DO NOT run in production.
--
-- First admin user profile (UUID from Supabase Auth → Users tab)
-- Run this AFTER all 001–020 migrations have been applied.

insert into public.user_profiles (id, role_id, full_name, is_active, must_change_password)
select '0dba7e8e-6b34-4c6f-9a62-59fb0f78026e', r.id, 'Admin', true, false
from public.roles r where r.name = 'admin'
on conflict (id) do nothing;


00f6fe20-a730-454e-ae63-841d66c8a67b